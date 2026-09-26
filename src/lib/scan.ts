import { invoke } from "@tauri-apps/api/core";

export interface ScanSummary {
  scanned: number;
  funded: number;
  errors: number;
}

export async function rustScan(walletId?: number, walletIds?: number[]): Promise<ScanSummary> {
  return invoke<ScanSummary>("scan_balances", {
    walletId: walletId ?? null,
    walletIds: walletIds ?? null,
  });
}