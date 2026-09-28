import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WalletView } from "../lib/types/index";

export interface OfficialTokenInfo {
  contractAddress: string;
  chain: "robinhood" | "bsc" | "eth" | "base" | "arb" | "sol";
  chainLabel: string;
  standard: string;
  name: string;
  symbol: string;
  decimals: number;
  verified: boolean;
  explorerUrl: string;
  description: string;
  logoUrl: string;
  ipfsLogo?: string;
  websiteUrl?: string;
  twitterUrl?: string;
  marketData?: {
    priceUsd?: number;
    priceChange24h?: number;
  };
}

/**
 * Verified Official Token Specification.
 * Fixed contract address on Robinhood Chain as officially registered.
 */
export const OFFICIAL_TOKEN_SPEC: OfficialTokenInfo = {
  contractAddress: "0xf890d3fe2be22c6259bbe9f607692c7168556c93",
  chain: "robinhood",
  chainLabel: "Robinhood Chain",
  standard: "ERC-20",
  name: "Plurivex",
  symbol: "$PLUR",
  decimals: 18,
  verified: true,
  explorerUrl: "https://robinhoodchain.blockscout.com/token/0xf890d3fe2be22c6259bbe9f607692c7168556c93",
  description: "Official Native Ecosystem and Governance Token of Plurivex",
  logoUrl: "/plurivex-token-logo-128.png",
  ipfsLogo: "ipfs://QmZQN949vNYyVUhb44USAejtYXRitbxAaU1pNxAkyNUQCm",
  websiteUrl: "https://plurivex.app",
  twitterUrl: "https://x.com/Plurivex",
};

/**
 * Fetches real-time metadata directly from Robinhood Chain RPC.
 */
function assertMetadataNetworkAllowed(sessionToken: string, isAirGapped: boolean): void {
  if (!sessionToken?.trim()) throw new Error("Unlock the vault before fetching token metadata.");
  if (isAirGapped) throw new Error("Safe Mode blocks token metadata network requests.");
}

export async function fetchOfficialTokenFromRpc(
  sessionToken: string,
  isAirGapped: boolean,
  signal?: AbortSignal,
): Promise<Partial<OfficialTokenInfo>> {
  assertMetadataNetworkAllowed(sessionToken, isAirGapped);
  if (signal?.aborted) throw new DOMException("Metadata request cancelled", "AbortError");

  try {
    // Do not call RPCs from the webview: the native command revalidates both the
    // vault session and Safe Mode immediately before each network request.
    const metadata = await invoke<{
      name?: string | null;
      symbol?: string | null;
      description?: string | null;
      ipfsLogo?: string | null;
    }>("get_official_token_metadata", { sessionToken });
    if (signal?.aborted) throw new DOMException("Metadata request cancelled", "AbortError");
    return {
      name: metadata.name || undefined,
      symbol: metadata.symbol || undefined,
      description: metadata.description || undefined,
      ipfsLogo: metadata.ipfsLogo || undefined,
      // Render only the bundled logo; never turn an on-chain URI into a browser
      // request that could track the user's IP or trigger an arbitrary fetch.
      logoUrl: OFFICIAL_TOKEN_SPEC.logoUrl,
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn("Native RPC token metadata query fallback:", err);
    return {};
  }
}

/**
 * Calculates the total aggregate balance of the official token held across all vault wallets.
 */
export function calculateVaultTokenHoldings(wallets: WalletView[]): number {
  if (!wallets || wallets.length === 0) return 0;
  let total = 0;

  for (const w of wallets) {
    for (const token of w.tokens || []) {
      // Symbols and names are issuer-controlled metadata. Only the canonical contract
      // on its configured chain can represent the official asset.
      if (!isOfficialTokenRecord(token)) continue;
      const amount = Number.parseFloat(token.balance);
      if (Number.isFinite(amount) && amount > 0) total += amount;
    }
  }
  return total;
}

/**
 * Checks if a specific token record matches the official token.
 */
export function isOfficialTokenRecord(token: { chain?: string; contractAddress?: string } | null | undefined): boolean {
  if (!token?.chain || !token.contractAddress) return false;
  return token.chain.trim().toLowerCase() === OFFICIAL_TOKEN_SPEC.chain &&
    token.contractAddress.trim().toLowerCase() === OFFICIAL_TOKEN_SPEC.contractAddress.toLowerCase();
}

/**
 * Decoupled data-fetching service for the official token.
 * Easily extensible for future backend endpoints, indexers, or on-chain oracles.
 */
export async function fetchOfficialTokenData(
  sessionToken: string,
  isAirGapped: boolean,
  signal?: AbortSignal,
): Promise<OfficialTokenInfo> {
  assertMetadataNetworkAllowed(sessionToken, isAirGapped);
  const rpcData = await fetchOfficialTokenFromRpc(sessionToken, isAirGapped, signal);
  if (signal?.aborted) throw new DOMException("Metadata request cancelled", "AbortError");

  return {
    ...OFFICIAL_TOKEN_SPEC,
    ...rpcData,
    // Keep logos bundled and local: dynamic token-controlled URLs must not cause
    // an unsolicited third-party image request from the webview.
    logoUrl: OFFICIAL_TOKEN_SPEC.logoUrl,
  };
}

/**
 * React hook to consume official token data and vault holdings reactively.
 */
export function useOfficialToken(wallets: WalletView[] = [], sessionToken = "", isAirGapped = true) {
  const enabled = Boolean(sessionToken.trim()) && !isAirGapped;
  const [tokenInfo, setTokenInfo] = useState<OfficialTokenInfo>(OFFICIAL_TOKEN_SPEC);
  const [loading, setLoading] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);

  const vaultHoldings = useMemo(() => {
    return calculateVaultTokenHoldings(wallets);
  }, [wallets]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    try {
      const data = await fetchOfficialTokenData(sessionToken, isAirGapped, controller.signal);
      if (!controller.signal.aborted) setTokenInfo(data);
    } catch (error) {
      if (!controller.signal.aborted) console.warn("Official token metadata refresh failed:", error);
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [enabled, sessionToken, isAirGapped]);

  useEffect(() => {
    if (enabled) {
      void refresh();
    } else {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      setLoading(false);
    }
    return () => requestControllerRef.current?.abort();
  }, [enabled, refresh]);

  return {
    token: tokenInfo,
    vaultHoldings,
    isHolding: vaultHoldings > 0,
    loading,
    refresh,
  };
}
