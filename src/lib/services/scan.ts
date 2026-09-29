import { invoke } from "@tauri-apps/api/core";

export interface ScanSummary {
  scanned: number;
  funded: number;
  errors: number;
}

export async function rustScan(
  sessionToken: string,
  walletId?: number,
  walletIds?: number[],
  chainKey?: string,
  excludeChainKey?: string,
): Promise<ScanSummary> {
  return invoke<ScanSummary>("scan_balances", {
    sessionToken,
    walletId: walletId ?? null,
    walletIds: walletIds ?? null,
    chainKey: chainKey ?? null,
    excludeChainKey: excludeChainKey ?? null,
  });
}
