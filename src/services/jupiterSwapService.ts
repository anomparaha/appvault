import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import { invoke } from "@tauri-apps/api/core";
import { Buffer } from "buffer";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

const JUPITER_API_ENDPOINTS = [
  "https://public.jupiterapi.com",
  "https://api.jup.ag/swap/v1",
];

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: any[];
  contextSlot?: number;
  timeTaken?: number;
  error?: string;
}

export async function fetchJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountRaw: string,
  slippageBps: number = 250,
): Promise<JupiterQuoteResponse> {
  // 1. Try native Rust command first (immune to webview CORS & CSP blocks)
  try {
    const raw = await invoke<string>("jupiter_get_quote", {
      inputMint,
      outputMint,
      amountRaw,
      slippageBps,
    });
    const data: JupiterQuoteResponse = JSON.parse(raw);
    if (!data.error) {
      return data;
    }
  } catch (_nativeErr) {
    // Fall back to web fetch
  }

  // 2. Web fetch fallback
  let lastErr = "Failed to fetch quote from Jupiter API";

  for (const base of JUPITER_API_ENDPOINTS) {
    try {
      const url = `${base}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${slippageBps}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        lastErr = `Jupiter quote error (${res.status}): ${text}`;
        continue;
      }
      const data: JupiterQuoteResponse = await res.json();
      if (data.error) {
        lastErr = data.error;
        continue;
      }
      return data;
    } catch (err) {
      lastErr = String(err);
    }
  }

  throw new Error(lastErr);
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
  swapInstruction: RawInstruction;
  cleanupInstruction?: RawInstruction | null;
  addressLookupTableAddresses?: string[];
  error?: string;
}

function deserializeInstruction(ix: RawInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

/**
 * Builds a Stealth DEX Sell Versioned Message:
 * 1. userPublicKey is the sub-wallet (owns the token, signs swap authorization).
 * 2. payer is the fee payer wallet (sponsors gas and signature fees).
 * 3. CRITICAL STEALTH REDIRECT: cleanupInstruction.accounts[1] (native SOL destination)
 *    is modified to point to masterRecipientAddress!
 * 4. Sub-wallet never touches or holds the incoming SOL!
 */
export async function buildStealthDexSellMessage(
  quote: JupiterQuoteResponse,
  subWalletAddress: string,
  feePayerAddress: string,
  masterRecipientAddress: string,
  rpcUrl: string = "https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9",
): Promise<{ messageBase64: string; estimatedSolOut: string; rawOutLamports: string }> {
  let instructionsData: SwapInstructionsResponse | null = null;
  let lastErr = "Failed to fetch swap-instructions";

  const cleanedQuote = { ...quote };
  delete (cleanedQuote as any).platformFee;

  const swapPayload = JSON.stringify({
    quoteResponse: cleanedQuote,
    userPublicKey: subWalletAddress,
    payer: feePayerAddress,
    wrapAndUnwrapSol: true,
  });

  // 1. Try native Rust command first (immune to webview CORS / CSP blocks)
  try {
    const raw = await invoke<string>("jupiter_get_swap_instructions", {
      payloadJson: swapPayload,
    });
    const parsed: SwapInstructionsResponse = JSON.parse(raw);
    if (!parsed.error) {
      instructionsData = parsed;
    }
  } catch (_nativeErr) {
    // Fall back to web fetch
  }

  // 2. Web fetch fallback
  if (!instructionsData) {
    for (const base of JUPITER_API_ENDPOINTS) {
      try {
        const res = await fetch(`${base}/swap-instructions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: swapPayload,
        });

        if (!res.ok) {
          lastErr = `Jupiter swap-instructions error (${res.status}): ${await res.text()}`;
          continue;
        }

        const data: SwapInstructionsResponse = await res.json();
        if (data.error) {
          lastErr = data.error;
          continue;
        }

        instructionsData = data;
        break;
      } catch (err) {
        lastErr = String(err);
      }
    }
  }

  if (!instructionsData) {
    throw new Error(lastErr);
  }

  // Stealth Redirect: Redirect SOL output directly into the Master Recipient Vault!
  if (instructionsData.cleanupInstruction && instructionsData.cleanupInstruction.accounts.length >= 2) {
    instructionsData.cleanupInstruction.accounts[1].pubkey = masterRecipientAddress.trim();
  }

  const allIxs: TransactionInstruction[] = [
    ...(instructionsData.computeBudgetInstructions || []).map(deserializeInstruction),
    ...(instructionsData.setupInstructions || []).map(deserializeInstruction),
    deserializeInstruction(instructionsData.swapInstruction),
    ...(instructionsData.cleanupInstruction ? [deserializeInstruction(instructionsData.cleanupInstruction)] : []),
  ];

  const connection = new Connection(rpcUrl, "confirmed");

  // Fetch address lookup table accounts
  const altAddresses = instructionsData.addressLookupTableAddresses || [];
  const altAccounts = await Promise.all(
    altAddresses.map(async (addr) => {
      try {
        const res = await connection.getAddressLookupTable(new PublicKey(addr));
        return res.value;
      } catch {
        return null;
      }
    }),
  );

  let blockhash: string;
  try {
    blockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  } catch (_bhErr) {
    blockhash = await invoke<string>("get_solana_recent_blockhash");
  }

  const msgV0 = new TransactionMessage({
    payerKey: new PublicKey(feePayerAddress),
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message(altAccounts.filter((x): x is AddressLookupTableAccount => x !== null));

  const serialized = msgV0.serialize();
  const messageBase64 = Buffer.from(serialized).toString("base64");
  const estimatedSolOut = (Number(quote.outAmount) / 1e9).toFixed(6);

  return {
    messageBase64,
    estimatedSolOut,
    rawOutLamports: quote.outAmount,
  };
}

/**
 * Builds a DEX Buy Versioned Message (SOL -> Target Token):
 * 1. userPublicKey is the sub-wallet (pays SOL, receives token into ATA).
 * 2. payer is the fee payer wallet (sponsors gas and signature fees, or userPublicKey if self-paying).
 * 3. destinationTokenAccount is optional (if provided, token goes to recipient's ATA; otherwise sub-wallet's ATA).
 */
export async function buildDexBuyMessage(
  quote: JupiterQuoteResponse,
  buyerWalletAddress: string,
  feePayerAddress: string,
  destinationAta?: string,
  rpcUrl: string = "https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9",
): Promise<{ messageBase64: string; estimatedTokensOut: string; rawOutTokens: string }> {
  let instructionsData: SwapInstructionsResponse | null = null;
  let lastErr = "Failed to fetch swap-instructions";

  const cleanedQuote = { ...quote };
  delete (cleanedQuote as any).platformFee;

  const swapPayloadObj: any = {
    quoteResponse: cleanedQuote,
    userPublicKey: buyerWalletAddress,
    payer: feePayerAddress,
    wrapAndUnwrapSol: true,
  };
  if (destinationAta) {
    swapPayloadObj.destinationTokenAccount = destinationAta;
  }
  const swapPayload = JSON.stringify(swapPayloadObj);

  // 1. Try native Rust command first (immune to webview CORS / CSP blocks)
  try {
    const raw = await invoke<string>("jupiter_get_swap_instructions", {
      payloadJson: swapPayload,
    });
    const parsed: SwapInstructionsResponse = JSON.parse(raw);
    if (!parsed.error) {
      instructionsData = parsed;
    }
  } catch (_nativeErr) {
    // Fall back to web fetch
  }

  // 2. Web fetch fallback
  if (!instructionsData) {
    for (const base of JUPITER_API_ENDPOINTS) {
      try {
        const res = await fetch(`${base}/swap-instructions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: swapPayload,
        });

        if (!res.ok) {
          lastErr = `Jupiter swap-instructions error (${res.status}): ${await res.text()}`;
          continue;
        }

        const data: SwapInstructionsResponse = await res.json();
        if (data.error) {
          lastErr = data.error;
          continue;
        }

        instructionsData = data;
        break;
      } catch (err) {
        lastErr = String(err);
      }
    }
  }

  if (!instructionsData) {
    throw new Error(lastErr);
  }

  const allIxs: TransactionInstruction[] = [
    ...(instructionsData.computeBudgetInstructions || []).map(deserializeInstruction),
    ...(instructionsData.setupInstructions || []).map(deserializeInstruction),
    deserializeInstruction(instructionsData.swapInstruction),
    ...(instructionsData.cleanupInstruction ? [deserializeInstruction(instructionsData.cleanupInstruction)] : []),
  ];

  const connection = new Connection(rpcUrl, "confirmed");

  // Fetch address lookup table accounts
  const altAddresses = instructionsData.addressLookupTableAddresses || [];
  const altAccounts = await Promise.all(
    altAddresses.map(async (addr) => {
      try {
        const res = await connection.getAddressLookupTable(new PublicKey(addr));
        return res.value;
      } catch {
        return null;
      }
    }),
  );

  let blockhash: string;
  try {
    blockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  } catch (_bhErr) {
    blockhash = await invoke<string>("get_solana_recent_blockhash");
  }

  const msgV0 = new TransactionMessage({
    payerKey: new PublicKey(feePayerAddress),
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message(altAccounts.filter((x): x is AddressLookupTableAccount => x !== null));

  const serialized = msgV0.serialize();
  const messageBase64 = Buffer.from(serialized).toString("base64");

  return {
    messageBase64,
    estimatedTokensOut: quote.outAmount,
    rawOutTokens: quote.outAmount,
  };
}

