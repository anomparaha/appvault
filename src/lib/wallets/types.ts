/**
 * Wallet domain types.
 */

import type { TokenBalance } from "../chains/types";

export type WalletType = "seed" | "pk" | "sol_pk" | "invalid";

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
