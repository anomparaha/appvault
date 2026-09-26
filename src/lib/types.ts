export type WalletType = "seed" | "pk" | "sol_pk" | "invalid";



export interface TokenBalance {
  walletId: number;
  chain: string;
  symbol: string;
  name: string;
  balance: string;
  rawBalance?: string;
  contractAddress?: string;
}

export interface WalletRecord {
  id: number;
  type: WalletType;
  encryptedSecret?: string | null;
  address: string | null;
  solAddress: string | null;
  btcAddress: string | null;
  wordCount: number | null;
  label: string | null;
  createdAt: string;
  balances: Record<string, string | null>;
  tokens: TokenBalance[];
}

export interface WalletView extends WalletRecord {
  secret?: string;
  totalBalance: number;
  hasFunds: boolean;
}

export interface ScanProgress {
  total: number;
  completed: number;
  funded: number;
  isScanning: boolean;
}

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}