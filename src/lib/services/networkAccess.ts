import { invoke } from "@tauri-apps/api/core";

/**
 * Revalidate the native session and app-level Safe Mode gate immediately before
 * renderer-owned network activity. This is defense in depth, not OS-level network
 * isolation; native commands still enforce their own authenticated gate.
 */
export async function verifyOnlineNetworkAccess(sessionToken: string | null | undefined): Promise<void> {
  const token = sessionToken?.trim();
  if (!token) {
    throw new Error("A valid vault session is required for network access.");
  }

  await invoke("verify_online_network_access", { sessionToken: token });
}
