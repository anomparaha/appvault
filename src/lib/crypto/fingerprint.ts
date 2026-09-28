import { invoke } from "@tauri-apps/api/core";
import { canonicalKey } from "../wallets/wallet";

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Computes a keyed HMAC-SHA256 wallet fingerprint via Rust native core.
 * Output format: `hmac1:...` derived from the user's master key in volatile memory.
 * Completely neutralizes offline dictionary and rainbow table oracle attacks.
 * Fail-closed: Requires an active, authenticated sessionToken.
 */
export async function walletFingerprint(text: string, sessionToken: string): Promise<string> {
  if (!sessionToken) {
    throw new Error("Authentication required: sessionToken must be provided for keyed wallet fingerprint");
  }
  return await invoke<string>("vault_calculate_fingerprint", {
    sessionToken,
    data: text,
  });
}

/**
 * Computes keyed fingerprints in high-throughput batch via native Rust core IPC.
 * Eliminates thousands of IPC round-trips during bulk folder imports.
 * Fail-closed: Requires an active, authenticated sessionToken.
 */
export async function walletFingerprintsBatch(
  texts: string[],
  sessionToken: string
): Promise<string[]> {
  if (!sessionToken) {
    throw new Error("Authentication required: sessionToken must be provided for batch keyed wallet fingerprint");
  }
  return await invoke<string[]>("vault_calculate_fingerprints_batch", {
    sessionToken,
    items: texts,
  });
}

/**
 * Legacy unkeyed canonical SHA-256 fingerprint helper.
 * Strictly reserved for offline testing or unauthenticated dry-run environments.
 */
export async function walletFingerprintLegacy(text: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(canonicalKey(text)));
  return toB64(new Uint8Array(hash));
}
