import { invoke } from "@tauri-apps/api/core";
import type { WalletRecord, WalletType } from "../wallets/types";

export async function initDb(): Promise<void> {
  await invoke("vault_db_init");
}

export async function hasMasterPassword(): Promise<boolean> {
  return await invoke<boolean>("vault_db_has_master_password");
}

export async function hasPin(): Promise<boolean> {
  return await invoke<boolean>("vault_db_has_pin");
}

export async function saveMasterPassword(token: string, sessionToken?: string): Promise<void> {
  await invoke("vault_db_save_master_password", { token, sessionToken: sessionToken ?? null });
}

export async function savePinVault(pinToken: string, encryptedMasterPw: string, sessionToken: string): Promise<void> {
  await invoke("vault_db_save_pin_vault", {
    pinToken,
    encryptedMasterPw,
    sessionToken,
  });
}

export async function resetEntireVault(confirmation: string, sessionToken?: string): Promise<void> {
  await invoke("vault_db_reset_entire_vault", {
    confirmation: confirmation.trim(),
    sessionToken: sessionToken || null,
  });
}

export async function verifyMasterPasswordNative(password: string): Promise<boolean> {
  return await invoke<boolean>("vault_db_verify_master_password", { password });
}

export async function insertWalletsBatch(
  items: {
    type: WalletType;
    encryptedSecret: string;
    fingerprint: string;
    address: string | null;
    solAddress?: string | null;
    btcAddress?: string | null;
    wordCount: number | null;
  }[],
  sessionToken?: string,
): Promise<void> {
  if (!items.length) return;
  await invoke("vault_db_insert_wallets_batch", {
    items: items.map((i) => ({
      type: i.type,
      encryptedSecret: i.encryptedSecret,
      fingerprint: i.fingerprint,
      address: i.address,
      solAddress: i.solAddress ?? null,
      btcAddress: i.btcAddress ?? null,
      wordCount: i.wordCount,
    })),
    sessionToken: sessionToken ?? null,
  });
}

export async function getAllWallets(sessionToken?: string): Promise<WalletRecord[]> {
  return await invoke<WalletRecord[]>("vault_db_get_all_wallets", {
    sessionToken: sessionToken ?? null,
  });
}

export async function deleteWallet(id: number, password: string, sessionToken?: string): Promise<void> {
  await invoke("vault_db_delete_wallet", { id, password, sessionToken: sessionToken ?? "" });
}

export async function deleteAllWallets(password: string, sessionToken?: string): Promise<void> {
  await invoke("vault_db_delete_all_wallets", { password, sessionToken: sessionToken ?? "" });
}

export async function getExistingFingerprints(sessionToken?: string): Promise<Set<string>> {
  const fps = await invoke<string[]>("vault_db_get_existing_fingerprints", {
    sessionToken: sessionToken ?? null,
  });
  return new Set(fps);
}

export async function getExistingAddresses(sessionToken?: string): Promise<{
  evm: Map<string, { id: number; type: WalletType }>;
  sol: Map<string, { id: number; type: WalletType }>;
  btc: Map<string, { id: number; type: WalletType }>;
}> {
  const rows = await invoke<
    {
      id: number;
      type: WalletType;
      address: string | null;
      solAddress: string | null;
      btcAddress: string | null;
    }[]
  >("vault_db_get_existing_addresses", {
    sessionToken: sessionToken ?? null,
  });

  const evm = new Map<string, { id: number; type: WalletType }>();
  const sol = new Map<string, { id: number; type: WalletType }>();
  const btc = new Map<string, { id: number; type: WalletType }>();
  for (const r of rows) {
    if (r.address) {
      evm.set(r.address.toLowerCase(), { id: r.id, type: r.type });
    }
    if (r.solAddress) {
      sol.set(r.solAddress, { id: r.id, type: r.type });
    }
    if (r.btcAddress) {
      btc.set(r.btcAddress, { id: r.id, type: r.type });
    }
  }
  return { evm, sol, btc };
}

export async function updateWalletLabel(
  id: number,
  label: string | null,
  sessionToken?: string,
): Promise<void> {
  await invoke("vault_db_update_wallet_label", {
    id,
    label,
    sessionToken: sessionToken ?? null,
  });
}

export async function updateWalletAddresses(
  id: number,
  address: string | null,
  solAddress: string | null,
  btcAddress?: string | null,
  sessionToken?: string,
): Promise<void> {
  await invoke("vault_db_update_wallet_addresses", {
    id,
    address,
    solAddress,
    btcAddress: btcAddress ?? null,
    sessionToken: sessionToken ?? "",
  });
}

export async function cleanupDuplicateWallets(sessionToken?: string): Promise<number> {
  return await invoke<number>("vault_db_cleanup_duplicate_wallets", { sessionToken: sessionToken ?? "" });
}

export async function clearSweptBalanceDb(
  walletId: number,
  chain: string,
  tokenMintOrContract?: string,
  symbol?: string,
  sessionToken?: string,
): Promise<void> {
  try {
    await invoke("vault_db_clear_swept_balance", {
      walletId,
      chain,
      tokenMintOrContract: tokenMintOrContract || null,
      symbol: symbol || null,
      sessionToken: sessionToken || null,
    });
  } catch (err) {
    console.warn("Failed to clear swept balance in DB:", err);
  }
}