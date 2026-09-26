/**
 * lib/types barrel — re-exports from per-domain type files.
 *
 * Prefer importing directly from the domain module, e.g.:
 *   import type { WalletRecord } from "../wallets/types";
 */

export type { WalletType, WalletRecord, WalletView } from "../wallets/types";
export type { TokenBalance } from "../chains/types";
export type { ScanProgress } from "../services/scan-types";
