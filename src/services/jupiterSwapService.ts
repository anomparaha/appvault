import {
  AddressLookupTableAccount,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import { invoke } from "@tauri-apps/api/core";
import { Buffer } from "buffer";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const DEFAULT_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
export const JUPITER_V6_PROGRAM_ID = new PublicKey(
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
);

export interface SolanaMintInfo {
  decimals: number;
  tokenProgramId: string;
}

const mintInfoCache = new Map<string, SolanaMintInfo>();

export function findAssociatedTokenAddress(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey,
  tokenProgramId: PublicKey = DEFAULT_TOKEN_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [walletAddress.toBuffer(), tokenProgramId.toBuffer(), tokenMintAddress.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function requireSessionToken(sessionToken: string): void {
  if (!sessionToken?.trim()) {
    throw new Error("Unlock the vault before requesting Solana DEX or mint data.");
  }
}

export async function getSolanaMintInfo(
  sessionToken: string,
  mint: string,
): Promise<SolanaMintInfo> {
  requireSessionToken(sessionToken);
  const normalizedMint = mint.trim();
  // Validate before using a cache key or passing the address to the native RPC command.
  new PublicKey(normalizedMint);
  const cached = mintInfoCache.get(normalizedMint);
  if (cached) return cached;

  const info = await invoke<SolanaMintInfo>("get_solana_mint_info", {
    sessionToken,
    mint: normalizedMint,
  });
  if (
    !Number.isInteger(info?.decimals) || info.decimals < 0 || info.decimals > 255 ||
    (info.tokenProgramId !== DEFAULT_TOKEN_PROGRAM_ID.toBase58() &&
      info.tokenProgramId !== TOKEN_2022_PROGRAM_ID.toBase58())
  ) {
    throw new Error("Solana RPC returned unsupported SPL mint metadata.");
  }
  mintInfoCache.set(normalizedMint, info);
  return info;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: unknown;
  priceImpactPct: string;
  routePlan: unknown[];
  contextSlot?: number;
  timeTaken?: number;
  error?: string;
}

export async function fetchJupiterQuote(
  sessionToken: string,
  inputMint: string,
  outputMint: string,
  amountRaw: string,
  slippageBps: number = 250,
): Promise<JupiterQuoteResponse> {
  requireSessionToken(sessionToken);
  const normalizedInputMint = new PublicKey(inputMint).toBase58();
  const normalizedOutputMint = new PublicKey(outputMint).toBase58();
  const maxTokenAmount = 18_446_744_073_709_551_615n;
  if (!/^\d{1,20}$/.test(amountRaw) || BigInt(amountRaw) <= 0n || BigInt(amountRaw) > maxTokenAmount) {
    throw new Error("Swap amount must be a positive u64 integer in base units.");
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new Error("Slippage must be between 0 and 10000 basis points.");
  }

  // Network access stays in the native command so its vault-session and Safe Mode
  // checks cannot be bypassed by a webview fetch fallback.
  const raw = await invoke<string>("jupiter_get_quote", {
    sessionToken,
    inputMint: normalizedInputMint,
    outputMint: normalizedOutputMint,
    amountRaw,
    slippageBps,
  });
  if (typeof raw !== "string" || raw.length > 250_000) {
    throw new Error("Jupiter quote response is invalid or too large.");
  }
  const data = JSON.parse(raw) as JupiterQuoteResponse;
  if (typeof data?.error === "string" && data.error) throw new Error(data.error);
  const validPositiveAmount = (value: unknown): value is string => {
    if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) return false;
    const amount = BigInt(value);
    return amount > 0n && amount <= maxTokenAmount;
  };
  if (
    typeof data?.inputMint !== "string" || typeof data.outputMint !== "string" ||
    new PublicKey(data.inputMint).toBase58() !== normalizedInputMint ||
    new PublicKey(data.outputMint).toBase58() !== normalizedOutputMint ||
    data.inAmount !== amountRaw || data.slippageBps !== slippageBps ||
    data.swapMode !== "ExactIn" ||
    !validPositiveAmount(data.outAmount) ||
    !validPositiveAmount(data.otherAmountThreshold) ||
    BigInt(data.otherAmountThreshold) > BigInt(data.outAmount) ||
    !Array.isArray(data.routePlan) || data.routePlan.length === 0 || data.routePlan.length > 64
  ) {
    throw new Error("Jupiter returned an invalid, mismatched, or empty ExactIn quote.");
  }
  return data;
}

interface RawInstruction {
  programId: string;
  accounts: {
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }[];
  data: string;
}

interface SwapInstructionsResponse {
  tokenLedgerInstruction?: RawInstruction | null;
  computeBudgetInstructions?: RawInstruction[];
  setupInstructions?: RawInstruction[];
  otherInstructions?: RawInstruction[];
  swapInstruction: RawInstruction;
  cleanupInstruction?: RawInstruction | null;
  addressLookupTableAddresses?: string[];
  error?: string;
}

function decodeInstructionData(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Jupiter returned invalid base64 instruction data.");
  }
  return Buffer.from(value, "base64");
}

function deserializeInstruction(ix: RawInstruction): TransactionInstruction {
  if (
    !ix?.programId || !Array.isArray(ix.accounts) || ix.accounts.length > 256 ||
    typeof ix.data !== "string" || ix.data.length > 16_384 ||
    ix.accounts.some((account) =>
      !account || typeof account.pubkey !== "string" ||
      typeof account.isSigner !== "boolean" || typeof account.isWritable !== "boolean"
    )
  ) {
    throw new Error("Jupiter returned a malformed instruction.");
  }
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: decodeInstructionData(ix.data),
  });
}

async function fetchSwapInstructions(
  sessionToken: string,
  payloadJson: string,
): Promise<SwapInstructionsResponse> {
  requireSessionToken(sessionToken);
  const raw = await invoke<string>("jupiter_get_swap_instructions", {
    sessionToken,
    payloadJson,
  });
  const data = JSON.parse(raw) as SwapInstructionsResponse;
  if (data.error) throw new Error(data.error);
  if (!data.swapInstruction) throw new Error("Jupiter returned no swap instruction.");
  return data;
}

function validateJupiterSwapInstruction(data: SwapInstructionsResponse, expectedWritableAccount?: string): void {
  const swap = deserializeInstruction(data.swapInstruction);
  if (!swap.programId.equals(JUPITER_V6_PROGRAM_ID)) {
    throw new Error("Jupiter returned an unexpected top-level swap program.");
  }
  if (expectedWritableAccount) {
    const expected = new PublicKey(expectedWritableAccount);
    if (!swap.keys.some((account) => account.pubkey.equals(expected) && account.isWritable)) {
      throw new Error("Jupiter swap does not write to the selected recipient's token account.");
    }
  }
}

function orderedInstructions(data: SwapInstructionsResponse): TransactionInstruction[] {
  return [
    ...(data.computeBudgetInstructions || []).map(deserializeInstruction),
    ...(data.setupInstructions || []).map(deserializeInstruction),
    ...(data.tokenLedgerInstruction ? [deserializeInstruction(data.tokenLedgerInstruction)] : []),
    ...(data.otherInstructions || []).map(deserializeInstruction),
    deserializeInstruction(data.swapInstruction),
    ...(data.cleanupInstruction ? [deserializeInstruction(data.cleanupInstruction)] : []),
  ];
}

async function fetchAddressLookupTables(
  sessionToken: string,
  addresses: string[],
): Promise<AddressLookupTableAccount[]> {
  requireSessionToken(sessionToken);
  if (addresses.length > 32) throw new Error("Jupiter returned too many address lookup tables.");
  return Promise.all(addresses.map(async (address) => {
    const key = new PublicKey(address);
    const encoded = await invoke<string>("get_solana_address_lookup_table", {
      sessionToken,
      address: key.toBase58(),
    });
    const accountData = Buffer.from(encoded, "base64");
    const state = AddressLookupTableAccount.deserialize(accountData);
    return new AddressLookupTableAccount({ key, state });
  }));
}

async function compileVersionedMessage(
  sessionToken: string,
  feePayerAddress: string,
  instructions: TransactionInstruction[],
  lookupTableAddresses: string[] = [],
): Promise<string> {
  requireSessionToken(sessionToken);
  const lookupTables = await fetchAddressLookupTables(sessionToken, lookupTableAddresses);
  const recentBlockhash = await invoke<string>("get_solana_recent_blockhash", { sessionToken });
  const message = new TransactionMessage({
    payerKey: new PublicKey(feePayerAddress),
    recentBlockhash,
    instructions,
  }).compileToV0Message(lookupTables);
  return Buffer.from(message.serialize()).toString("base64");
}

function validateAndRedirectWsolClose(
  cleanup: RawInstruction | null | undefined,
  subWalletAddress: string,
  feePayerAddress: string,
  recipientAddress: string,
): void {
  if (!cleanup) {
    throw new Error("Jupiter did not return a WSOL close instruction; refusing an unverified sell redirect.");
  }
  const subWallet = new PublicKey(subWalletAddress).toBase58();
  const feePayer = new PublicKey(feePayerAddress).toBase58();
  const recipient = new PublicKey(recipientAddress).toBase58();
  if (!Array.isArray(cleanup.accounts) || cleanup.accounts.length < 3) {
    throw new Error("Jupiter cleanup instruction has an invalid account list.");
  }
  const cleanupData = decodeInstructionData(cleanup.data);
  const expectedWsolAta = findAssociatedTokenAddress(
    new PublicKey(subWallet),
    new PublicKey(SOL_MINT),
    DEFAULT_TOKEN_PROGRAM_ID,
  ).toBase58();
  if (
    cleanup.programId !== DEFAULT_TOKEN_PROGRAM_ID.toBase58() ||
    cleanupData.length !== 1 || cleanupData[0] !== 9 ||
    cleanup.accounts[0]?.pubkey !== expectedWsolAta ||
    cleanup.accounts[2]?.pubkey !== subWallet ||
    cleanup.accounts[0]?.isWritable !== true ||
    cleanup.accounts[1]?.isWritable !== true ||
    cleanup.accounts[2]?.isSigner !== true ||
    (cleanup.accounts[1]?.pubkey !== subWallet && cleanup.accounts[1]?.pubkey !== feePayer)
  ) {
    throw new Error("Jupiter cleanup instruction is not the expected wrapped-SOL close for this wallet.");
  }
  cleanup.accounts[1].pubkey = recipient;
}

/**
 * Build a Jupiter sell message and redirect only a verified wrapped-SOL
 * CloseAccount destination to the explicitly selected recipient wallet.
 */
export async function buildStealthDexSellMessage(
  sessionToken: string,
  quote: JupiterQuoteResponse,
  subWalletAddress: string,
  feePayerAddress: string,
  masterRecipientAddress: string,
): Promise<{ messageBase64: string; estimatedSolOut: string; rawOutLamports: string }> {
  if (
    quote.outputMint !== SOL_MINT || !/^\d+$/.test(quote.inAmount) || !/^\d+$/.test(quote.outAmount) ||
    BigInt(quote.inAmount) <= 0n || BigInt(quote.outAmount) <= 0n
  ) {
    throw new Error("Sell quote must contain positive amounts and output wrapped SOL.");
  }
  new PublicKey(quote.inputMint);
  const subWallet = new PublicKey(subWalletAddress).toBase58();
  const feePayer = new PublicKey(feePayerAddress).toBase58();
  const recipient = new PublicKey(masterRecipientAddress).toBase58();
  const cleanedQuote = { ...quote };
  delete (cleanedQuote as Partial<JupiterQuoteResponse>).platformFee;
  const data = await fetchSwapInstructions(sessionToken, JSON.stringify({
    quoteResponse: cleanedQuote,
    userPublicKey: subWallet,
    payer: feePayer,
    wrapAndUnwrapSol: true,
  }));

  validateAndRedirectWsolClose(data.cleanupInstruction, subWallet, feePayer, recipient);
  validateJupiterSwapInstruction(data);
  const instructions = orderedInstructions(data);
  const messageBase64 = await compileVersionedMessage(
    sessionToken,
    feePayer,
    instructions,
    data.addressLookupTableAddresses || [],
  );

  return {
    messageBase64,
    estimatedSolOut: (Number(quote.outAmount) / 1e9).toFixed(6),
    rawOutLamports: quote.outAmount,
  };
}

/**
 * Build a Jupiter buy message. If a destination owner is supplied, the token
 * destination must be that owner's correctly-derived ATA for the mint's actual
 * SPL/Token-2022 program; arbitrary token-account addresses are rejected.
 */
export async function buildDexBuyMessage(
  sessionToken: string,
  quote: JupiterQuoteResponse,
  buyerWalletAddress: string,
  feePayerAddress: string,
  destinationAta?: string,
  destinationOwner?: string,
  tokenProgramId?: string,
): Promise<{ messageBase64: string; estimatedTokensOut: string; rawOutTokens: string }> {
  if (
    quote.inputMint !== SOL_MINT || !/^\d+$/.test(quote.inAmount) || !/^\d+$/.test(quote.outAmount) ||
    BigInt(quote.inAmount) <= 0n || BigInt(quote.outAmount) <= 0n
  ) {
    throw new Error("Buy quote must contain positive amounts and spend wrapped SOL.");
  }
  const buyer = new PublicKey(buyerWalletAddress).toBase58();
  const feePayer = new PublicKey(feePayerAddress).toBase58();
  const mint = new PublicKey(quote.outputMint);
  const hasDestination = Boolean(destinationAta || destinationOwner);
  if (hasDestination && (!destinationAta || !destinationOwner || !tokenProgramId)) {
    throw new Error("A destination owner, derived ATA, and mint token-program id are required together.");
  }

  let ataInstruction: TransactionInstruction | undefined;
  if (hasDestination) {
    const tokenProgram = new PublicKey(tokenProgramId!);
    if (!tokenProgram.equals(DEFAULT_TOKEN_PROGRAM_ID) && !tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new Error("Unsupported token program id for the destination ATA.");
    }
    const owner = new PublicKey(destinationOwner!);
    const expectedAta = findAssociatedTokenAddress(owner, mint, tokenProgram).toBase58();
    if (new PublicKey(destinationAta!).toBase58() !== expectedAta) {
      throw new Error("Destination account is not the associated token account for the selected owner and mint.");
    }
    ataInstruction = new TransactionInstruction({
      keys: [
        { pubkey: new PublicKey(feePayer), isSigner: true, isWritable: true },
        { pubkey: new PublicKey(expectedAta), isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.from([1]), // Associated Token Account CreateIdempotent
    });
  }

  const cleanedQuote = { ...quote };
  delete (cleanedQuote as Partial<JupiterQuoteResponse>).platformFee;
  const swapPayload: Record<string, unknown> = {
    quoteResponse: cleanedQuote,
    userPublicKey: buyer,
    payer: feePayer,
    wrapAndUnwrapSol: true,
  };
  if (destinationAta) swapPayload.destinationTokenAccount = destinationAta;
  const data = await fetchSwapInstructions(sessionToken, JSON.stringify(swapPayload));
  validateJupiterSwapInstruction(data, destinationAta);
  const instructions = orderedInstructions(data);
  if (ataInstruction) instructions.unshift(ataInstruction);

  const messageBase64 = await compileVersionedMessage(
    sessionToken,
    feePayer,
    instructions,
    data.addressLookupTableAddresses || [],
  );
  return {
    messageBase64,
    estimatedTokensOut: quote.outAmount,
    rawOutTokens: quote.outAmount,
  };
}
