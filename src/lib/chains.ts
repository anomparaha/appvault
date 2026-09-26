import type { TokenBalance, WalletType } from "./types";

export const CHAINS = [
  {
    key: "btc",
    label: "Bitcoin",
    short: "BTC",
    family: "bitcoin" as const,
    rpcs: [
      "https://mempool.space/api",
      "https://blockstream.info/api",
    ],
    symbol: "BTC",
    color: "#f7931a",
  },
  {
    key: "eth",
    label: "Ethereum",
    short: "ETH",
    family: "evm" as const,
    rpcs: [
      "https://ethereum.publicnode.com",
      "https://eth.drpc.org",
      "https://cloudflare-eth.com",
      "https://rpc.ankr.com/eth",
    ],
    symbol: "ETH",
    color: "#627eea",
    chainId: 1,
  },
  {
    key: "robinhood",
    label: "Robinhood",
    short: "ROBINHOOD",
    family: "evm" as const,
    rpcs: [
      "https://api.zan.top/node/v1/robinhood/mainnet/9f2590af4fda43418ca4f0e8ded27af5",
      "https://rpc.mainnet.chain.robinhood.com",
    ],
    wsRpc: "wss://api.zan.top/node/ws/v1/robinhood/mainnet/9f2590af4fda43418ca4f0e8ded27af5",
    symbol: "ETH",
    color: "#ccff00",
    chainId: 4663,
  },
  {
    key: "base",
    label: "Base",
    short: "BASE",
    family: "evm" as const,
    rpcs: [
      "https://mainnet.base.org",
      "https://base.publicnode.com",
      "https://rpc.ankr.com/base",
    ],
    symbol: "ETH",
    color: "#0052ff",
    chainId: 8453,
  },
  {
    key: "arb",
    label: "Arbitrum",
    short: "ARB",
    family: "evm" as const,
    rpcs: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.publicnode.com",
      "https://rpc.ankr.com/arbitrum",
    ],
    symbol: "ETH",
    color: "#28a0f0",
    chainId: 42161,
  },
  {
    key: "bsc",
    label: "BNB Chain",
    short: "BSC",
    family: "evm" as const,
    rpcs: [
      "https://bsc-dataseed.binance.org",
      "https://bsc-dataseed1.defibit.io",
      "https://bsc-dataseed2.binance.org",
      "https://rpc.ankr.com/bsc",
    ],
    symbol: "BNB",
    color: "#f0b90b",
    chainId: 56,
  },
  {
    key: "sol",
    label: "Solana",
    short: "SOL",
    family: "solana" as const,
    rpcs: [
      "https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9",
      "https://api.mainnet-beta.solana.com",
      "https://solana-rpc.publicnode.com",
    ],
    symbol: "SOL",
    color: "#9945ff",
  },
] as const;

export type ChainKey = (typeof CHAINS)[number]["key"];
export type Chain = (typeof CHAINS)[number];

export const EVM_CHAINS = CHAINS.filter((c) => c.family === "evm");
export const SOL_CHAINS = CHAINS.filter((c) => c.family === "solana");
export const BTC_CHAINS = CHAINS.filter((c) => c.family === "bitcoin");

export function chainsForWallet(
  walletOrType?:
    | WalletType
    | { address?: string | null; solAddress?: string | null; btcAddress?: string | null; type?: WalletType }
): readonly Chain[] {
  if (!walletOrType) return CHAINS;
  if (typeof walletOrType === "string") {
    if (walletOrType === "pk") return EVM_CHAINS;
    if (walletOrType === "sol_pk") return SOL_CHAINS;
    return CHAINS;
  }
  const hasEvm = Boolean(walletOrType.address);
  const hasSol = Boolean(walletOrType.solAddress);
  const hasBtc = Boolean(walletOrType.btcAddress);
  return CHAINS.filter((c) => {
    if (c.family === "evm") return hasEvm;
    if (c.family === "solana") return hasSol;
    if (c.family === "bitcoin") return hasBtc;
    return true;
  });
}


export function balanceAmount(v: string | null | undefined): number {
  if (!v || v === "error" || v === "loading") return 0;
  const clean = v.replace(/^[<>=~]\s*/, "");
  const num = parseFloat(clean);
  return Number.isFinite(num) ? num : 0;
}

function sumBalance(balances: Record<string, string | null>, chains: readonly Chain[]): number {
  return chains.reduce((sum, c) => sum + balanceAmount(balances[c.key]), 0);
}

export function totalBalanceForWallet(
  balances: Record<string, string | null>,
  type: WalletType,
  getUsd?: (symbol: string) => number,
): number {
  const chains = chainsForWallet(type);
  if (getUsd) {
    return chains.reduce((sum, c) => {
      const amt = balanceAmount(balances[c.key]);
      return sum + (amt > 0 ? amt * getUsd(c.symbol) : 0);
    }, 0);
  }
  return sumBalance(balances, chains);
}

export function totalBalanceOnEvm(
  balances: Record<string, string | null>,
  tokens?: TokenBalance[],
): number {
  const evmChains = CHAINS.filter((c) => c.family === "evm");
  const nativeSum = evmChains.reduce((sum, c) => sum + balanceAmount(balances[c.key]), 0);
  const tokenSum = (tokens || []).reduce((sum, t) => {
    if (t.chain.toLowerCase() !== "sol") {
      return sum + balanceAmount(t.balance);
    }
    return sum;
  }, 0);
  return nativeSum + tokenSum;
}

export function totalBalanceOnSol(
  balances: Record<string, string | null>,
  tokens?: TokenBalance[],
): number {
  const nativeSol = balanceAmount(balances["sol"]);
  const tokenSol = (tokens || []).reduce((sum, t) => {
    if (t.chain.toLowerCase() === "sol") {
      return sum + balanceAmount(t.balance);
    }
    return sum;
  }, 0);
  return nativeSol + tokenSol;
}

export function hasFundsForWallet(
  balances: Record<string, string | null>,
  type: WalletType,
  tokens?: TokenBalance[],
): boolean {
  const nativeHasFunds = chainsForWallet(type).some((c) => balanceAmount(balances[c.key]) > 0);
  if (nativeHasFunds) return true;
  if (tokens && tokens.length > 0) {
    return tokens.some((t) => balanceAmount(t.balance) > 0);
  }
  return false;
}

export function hasFundsOnEvm(
  balances: Record<string, string | null>,
  tokens?: TokenBalance[],
): boolean {
  const evmChains = CHAINS.filter((c) => c.family === "evm");
  const nativeHasFunds = evmChains.some((c) => balanceAmount(balances[c.key]) > 0);
  if (nativeHasFunds) return true;
  if (tokens && tokens.length > 0) {
    return tokens.some((t) => t.chain.toLowerCase() !== "sol" && balanceAmount(t.balance) > 0);
  }
  return false;
}

export function hasFundsOnSol(
  balances: Record<string, string | null>,
  tokens?: TokenBalance[],
): boolean {
  const solHasFunds = balanceAmount(balances["sol"]) > 0;
  if (solHasFunds) return true;
  if (tokens && tokens.length > 0) {
    return tokens.some((t) => t.chain.toLowerCase() === "sol" && balanceAmount(t.balance) > 0);
  }
  return false;
}

export function hasFundsOnChain(
  chainKey: string,
  balances: Record<string, string | null>,
  tokens?: TokenBalance[],
): boolean {
  const k = chainKey.toLowerCase();
  const num = balanceAmount(balances[k]);
  if (num > 0) return true;
  if (tokens && tokens.length > 0) {
    return tokens.some((t) => t.chain.toLowerCase() === k && balanceAmount(t.balance) > 0);
  }
  return false;
}

export function formatCompactBalance(v: string | null | undefined): string {
  if (!v || v === "error" || v === "loading") return "0";
  const parts = v.trim().split(" ");
  const rawNum = parts[0];
  const symbol = parts[1] || "";
  const num = parseFloat(rawNum);
  if (!Number.isFinite(num) || num === 0) return `0 ${symbol}`;
  if (num < 0.00001) return `< 0.0001 ${symbol}`;
  if (num < 1) return `${num.toFixed(4).replace(/\.?0+$/, "")} ${symbol}`;
  return `${num.toFixed(3).replace(/\.?0+$/, "")} ${symbol}`;
}
