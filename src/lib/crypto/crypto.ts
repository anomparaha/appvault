import { invoke } from "@tauri-apps/api/core";

/**
 * Native Vault Cryptography Service
 * Delegates 100% of cryptographic operations (Argon2id key derivation & AES-256-GCM)
 * to the Rust core backend, ensuring zero key exposure in webview memory.
 */


export async function createVerificationToken(password: string): Promise<string> {
  return await invoke<string>("vault_create_token", { password });
}

export async function verifyPassword(token: string, password: string): Promise<boolean> {
  try {
    return await invoke<boolean>("vault_verify_token", { token, password });
  } catch (err) {
    console.error("Failed to verify password via Rust native core:", err);
    return false;
  }
}