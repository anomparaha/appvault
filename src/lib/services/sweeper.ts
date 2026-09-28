import { invoke } from "@tauri-apps/api/core";
import { PublicKey } from "@solana/web3.js";
import { formatEther, parseUnits, toBigInt } from "../utils/format";
import { shortAddr } from "../wallets/wallet";
import {
  SOL_MINT,
  fetchJupiterQuote,
  buildStealthDexSellMessage,
  buildDexBuyMessage,
  findAssociatedTokenAddress,
  getSolanaMintInfo,
} from "../../services/jupiterSwapService";

export interface SolanaAccountDetails {
  exists?: boolean;
  owner?: string;
  account_type?: string;
  authority?: string | null;
  is_system_program?: boolean;
}

export interface SweepChainConfig {
  key: string;
  name: string;
  symbol: string;
  chainId: number;
  explorerUrl: string;
}

export const SWEEP_CHAINS: Record<string, SweepChainConfig> = {
  eth: {
    key: "eth",
    name: "Ethereum",
    symbol: "ETH",
    chainId: 1,
    explorerUrl: "https://etherscan.io/tx/",
  },
  robinhood: {
    key: "robinhood",
    name: "Robinhood",
    symbol: "ETH",
    chainId: 4663,
    explorerUrl: "https://robinhoodchain.blockscout.com/tx/",
  },
  base: {
    key: "base",
    name: "Base",
    symbol: "ETH",
    chainId: 8453,
    explorerUrl: "https://basescan.org/tx/",
  },
  arb: {
    key: "arb",
    name: "Arbitrum",
    symbol: "ETH",
    chainId: 42161,
    explorerUrl: "https://arbiscan.io/tx/",
  },
  bsc: {
    key: "bsc",
    name: "BNB Chain",
    symbol: "BNB",
    chainId: 56,
    explorerUrl: "https://bscscan.com/tx/",
  },
  sol: {
    key: "sol",
    name: "Solana",
    symbol: "SOL",
    chainId: 101,
    explorerUrl: "https://solscan.io/tx/",
  },
};

export interface LiveFeeData {
  gasPriceGwei: number;
  priorityFeeGwei: number;
  estimatedFeePerTxEth: string;
  chainId: number;
  symbol: string;
}

interface ChainFeeRaw {
  gas_price_gwei: number;
  priority_fee_gwei: number;
  estimated_fee_eth: string;
  chain_id: number;
  symbol: string;
}

interface AccountInfoRaw {
  balance_hex: string;
  balance_eth: number;
  balance_formatted: string;
  nonce: number;
}

// Conservative reserve for network/priority fees plus temporary wrapped-SOL and
// destination ATA rent. Rent returned by a closed WSOL account becomes available again.
export const SOLANA_BUY_RESERVE_LAMPORTS = 6_000_000n;
export const SOLANA_BUY_RESERVE_SOL = Number(SOLANA_BUY_RESERVE_LAMPORTS) / 1e9;

function solToLamports(amountSol: number): bigint {
  if (!Number.isFinite(amountSol) || amountSol < 0) {
    throw new Error("SOL amount must be a finite, non-negative number.");
  }
  const lamports = Math.floor(amountSol * 1e9);
  if (!Number.isSafeInteger(lamports)) {
    throw new Error("SOL amount exceeds the supported precision range.");
  }
  return BigInt(lamports);
}

async function getSolanaBalanceLamports(
  sessionToken: string,
  address: string,
): Promise<{ lamports: bigint; formatted: string }> {
  const account = await invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
    sessionToken,
    chainKey: "sol",
    address,
  });
  return { lamports: BigInt(account.balance_hex), formatted: account.balance_formatted };
}

export async function fetchLiveFeeData(sessionToken: string, chainKey: string): Promise<LiveFeeData> {
  const res = await invoke<ChainFeeRaw>("get_chain_fee_data", { sessionToken, chainKey });
  return {
    gasPriceGwei: res.gas_price_gwei,
    priorityFeeGwei: res.priority_fee_gwei,
    estimatedFeePerTxEth: res.estimated_fee_eth,
    chainId: res.chain_id,
    symbol: res.symbol,
  };
}

export interface WalletSweepEstimate {
  walletId: number;
  address: string;
  balanceWei: bigint;
  balanceFormatted: string;
  feeWei: bigint;
  feeFormatted: string;
  netWei: bigint;
  netFormatted: string;
  isSweepable: boolean;
  statusText: string;
  isSponsored?: boolean;
  feePayerWalletId?: number;
  tokenSymbol?: string;
  tokenMint?: string;
  tokenDecimals?: number;
}

export interface TokenSweepInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals?: number;
  rawBalance: string;
  balanceFormatted: string;
  programId?: string;
}

export async function estimateWalletSweep(
  walletId: number,
  sessionToken: string,
  address: string,
  chainKey: string,
  gasPriceGwei: number,
  feePayerWalletId?: number,
): Promise<WalletSweepEstimate> {
  const cfg = SWEEP_CHAINS[chainKey] || SWEEP_CHAINS.eth;

  // 1. Solana Balance and Fee Estimation
  if (chainKey === "sol") {
    const isSponsored = !!feePayerWalletId && feePayerWalletId !== walletId;
    const feeLamports = isSponsored ? 0n : 5000n;
    const feeFormatted = isSponsored ? "0 SOL (Sponsored)" : "0.000005 SOL";

    try {
      const acc = await invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
        sessionToken,
        chainKey,
        address,
      });

      const lamports = BigInt(acc.balance_hex);
      const balanceFormatted = acc.balance_formatted;

      if (!isSponsored && lamports <= feeLamports) {
        return {
          walletId,
          address,
          balanceWei: 0n,
          balanceFormatted,
          feeWei: 0n,
          feeFormatted,
          netWei: 0n,
          netFormatted: "0.000000 SOL",
          isSweepable: false,
          statusText: "Balance < Gas Fee (Dust)",
          isSponsored: false,
          feePayerWalletId,
        };
      }

      if (isSponsored && lamports === 0n) {
        return {
          walletId,
          address,
          balanceWei: 0n,
          balanceFormatted: "0 SOL",
          feeWei: 0n,
          feeFormatted,
          netWei: 0n,
          netFormatted: "0.000000 SOL",
          isSweepable: false,
          statusText: "Zero Balance",
          isSponsored: true,
          feePayerWalletId,
        };
      }

      const netLamports = isSponsored ? lamports : lamports - feeLamports;
      const netSol = Number(netLamports) / 1e9;
      const netFormatted = `${netSol.toFixed(6)} SOL`;

      return {
        walletId,
        address,
        balanceWei: lamports,
        balanceFormatted,
        feeWei: feeLamports,
        feeFormatted,
        netWei: netLamports,
        netFormatted,
        isSweepable: true,
        statusText: isSponsored ? "Ready to Sweep (Gas Sponsored) ✓" : "Ready to Sweep ✓",
        isSponsored,
        feePayerWalletId,
      };
    } catch (err) {
      return {
        walletId,
        address,
        balanceWei: 0n,
        balanceFormatted: "0 SOL",
        feeWei: 0n,
        feeFormatted,
        netWei: 0n,
        netFormatted: "0 SOL",
        isSweepable: false,
        statusText: `Failed to read balance: ${String(err)}`,
        isSponsored,
        feePayerWalletId,
      };
    }
  }

  // 2. EVM Balance and Fee Estimation
  const gasPriceWei = parseUnits(gasPriceGwei.toString(), "gwei");
  const feeWei = gasPriceWei * 21000n;
  const feeFormatted = `${Number(formatEther(feeWei)).toFixed(8)} ${cfg.symbol}`;

  try {
    const acc = await invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
      sessionToken,
      chainKey,
      address,
    });

    const balanceWei = toBigInt(acc.balance_hex);
    const balanceFormatted = acc.balance_formatted;

    if (balanceWei <= feeWei) {
      return {
        walletId,
        address,
        balanceWei,
        balanceFormatted,
        feeWei,
        feeFormatted,
        netWei: 0n,
        netFormatted: `0.00000000 ${cfg.symbol}`,
        isSweepable: false,
        statusText: "Balance < Gas Fee (Dust)",
      };
    }

    const netWei = balanceWei - feeWei;
    const netFormatted = `${Number(formatEther(netWei)).toFixed(8)} ${cfg.symbol}`;

    return {
      walletId,
      address,
      balanceWei,
      balanceFormatted,
      feeWei,
      feeFormatted,
      netWei,
      netFormatted,
      isSweepable: true,
      statusText: "Ready to Sweep ✓",
    };
  } catch (err) {
    return {
      walletId,
      address,
      balanceWei: 0n,
      balanceFormatted: `0 ${cfg.symbol}`,
      feeWei,
      feeFormatted,
      netWei: 0n,
      netFormatted: `0 ${cfg.symbol}`,
      isSweepable: false,
      statusText: `Failed to read balance: ${String(err)}`,
    };
  }
}

export async function estimateTokenWalletSweep(
  walletId: number,
  sessionToken: string,
  address: string,
  token: TokenSweepInfo,
  feePayerWalletId?: number,
): Promise<WalletSweepEstimate> {
  const isSponsored = !!feePayerWalletId;
  const rawBal = BigInt(token.rawBalance || "0");

  if (rawBal <= 0n) {
    return {
      walletId,
      address,
      balanceWei: 0n,
      balanceFormatted: `0 ${token.symbol}`,
      feeWei: 0n,
      feeFormatted: isSponsored ? "0 SOL (Sponsored)" : "0.000005 SOL",
      netWei: 0n,
      netFormatted: `0 ${token.symbol}`,
      isSweepable: false,
      statusText: "No Token Balance",
      isSponsored,
      feePayerWalletId,
      tokenSymbol: token.symbol,
      tokenMint: token.mint,
      tokenDecimals: token.decimals,
    };
  }

  // If NOT sponsored, wallet itself must have at least 5000 lamports of SOL
  if (!isSponsored) {
    try {
      const acc = await invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
        sessionToken,
        chainKey: "sol",
        address,
      });
      const lamports = BigInt(acc.balance_hex);
      if (lamports < 5000n) {
        return {
          walletId,
          address,
          balanceWei: rawBal,
          balanceFormatted: token.balanceFormatted,
          feeWei: 5000n,
          feeFormatted: "0.000005 SOL",
          netWei: rawBal,
          netFormatted: token.balanceFormatted,
          isSweepable: false,
          statusText: "Requires 0.000005 SOL Gas (or select a Fee Payer)",
          isSponsored: false,
          tokenSymbol: token.symbol,
          tokenMint: token.mint,
          tokenDecimals: token.decimals,
        };
      }
    } catch {
      // Proceed if account fetch fails
    }
  }

  return {
    walletId,
    address,
    balanceWei: rawBal,
    balanceFormatted: token.balanceFormatted,
    feeWei: isSponsored ? 0n : 5000n,
    feeFormatted: isSponsored ? "0 SOL (Sponsored)" : "0.000005 SOL",
    netWei: rawBal,
    netFormatted: token.balanceFormatted,
    isSweepable: true,
    statusText: isSponsored ? "Ready to Sweep (Gas Sponsored) ✓" : "Ready to Sweep ✓",
    isSponsored,
    feePayerWalletId,
    tokenSymbol: token.symbol,
    tokenMint: token.mint,
    tokenDecimals: token.decimals,
  };
}

export interface SweepTxResult {
  walletId: number;
  address: string;
  success: boolean;
  pending?: boolean;
  confirmationStatus?: "confirmed" | "finalized" | "processed" | "pending" | "failed";
  txHash?: string;
  explorerUrl?: string;
  amountSent?: string;
  error?: string;
}

interface SolanaConfirmationResponse {
  signature: string;
  status: "confirmed" | "finalized" | "processed" | "pending" | "failed";
  error?: unknown;
}

async function broadcastAndConfirmSolana(
  sessionToken: string,
  rawTxBase64: string,
  walletId: number,
  address: string,
): Promise<SweepTxResult> {
  const cfg = SWEEP_CHAINS.sol;
  const txHash = await invoke<string>("broadcast_solana_tx", { sessionToken, rawTxBase64 });
  const explorerUrl = `${cfg.explorerUrl}${txHash}`;

  try {
    const confirmation = await invoke<SolanaConfirmationResponse>("confirm_solana_transaction", {
      sessionToken,
      signature: txHash,
    });
    if (confirmation.status === "failed") {
      return {
        walletId,
        address,
        success: false,
        confirmationStatus: "failed",
        txHash,
        explorerUrl,
        error: `Transaction was confirmed with an on-chain error: ${JSON.stringify(confirmation.error ?? "unknown error")}`,
      };
    }
    if (confirmation.status === "confirmed" || confirmation.status === "finalized") {
      return {
        walletId,
        address,
        success: true,
        confirmationStatus: confirmation.status,
        txHash,
        explorerUrl,
      };
    }
    return {
      walletId,
      address,
      success: false,
      pending: true,
      confirmationStatus: confirmation.status,
      txHash,
      explorerUrl,
      error: "Transaction was submitted to an RPC node but is not confirmed yet.",
    };
  } catch (err) {
    // The transaction already has a signature. A status/RPC failure must not be
    // misreported as an on-chain failure or erase the explorer link.
    return {
      walletId,
      address,
      success: false,
      pending: true,
      confirmationStatus: "pending",
      txHash,
      explorerUrl,
      error: `Transaction submitted; confirmation check unavailable: ${String(err)}`,
    };
  }
}

interface EvmConfirmationResponse {
  transactionHash: string;
  status: "confirmed" | "pending" | "failed";
  blockNumber?: string | null;
  error?: unknown;
}

async function broadcastAndConfirmEvm(
  sessionToken: string,
  chainKey: string,
  rawTx: string,
  walletId: number,
  address: string,
  amountSent: string,
): Promise<SweepTxResult> {
  const cfg = SWEEP_CHAINS[chainKey] || SWEEP_CHAINS.eth;
  const txHash = await invoke<string>("broadcast_raw_tx", { sessionToken, chainKey, rawTx });
  const explorerUrl = `${cfg.explorerUrl}${txHash}`;

  try {
    const confirmation = await invoke<EvmConfirmationResponse>("confirm_evm_transaction", {
      sessionToken,
      chainKey,
      transactionHash: txHash,
    });
    if (confirmation.status === "failed") {
      return {
        walletId,
        address,
        success: false,
        confirmationStatus: "failed",
        txHash,
        explorerUrl,
        amountSent,
        error: `Transaction was mined but reverted: ${JSON.stringify(confirmation.error ?? "unknown EVM error")}`,
      };
    }
    if (confirmation.status === "confirmed") {
      return {
        walletId,
        address,
        success: true,
        confirmationStatus: "confirmed",
        txHash,
        explorerUrl,
        amountSent,
      };
    }
    return {
      walletId,
      address,
      success: false,
      pending: true,
      confirmationStatus: "pending",
      txHash,
      explorerUrl,
      amountSent,
      error: "Transaction was submitted to an RPC node but is not mined yet.",
    };
  } catch (err) {
    // Once eth_sendRawTransaction has returned a hash, a follow-up RPC failure
    // must remain pending rather than being reported as a failed transfer.
    return {
      walletId,
      address,
      success: false,
      pending: true,
      confirmationStatus: "pending",
      txHash,
      explorerUrl,
      amountSent,
      error: `Transaction submitted; confirmation check unavailable: ${String(err)}`,
    };
  }
}

async function resolveSolanaMintInfo(
  sessionToken: string,
  mint: string,
  _knownDecimals?: number,
  _knownProgramId?: string,
): Promise<{ decimals: number; tokenProgramId: string }> {
  return getSolanaMintInfo(sessionToken, mint);
}

export async function executeSweepSingle(
  walletId: number,
  sessionToken: string,
  chainKey: string,
  recipientAddress: string,
  customGasPriceGwei?: number,
  senderAddress?: string,
  feePayerWalletId?: number,
): Promise<SweepTxResult> {
  const cfg = SWEEP_CHAINS[chainKey] || SWEEP_CHAINS.eth;

  // 1. Solana Sweep Execution
  if (chainKey === "sol") {
    try {
      const fromAddress = senderAddress;
      if (!fromAddress) {
        return {
          walletId,
          address: recipientAddress,
          success: false,
          error: "Sender address required for Solana sweep",
        };
      }

      const isSponsored = !!feePayerWalletId && feePayerWalletId !== walletId;
      const acc = await invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
        sessionToken,
        chainKey: "sol",
        address: fromAddress,
      });
      const recentBlockhash = await invoke<string>("get_solana_recent_blockhash", { sessionToken });

      const lamports = BigInt(acc.balance_hex);
      const feeLamports = 5000n;

      if (!isSponsored && lamports <= feeLamports) {
        return {
          walletId,
          address: fromAddress,
          success: false,
          error: `Insufficient balance for fee (Balance: ${lamports} lamports <= Fee: ${feeLamports} lamports)`,
        };
      }

      const lamportsToSend = isSponsored ? lamports : lamports - feeLamports;
      if (lamportsToSend <= 0n) {
        return {
          walletId,
          address: fromAddress,
          success: false,
          error: "Zero SOL balance to sweep",
        };
      }

      // Check account details to prevent ATA/Nonce traps
      const accountDetails = await invoke<SolanaAccountDetails | null>("get_solana_account_details", {
        address: fromAddress,
        sessionToken,
      });

      if (accountDetails?.account_type === "token_account") {
        if (lamports <= 2_500_000n) {
          return {
            walletId,
            address: fromAddress,
            success: false,
            error: `This account is an SPL Token Account (ATA). The SOL balance is token rent reserve.`,
          };
        }
      }

      if (accountDetails?.account_type === "nonce_account") {
        const authorityStr = accountDetails.authority;
        if (authorityStr && authorityStr !== fromAddress) {
          return {
            walletId,
            address: fromAddress,
            success: false,
            error: `This account is a Durable Nonce, and its authority is held by ${shortAddr(authorityStr)}. Only that authority key holder can sign withdrawals.`,
          };
        }
      }

      // Sign transaction offline natively in Rust using scoped in-memory session (Zero-Webview key exposure)
      interface SolanaSignResult {
        rawTxBase64: string;
        fromAddress: string;
      }

      const signResult = await invoke<SolanaSignResult>("sign_solana_transfer_scoped", {
        walletId,
        sessionToken,
        tx: {
          recipient: recipientAddress.trim(),
          lamports: lamportsToSend.toString(),
          recentBlockhash,
          isNonceAccount: accountDetails?.account_type === "nonce_account",
          feePayerWalletId: feePayerWalletId ?? null,
        },
      });

      // Self-check: verify that derived fromAddress matches expected
      if (signResult.fromAddress !== fromAddress) {
        return {
          walletId,
          address: fromAddress,
          success: false,
          error: `Solana sender address mismatch (expected ${fromAddress}, derived ${signResult.fromAddress})`,
        };
      }

      const result = await broadcastAndConfirmSolana(sessionToken, signResult.rawTxBase64, walletId, fromAddress);
      const amountSent = `${(Number(lamportsToSend) / 1e9).toFixed(6)} SOL`;
      return { ...result, amountSent };
    } catch (err) {
      return {
        walletId,
        address: recipientAddress,
        success: false,
        error: String(err),
      };
    }
  }

  // 2. EVM Sweep Execution
  // Derivation done natively in Rust using scoped credentials (Zero key exposure in webview memory)
  const fromAddress = senderAddress;
  if (!fromAddress) {
    return {
      walletId,
      address: recipientAddress,
      success: false,
      error: "Unable to determine EVM sender address",
    };
  }

  try {
    const acc = await invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
      sessionToken,
      chainKey,
      address: fromAddress,
    });
    const feeData = await invoke<ChainFeeRaw>("get_chain_fee_data", { sessionToken, chainKey });

    const gasPrice = customGasPriceGwei
      ? parseUnits(customGasPriceGwei.toString(), "gwei")
      : parseUnits(feeData.gas_price_gwei.toString(), "gwei");

    const gasLimit = 21000n;
    const fee = gasLimit * gasPrice;
    const balance = toBigInt(acc.balance_hex);

    if (balance <= fee) {
      return {
        walletId,
        address: fromAddress,
        success: false,
        error: `Insufficient balance for gas fee (${formatEther(balance)} <= ${formatEther(fee)})`,
      };
    }

    const netAmount = balance - fee;

    // Sign transaction offline natively in Rust using scoped in-memory session (Zero-Webview key exposure)
    interface EvmSignResult {
      rawTx: string;
      fromAddress: string;
    }

    const signResult = await invoke<EvmSignResult>("sign_evm_transfer_scoped", {
      walletId,
      sessionToken,
      chainKey,
      tx: {
        chainId: cfg.chainId,
        toAddress: recipientAddress.trim(),
        valueWeiHex: "0x" + netAmount.toString(16),
        gasPriceWeiHex: "0x" + gasPrice.toString(16),
        gasLimit: Number(gasLimit),
        nonce: acc.nonce,
      },
    });

    // Self-check: verify that key-derived sender matches expected fromAddress
    if (signResult.fromAddress.toLowerCase() !== fromAddress.toLowerCase()) {
      return {
        walletId,
        address: fromAddress,
        success: false,
        error: `Sender address mismatch (expected ${fromAddress}, derived from key ${signResult.fromAddress})`,
      };
    }

    const rawTx = signResult.rawTx;

    const amountSent = `${Number(formatEther(netAmount)).toFixed(8)} ${cfg.symbol}`;
    return await broadcastAndConfirmEvm(
      sessionToken,
      chainKey,
      rawTx,
      walletId,
      fromAddress,
      amountSent,
    );
  } catch (err) {
    return {
      walletId,
      address: fromAddress,
      success: false,
      error: String(err),
    };
  }
}

export async function executeTokenSweepSingle(
  walletId: number,
  sessionToken: string,
  feePayerWalletId: number | undefined,
  recipientAddress: string,
  senderAddress: string,
  token: TokenSweepInfo,
): Promise<SweepTxResult> {
  try {
    if (!senderAddress) {
      return {
        walletId,
        address: recipientAddress,
        success: false,
        error: "Sender address required for Solana sweep",
      };
    }

    const rawBal = BigInt(token.rawBalance || "0");
    if (rawBal <= 0n) {
      return {
        walletId,
        address: senderAddress,
        success: false,
        error: `Token balance is zero (${token.symbol})`,
      };
    }

    const mintInfo = await resolveSolanaMintInfo(sessionToken, token.mint, token.decimals, token.programId);
    const recentBlockhash = await invoke<string>("get_solana_recent_blockhash", { sessionToken });

    interface SolanaSignResult {
      rawTxBase64: string;
      fromAddress: string;
    }

    const signResult = await invoke<SolanaSignResult>("sign_solana_token_sweep_scoped", {
      walletId,
      sessionToken,
      tx: {
        recipient: recipientAddress.trim(),
        mint: token.mint.trim(),
        amountRaw: rawBal.toString(),
        decimals: mintInfo.decimals,
        tokenProgram: mintInfo.tokenProgramId,
        recentBlockhash,
        feePayerWalletId: feePayerWalletId ?? null,
      },
    });

    if (signResult.fromAddress !== senderAddress) {
      return { walletId, address: senderAddress, success: false, error: `Solana sender address mismatch (expected ${senderAddress}, derived ${signResult.fromAddress})` };
    }
    const result = await broadcastAndConfirmSolana(sessionToken, signResult.rawTxBase64, walletId, senderAddress);
    return { ...result, amountSent: token.balanceFormatted };
  } catch (err) {
    return {
      walletId,
      address: senderAddress,
      success: false,
      error: String(err),
    };
  }
}

export interface DexSellEstimate extends WalletSweepEstimate {
  estimatedSolOut?: string;
  priceImpactPct?: string;
}

export async function estimateTokenDexSellSweep(
  sessionToken: string,
  walletId: number,
  senderAddress: string,
  token: TokenSweepInfo,
  feePayerWalletId?: number,
  slippageBps: number = 250,
): Promise<DexSellEstimate> {
  const isSponsored = !!feePayerWalletId && feePayerWalletId !== walletId;
  const rawBal = token.rawBalance || "0";

  try {
    if (BigInt(rawBal) <= 0n) {
      return {
        walletId,
        address: senderAddress,
        balanceWei: 0n,
        balanceFormatted: "0",
        feeWei: 0n,
        feeFormatted: "0 SOL",
        netWei: 0n,
        netFormatted: "0 SOL",
        isSweepable: false,
        statusText: "Token balance is 0",
        isSponsored,
        feePayerWalletId,
        tokenSymbol: token.symbol,
        tokenMint: token.mint,
      };
    }

    const mintInfo = await resolveSolanaMintInfo(sessionToken, token.mint, token.decimals, token.programId);
    const quote = await fetchJupiterQuote(sessionToken, token.mint, SOL_MINT, rawBal, slippageBps);
    const estSol = (Number(quote.outAmount) / 1e9).toFixed(6);

    return {
      walletId,
      address: senderAddress,
      balanceWei: BigInt(rawBal),
      balanceFormatted: token.balanceFormatted,
      feeWei: 0n,
      feeFormatted: isSponsored ? "0 SOL (Gas Sponsored)" : "0.000005 SOL",
      netWei: BigInt(quote.outAmount),
      netFormatted: `${estSol} SOL (Direct to Master)`,
      isSweepable: true,
      statusText: isSponsored ? "Ready to Liquidate (Sponsored) ✓" : "Ready to Liquidate ✓",
      isSponsored,
      feePayerWalletId,
      tokenSymbol: token.symbol,
      tokenMint: token.mint,
      tokenDecimals: mintInfo.decimals,
      estimatedSolOut: estSol,
      priceImpactPct: quote.priceImpactPct,
    };
  } catch (err) {
    return {
      walletId,
      address: senderAddress,
      balanceWei: BigInt(rawBal),
      balanceFormatted: token.balanceFormatted,
      feeWei: 0n,
      feeFormatted: "—",
      netWei: 0n,
      netFormatted: "0 SOL",
      isSweepable: false,
      statusText: `Quote Error: ${String(err).slice(0, 45)}...`,
      isSponsored,
      feePayerWalletId,
      tokenSymbol: token.symbol,
      tokenMint: token.mint,
    };
  }
}

export async function executeTokenDexSellSingle(
  walletId: number,
  sessionToken: string,
  feePayerWalletId: number | undefined,
  feePayerAddress: string,
  recipientAddress: string,
  senderAddress: string,
  token: TokenSweepInfo,
  slippageBps: number = 250,
): Promise<SweepTxResult> {
  try {
    const rawBal = BigInt(token.rawBalance || "0");
    if (rawBal <= 0n) {
      return {
        walletId,
        address: senderAddress,
        success: false,
        error: `Token balance is zero (${token.symbol})`,
      };
    }

    // 1. Fetch live Jupiter quote
    await resolveSolanaMintInfo(sessionToken, token.mint, token.decimals, token.programId);
    const quote = await fetchJupiterQuote(sessionToken, token.mint, SOL_MINT, rawBal.toString(), slippageBps);

    // 2. Build Stealth Versioned Message with SOL output redirected directly to recipientAddress
    const { messageBase64, estimatedSolOut } = await buildStealthDexSellMessage(
      sessionToken,
      quote,
      senderAddress,
      feePayerAddress,
      recipientAddress,
    );

    interface SolanaSignResult {
      rawTxBase64: string;
      fromAddress: string;
    }

    // 3. Dual-sign natively in Rust (Zero private key exposure to webview)
    const signResult = await invoke<SolanaSignResult>("sign_solana_versioned_tx_scoped", {
      walletId,
      sessionToken,
      tx: {
        messageBase64,
        feePayerWalletId: feePayerWalletId ?? null,
      },
    });

    if (signResult.fromAddress !== senderAddress) {
      return { walletId, address: senderAddress, success: false, error: `Solana sender address mismatch (expected ${senderAddress}, derived ${signResult.fromAddress})` };
    }
    // 4. Broadcast and verify confirmed status before recording a successful trade.
    const result = await broadcastAndConfirmSolana(sessionToken, signResult.rawTxBase64, walletId, senderAddress);
    return { ...result, amountSent: `${token.balanceFormatted} → ~${estimatedSolOut} SOL quoted` };
  } catch (err) {
    return {
      walletId,
      address: senderAddress,
      success: false,
      error: String(err),
    };
  }
}

export interface DexBuyEstimate {
  walletId: number;
  address: string;
  balanceWei: bigint;
  balanceFormatted: string;
  feeWei: bigint;
  feeFormatted: string;
  netWei: bigint;
  netFormatted: string;
  isSweepable: boolean;
  statusText: string;
  isSponsored?: boolean;
  feePayerWalletId?: number;
  tokenSymbol: string;
  tokenMint: string;
  tokenDecimals?: number;
  estimatedTokensOut?: string;
  priceImpactPct?: string;
}

export async function estimateTokenDexBuySweep(
  sessionToken: string,
  walletId: number,
  senderAddress: string,
  token: { mint: string; symbol: string; decimals?: number; programId?: string },
  buyAmountSol: number,
  feePayerWalletId?: number,
  feePayerAddress?: string,
  slippageBps: number = 250,
): Promise<DexBuyEstimate> {
  const requestedSponsored = !!feePayerWalletId && feePayerWalletId !== walletId;
  const isSponsored = requestedSponsored && !!feePayerAddress && feePayerAddress !== senderAddress;
  let decimals = token.decimals ?? 6;
  try {
    const buyLamports = solToLamports(buyAmountSol);
    if (requestedSponsored && !feePayerAddress) {
      throw new Error("Sponsored swap is missing its fee-payer address.");
    }
    const mintInfo = await resolveSolanaMintInfo(sessionToken, token.mint, token.decimals, token.programId);
    decimals = mintInfo.decimals;
    if (buyLamports <= 0n) {
      return {
        walletId,
        address: senderAddress,
        balanceWei: 0n,
        balanceFormatted: "0 SOL",
        feeWei: 0n,
        feeFormatted: "0 SOL",
        netWei: 0n,
        netFormatted: "0",
        isSweepable: false,
        statusText: "Buy amount must be > 0 SOL",
        isSponsored,
        feePayerWalletId,
        tokenSymbol: token.symbol,
        tokenMint: token.mint,
      };
    }

    // Check the spend wallet and, when sponsored, the actual fee payer. Reserve
    // enough for priority fees and a newly-created output ATA before quoting.
    const buyerBalance = await getSolanaBalanceLamports(sessionToken, senderAddress);
    const payerBalance = isSponsored
      ? await getSolanaBalanceLamports(sessionToken, feePayerAddress!)
      : buyerBalance;
    const requiredBuyerLamports = buyLamports + (isSponsored ? 0n : SOLANA_BUY_RESERVE_LAMPORTS);
    const requiredPayerLamports = isSponsored ? SOLANA_BUY_RESERVE_LAMPORTS : 0n;
    const feeLamports = isSponsored ? 0n : SOLANA_BUY_RESERVE_LAMPORTS;

    // 2. Fetch live Jupiter quote (SOL -> Token)
    const quote = await fetchJupiterQuote(sessionToken, SOL_MINT, token.mint, buyLamports.toString(), slippageBps);
    const rawTokensOut = BigInt(quote.outAmount);
    const estTokens = (Number(rawTokensOut) / (10 ** decimals)).toFixed(decimals > 6 ? 4 : 2);

    const buyerCanFund = buyerBalance.lamports >= requiredBuyerLamports;
    const payerCanFund = payerBalance.lamports >= requiredPayerLamports;
    if (!buyerCanFund || !payerCanFund) {
      const statusText = !buyerCanFund
        ? `Insufficient SOL (needs ${buyAmountSol} SOL plus fee/ATA reserve; has ${buyerBalance.formatted})`
        : `Fee payer needs at least ${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL for fees/ATA rent (has ${payerBalance.formatted})`;
      return {
        walletId,
        address: senderAddress,
        balanceWei: buyerBalance.lamports,
        balanceFormatted: buyerBalance.formatted,
        feeWei: feeLamports,
        feeFormatted: isSponsored ? "Covered by fee payer" : `${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL fee/ATA reserve`,
        netWei: 0n,
        netFormatted: `0 ${token.symbol}`,
        isSweepable: false,
        statusText,
        isSponsored,
        feePayerWalletId,
        tokenSymbol: token.symbol,
        tokenMint: token.mint,
      };
    }

    return {
      walletId,
      address: senderAddress,
      balanceWei: buyerBalance.lamports,
      balanceFormatted: buyerBalance.formatted,
      feeWei: feeLamports,
      feeFormatted: isSponsored ? "Covered by fee payer" : `${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL fee/ATA reserve`,
      netWei: rawTokensOut,
      netFormatted: `~${estTokens} ${token.symbol}`,
      isSweepable: true,
      statusText: isSponsored ? "Ready to Buy (Sponsored) ✓" : "Ready to Buy ✓",
      isSponsored,
      feePayerWalletId,
      tokenSymbol: token.symbol,
      tokenMint: token.mint,
      tokenDecimals: decimals,
      estimatedTokensOut: estTokens,
      priceImpactPct: quote.priceImpactPct,
    };
  } catch (err) {
    return {
      walletId,
      address: senderAddress,
      balanceWei: 0n,
      balanceFormatted: "0 SOL",
      feeWei: 0n,
      feeFormatted: "—",
      netWei: 0n,
      netFormatted: `0 ${token.symbol}`,
      isSweepable: false,
      statusText: `Quote Error: ${String(err).slice(0, 45)}...`,
      isSponsored,
      feePayerWalletId,
      tokenSymbol: token.symbol,
      tokenMint: token.mint,
    };
  }
}

export async function executeTokenDexBuySingle(
  walletId: number,
  sessionToken: string,
  feePayerWalletId: number | undefined,
  feePayerAddress: string,
  senderAddress: string,
  token: { mint: string; symbol: string; decimals?: number; programId?: string },
  buyAmountSol: number,
  destinationOwner?: string,
  slippageBps: number = 250,
): Promise<SweepTxResult> {
  const requestedSponsored = !!feePayerWalletId && feePayerWalletId !== walletId;
  const isSponsored = requestedSponsored && feePayerAddress !== senderAddress;
  const outputAddress = destinationOwner?.trim() || senderAddress;

  try {
    const buyLamports = solToLamports(buyAmountSol);
    if (buyLamports <= 0n) {
      return {
        walletId,
        address: outputAddress,
        success: false,
        error: "Buy amount must be > 0 SOL",
      };
    }

    if (requestedSponsored && !feePayerAddress.trim()) {
      return { walletId, address: outputAddress, success: false, error: "Sponsored swap is missing its fee-payer address." };
    }
    const buyerBalance = await getSolanaBalanceLamports(sessionToken, senderAddress);
    const requiredBuyerLamports = buyLamports + (isSponsored ? 0n : SOLANA_BUY_RESERVE_LAMPORTS);
    if (buyerBalance.lamports < requiredBuyerLamports) {
      return {
        walletId,
        address: outputAddress,
        success: false,
        error: `Insufficient SOL: purchase requires ${buyAmountSol} SOL plus a ${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL fee/ATA reserve. Balance: ${buyerBalance.formatted}`,
      };
    }
    if (isSponsored) {
      const payerBalance = await getSolanaBalanceLamports(sessionToken, feePayerAddress);
      if (payerBalance.lamports < SOLANA_BUY_RESERVE_LAMPORTS) {
        return {
          walletId,
          address: outputAddress,
          success: false,
          error: `Fee payer needs ${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL for transaction fees and possible ATA rent. Balance: ${payerBalance.formatted}`,
        };
      }
    }

    // Resolve mint decimals and token program from a session- and Safe Mode-gated native RPC.
    const mintInfo = await resolveSolanaMintInfo(sessionToken, token.mint, token.decimals, token.programId);

    // 1. Fetch live Jupiter quote (SOL -> Token)
    const quote = await fetchJupiterQuote(sessionToken, SOL_MINT, token.mint, buyLamports.toString(), slippageBps);

    // 2. Derive a recipient ATA only from the selected owner and verified token program.
    const destinationAta = findAssociatedTokenAddress(
      new PublicKey(outputAddress),
      new PublicKey(token.mint),
      new PublicKey(mintInfo.tokenProgramId),
    ).toBase58();
    const { messageBase64 } = await buildDexBuyMessage(
      sessionToken,
      quote,
      senderAddress,
      feePayerAddress,
      destinationAta,
      outputAddress,
      mintInfo.tokenProgramId,
    );

    interface SolanaSignResult {
      rawTxBase64: string;
      fromAddress: string;
    }

    // 3. Dual-sign natively in Rust (Zero private key exposure to webview)
    const signResult = await invoke<SolanaSignResult>("sign_solana_versioned_tx_scoped", {
      walletId,
      sessionToken,
      tx: {
        messageBase64,
        feePayerWalletId: feePayerWalletId ?? null,
      },
    });

    if (signResult.fromAddress !== senderAddress) {
      return { walletId, address: outputAddress, success: false, error: `Solana sender address mismatch (expected ${senderAddress}, derived ${signResult.fromAddress})` };
    }
    // 4. Broadcast and verify confirmed status before recording a successful trade.
    const result = await broadcastAndConfirmSolana(sessionToken, signResult.rawTxBase64, walletId, outputAddress);
    const estTokens = (Number(quote.outAmount) / (10 ** mintInfo.decimals)).toFixed(mintInfo.decimals > 6 ? 4 : 2);
    return { ...result, amountSent: `${buyAmountSol} SOL → ~${estTokens} ${token.symbol} quoted` };
  } catch (err) {
    return {
      walletId,
      address: outputAddress,
      success: false,
      error: String(err),
    };
  }
}

export async function estimateMasterDexBuySweep(
  sessionToken: string,
  targetWalletId: number,
  targetWalletAddress: string,
  token: { mint: string; symbol: string; decimals?: number; programId?: string },
  buyAmountSol: number,
  masterWalletId: number,
  masterWalletSolBalance: number,
  slippageBps: number = 250,
): Promise<DexBuyEstimate> {
  let decimals = token.decimals ?? 6;
  try {
    const buyLamports = solToLamports(buyAmountSol);
    const mintInfo = await resolveSolanaMintInfo(sessionToken, token.mint, token.decimals, token.programId);
    decimals = mintInfo.decimals;
    const quote = await fetchJupiterQuote(sessionToken, SOL_MINT, token.mint, buyLamports.toString(), slippageBps);
    const rawTokensOut = BigInt(quote.outAmount || "0");
    const factor = 10 ** decimals;
    const estTokens = (Number(rawTokensOut) / factor).toFixed(decimals > 6 ? 4 : 2);

    const isMasterFunded = masterWalletSolBalance >= buyAmountSol + SOLANA_BUY_RESERVE_SOL;

    return {
      walletId: targetWalletId,
      address: targetWalletAddress,
      balanceWei: 0n,
      balanceFormatted: "0 SOL (Sub-Wallet)",
      feeWei: 0n,
      feeFormatted: "0 SOL (Master Paid 👑)",
      netWei: rawTokensOut,
      netFormatted: `~${estTokens} ${token.symbol}`,
      isSweepable: isMasterFunded,
      statusText: isMasterFunded ? "Ready (Master Funded 👑)" : `Master Low SOL (Needs ${buyAmountSol} SOL + ${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL reserve)`,
      isSponsored: true,
      feePayerWalletId: masterWalletId,
      tokenSymbol: token.symbol,
      tokenMint: token.mint,
      tokenDecimals: decimals,
      estimatedTokensOut: estTokens,
      priceImpactPct: quote.priceImpactPct,
    };
  } catch (err) {
    return {
      walletId: targetWalletId,
      address: targetWalletAddress,
      balanceWei: 0n,
      balanceFormatted: "0 SOL",
      feeWei: 0n,
      feeFormatted: "—",
      netWei: 0n,
      netFormatted: `0 ${token.symbol}`,
      isSweepable: false,
      statusText: `Quote Error: ${String(err).slice(0, 45)}...`,
      isSponsored: true,
      feePayerWalletId: masterWalletId,
      tokenSymbol: token.symbol,
      tokenMint: token.mint,
    };
  }
}

export async function executeMasterDexBuySingle(
  masterWalletId: number,
  sessionToken: string,
  masterAddress: string,
  targetWalletAddress: string,
  token: { mint: string; symbol: string; decimals?: number; programId?: string },
  buyAmountSol: number,
  slippageBps: number = 250,
  recipientAddress?: string,
): Promise<SweepTxResult> {
  const outputAddress = recipientAddress?.trim() || targetWalletAddress;
  try {
    if (new PublicKey(masterAddress).equals(new PublicKey(targetWalletAddress))) {
      return {
        walletId: masterWalletId,
        address: outputAddress,
        success: false,
        error: "Master-funded batch recipient must be a different wallet from the funding wallet.",
      };
    }
    const buyLamports = solToLamports(buyAmountSol);
    if (buyLamports <= 0n) {
      return {
        walletId: masterWalletId,
        address: outputAddress,
        success: false,
        error: "Buy amount must be > 0 SOL",
      };
    }

    const masterBalance = await getSolanaBalanceLamports(sessionToken, masterAddress);
    const requiredMasterLamports = buyLamports + SOLANA_BUY_RESERVE_LAMPORTS;
    if (masterBalance.lamports < requiredMasterLamports) {
      return {
        walletId: masterWalletId,
        address: outputAddress,
        success: false,
        error: `Master wallet needs ${buyAmountSol} SOL plus ${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL for fees/ATA rent; balance is ${masterBalance.formatted}.`,
      };
    }

    const mintInfo = await resolveSolanaMintInfo(sessionToken, token.mint, token.decimals, token.programId);

    // 1. Fetch live Jupiter quote (Master SOL -> Target Token)
    const quote = await fetchJupiterQuote(sessionToken, SOL_MINT, token.mint, buyLamports.toString(), slippageBps);

    // 2. Derive the destination ATA from the recipient owner and on-chain mint program.
    const tokenProgram = new PublicKey(mintInfo.tokenProgramId);
    const targetAta = findAssociatedTokenAddress(
      new PublicKey(outputAddress),
      new PublicKey(token.mint),
      tokenProgram,
    );

    // 3. Build DEX Buy Versioned Message with idempotent ATA creation funded by Master.
    const { messageBase64 } = await buildDexBuyMessage(
      sessionToken,
      quote,
      masterAddress,
      masterAddress,
      targetAta.toBase58(),
      outputAddress,
      mintInfo.tokenProgramId,
    );

    interface SolanaSignResult {
      rawTxBase64: string;
      fromAddress: string;
    }

    // 4. Sign natively in Rust using Master Wallet
    const signResult = await invoke<SolanaSignResult>("sign_solana_versioned_tx_scoped", {
      walletId: masterWalletId,
      sessionToken,
      tx: {
        messageBase64,
        feePayerWalletId: null,
      },
    });

    if (signResult.fromAddress !== masterAddress) {
      return { walletId: masterWalletId, address: outputAddress, success: false, error: `Master signer address mismatch (expected ${masterAddress}, derived ${signResult.fromAddress})` };
    }
    // 5. Broadcast and verify confirmed status before recording a successful trade.
    const result = await broadcastAndConfirmSolana(sessionToken, signResult.rawTxBase64, masterWalletId, outputAddress);
    const estTokens = (Number(quote.outAmount) / (10 ** mintInfo.decimals)).toFixed(mintInfo.decimals > 6 ? 4 : 2);
    return { ...result, amountSent: `${buyAmountSol} SOL → ~${estTokens} ${token.symbol} quoted` };
  } catch (err) {
    return {
      walletId: masterWalletId,
      address: outputAddress,
      success: false,
      error: String(err),
    };
  }
}
