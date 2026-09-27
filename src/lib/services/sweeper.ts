import { invoke } from "@tauri-apps/api/core";
import { formatEther, parseUnits, toBigInt } from "../utils/format";
import { shortAddr } from "../wallets/wallet";
import { SOL_MINT, fetchJupiterQuote, buildStealthDexSellMessage, buildDexBuyMessage } from "../../services/jupiterSwapService";

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

export async function fetchLiveFeeData(chainKey: string): Promise<LiveFeeData> {
  const res = await invoke<ChainFeeRaw>("get_chain_fee_data", { chainKey });
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
  decimals: number;
  rawBalance: string;
  balanceFormatted: string;
  programId?: string;
}

export async function estimateWalletSweep(
  walletId: number,
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
  txHash?: string;
  explorerUrl?: string;
  amountSent?: string;
  error?: string;
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
        chainKey: "sol",
        address: fromAddress,
      });
      const recentBlockhash = await invoke<string>("get_solana_recent_blockhash");

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

      const txHash = await invoke<string>("broadcast_solana_tx", {
        rawTxBase64: signResult.rawTxBase64,
      });

      const amountSent = `${(Number(lamportsToSend) / 1e9).toFixed(6)} SOL`;

      return {
        walletId,
        address: fromAddress,
        success: true,
        txHash,
        explorerUrl: `${cfg.explorerUrl}${txHash}`,
        amountSent,
      };
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
      chainKey,
      address: fromAddress,
    });
    const feeData = await invoke<ChainFeeRaw>("get_chain_fee_data", { chainKey });

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

    // Broadcast raw transaction via native Rust client (CORS-free)
    const txHash = await invoke<string>("broadcast_raw_tx", {
      chainKey,
      rawTx,
    });

    const amountSent = `${Number(formatEther(netAmount)).toFixed(8)} ${cfg.symbol}`;

    return {
      walletId,
      address: fromAddress,
      success: true,
      txHash,
      explorerUrl: `${cfg.explorerUrl}${txHash}`,
      amountSent,
    };
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
  const cfg = SWEEP_CHAINS.sol;

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

    const recentBlockhash = await invoke<string>("get_solana_recent_blockhash");

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
        decimals: token.decimals,
        tokenProgram: token.programId ?? null,
        recentBlockhash,
        feePayerWalletId: feePayerWalletId ?? null,
      },
    });

    const txHash = await invoke<string>("broadcast_solana_tx", {
      rawTxBase64: signResult.rawTxBase64,
    });

    return {
      walletId,
      address: senderAddress,
      success: true,
      txHash,
      explorerUrl: `${cfg.explorerUrl}${txHash}`,
      amountSent: token.balanceFormatted,
    };
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

    const quote = await fetchJupiterQuote(token.mint, SOL_MINT, rawBal, slippageBps);
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
      tokenDecimals: token.decimals,
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
  const cfg = SWEEP_CHAINS.sol;

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
    const quote = await fetchJupiterQuote(token.mint, SOL_MINT, rawBal.toString(), slippageBps);

    // 2. Build Stealth Versioned Message with SOL output redirected directly to recipientAddress
    const { messageBase64, estimatedSolOut } = await buildStealthDexSellMessage(
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

    // 4. Broadcast to Solana mainnet RPC
    const txHash = await invoke<string>("broadcast_solana_tx", {
      rawTxBase64: signResult.rawTxBase64,
    });

    return {
      walletId,
      address: senderAddress,
      success: true,
      txHash,
      explorerUrl: `${cfg.explorerUrl}${txHash}`,
      amountSent: `${token.balanceFormatted} → +${estimatedSolOut} SOL`,
    };
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
  walletId: number,
  senderAddress: string,
  token: { mint: string; symbol: string; decimals?: number },
  buyAmountSol: number,
  feePayerWalletId?: number,
  slippageBps: number = 250,
): Promise<DexBuyEstimate> {
  const isSponsored = !!feePayerWalletId && feePayerWalletId !== walletId;
  const decimals = token.decimals ?? 6;
  const buyLamports = BigInt(Math.floor(buyAmountSol * 1e9));

  try {
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

    // 1. Get wallet SOL balance
    const acc = await invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
      chainKey: "sol",
      address: senderAddress,
    });
    const walletLamports = BigInt(acc.balance_hex);
    const feeLamports = isSponsored ? 0n : 5000n;
    const requiredLamports = buyLamports + feeLamports;

    // 2. Fetch live Jupiter quote (SOL -> Token)
    const quote = await fetchJupiterQuote(SOL_MINT, token.mint, buyLamports.toString(), slippageBps);
    const rawTokensOut = BigInt(quote.outAmount);
    const estTokens = (Number(rawTokensOut) / (10 ** decimals)).toFixed(decimals > 6 ? 4 : 2);

    if (walletLamports < requiredLamports) {
      return {
        walletId,
        address: senderAddress,
        balanceWei: walletLamports,
        balanceFormatted: acc.balance_formatted,
        feeWei: feeLamports,
        feeFormatted: isSponsored ? "0 SOL (Gas Sponsored)" : "0.000005 SOL",
        netWei: 0n,
        netFormatted: `0 ${token.symbol}`,
        isSweepable: false,
        statusText: `Insufficient SOL (Needs ${buyAmountSol} SOL, has ${acc.balance_formatted})`,
        isSponsored,
        feePayerWalletId,
        tokenSymbol: token.symbol,
        tokenMint: token.mint,
      };
    }

    return {
      walletId,
      address: senderAddress,
      balanceWei: walletLamports,
      balanceFormatted: acc.balance_formatted,
      feeWei: feeLamports,
      feeFormatted: isSponsored ? "0 SOL (Gas Sponsored)" : "0.000005 SOL",
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
  token: { mint: string; symbol: string; decimals?: number },
  buyAmountSol: number,
  destinationAta?: string,
  slippageBps: number = 250,
): Promise<SweepTxResult> {
  const cfg = SWEEP_CHAINS.sol;
  const decimals = token.decimals ?? 6;
  const buyLamports = BigInt(Math.floor(buyAmountSol * 1e9));

  try {
    if (buyLamports <= 0n) {
      return {
        walletId,
        address: senderAddress,
        success: false,
        error: "Buy amount must be > 0 SOL",
      };
    }

    // 1. Fetch live Jupiter quote (SOL -> Token)
    const quote = await fetchJupiterQuote(SOL_MINT, token.mint, buyLamports.toString(), slippageBps);

    // 2. Build DEX Buy Versioned Message
    const { messageBase64 } = await buildDexBuyMessage(
      quote,
      senderAddress,
      feePayerAddress,
      destinationAta,
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

    // 4. Broadcast to Solana mainnet RPC
    const txHash = await invoke<string>("broadcast_solana_tx", {
      rawTxBase64: signResult.rawTxBase64,
    });

    const estTokens = (Number(quote.outAmount) / (10 ** decimals)).toFixed(decimals > 6 ? 4 : 2);

    return {
      walletId,
      address: senderAddress,
      success: true,
      txHash,
      explorerUrl: `${cfg.explorerUrl}${txHash}`,
      amountSent: `${buyAmountSol} SOL → +${estTokens} ${token.symbol}`,
    };
  } catch (err) {
    return {
      walletId,
      address: senderAddress,
      success: false,
      error: String(err),
    };
  }
}

