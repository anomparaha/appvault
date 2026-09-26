import { useState, useEffect, useMemo, useCallback } from "react";
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
 * ABI string decoder for dynamic eth_call responses.
 */
function decodeAbiString(hex?: string): string {
  if (!hex || hex === "0x") return "";
  const clean = hex.replace(/^0x/, "");
  if (clean.length >= 128) {
    try {
      const length = parseInt(clean.substring(64, 128), 16);
      const dataHex = clean.substring(128, 128 + length * 2);
      const bytes: number[] = [];
      for (let i = 0; i < dataHex.length; i += 2) {
        bytes.push(parseInt(dataHex.substring(i, i + 2), 16));
      }
      return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0/g, "").trim();
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Resolves IPFS URI to public web gateway or local fallback.
 */
export function resolveTokenLogoUrl(ipfsOrUrl?: string): string {
  if (!ipfsOrUrl) return OFFICIAL_TOKEN_SPEC.logoUrl;
  if (ipfsOrUrl.startsWith("ipfs://")) {
    const cid = ipfsOrUrl.replace(/^ipfs:\/\//, "");
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return ipfsOrUrl;
}

/**
 * Fetches real-time metadata directly from Robinhood Chain RPC.
 */
export async function fetchOfficialTokenFromRpc(): Promise<Partial<OfficialTokenInfo>> {
  const rpcUrl = "https://api.zan.top/node/v1/robinhood/mainnet/9f2590af4fda43418ca4f0e8ded27af5";
  const contract = OFFICIAL_TOKEN_SPEC.contractAddress;

  const calls = [
    { method: "0x06fdde03", key: "name" },
    { method: "0x95d89b41", key: "symbol" },
    { method: "0x7284e416", key: "description" },
    { method: "0xfb7f21eb", key: "logo" },
  ];

  try {
    const results: Record<string, string> = {};
    for (const call of calls) {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: contract, data: call.method }, "latest"],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.result) {
          results[call.key] = decodeAbiString(json.result);
        }
      }
    }

    const resolvedLogo = results.logo ? resolveTokenLogoUrl(results.logo) : OFFICIAL_TOKEN_SPEC.logoUrl;

    return {
      name: results.name || OFFICIAL_TOKEN_SPEC.name,
      symbol: results.symbol || OFFICIAL_TOKEN_SPEC.symbol,
      description: results.description || OFFICIAL_TOKEN_SPEC.description,
      ipfsLogo: results.logo || OFFICIAL_TOKEN_SPEC.ipfsLogo,
      logoUrl: resolvedLogo,
    };
  } catch (err) {
    console.warn("RPC token metadata query fallback:", err);
    return {};
  }
}

/**
 * Calculates the total aggregate balance of the official token held across all vault wallets.
 */
export function calculateVaultTokenHoldings(wallets: WalletView[]): number {
  if (!wallets || wallets.length === 0) return 0;
  let total = 0;
  const targetContract = OFFICIAL_TOKEN_SPEC.contractAddress.toLowerCase();
  const targetSymbol = OFFICIAL_TOKEN_SPEC.symbol.replace(/^\$/, "").toLowerCase();

  for (const w of wallets) {
    if (w.tokens && w.tokens.length > 0) {
      for (const t of w.tokens) {
        const matchesContract = Boolean(
          t.contractAddress && t.contractAddress.toLowerCase() === targetContract
        );
        const cleanSymbol = t.symbol.replace(/^\$/, "").toLowerCase();
        const matchesSymbol = cleanSymbol === targetSymbol;

        if (matchesContract || matchesSymbol) {
          const num = parseFloat(t.balance);
          if (Number.isFinite(num) && num > 0) {
            total += num;
          }
        }
      }
    }
  }
  return total;
}

/**
 * Checks if a specific token record matches the official token.
 */
export function isOfficialTokenRecord(token: { symbol?: string; contractAddress?: string }): boolean {
  if (!token) return false;
  const targetContract = OFFICIAL_TOKEN_SPEC.contractAddress.toLowerCase();
  if (token.contractAddress && token.contractAddress.toLowerCase() === targetContract) {
    return true;
  }
  const cleanSym = (token.symbol || "").replace(/^\$/, "").toLowerCase();
  const targetSym = OFFICIAL_TOKEN_SPEC.symbol.replace(/^\$/, "").toLowerCase();
  return cleanSym === targetSym;
}

/**
 * Decoupled data-fetching service for the official token.
 * Easily extensible for future backend endpoints, indexers, or on-chain oracles.
 */
export async function fetchOfficialTokenData(customEndpoint?: string): Promise<OfficialTokenInfo> {
  const endpoint = customEndpoint || (import.meta as any).env?.VITE_OFFICIAL_TOKEN_API;

  let rpcData: Partial<OfficialTokenInfo> = {};
  try {
    rpcData = await fetchOfficialTokenFromRpc();
  } catch {
    // fallback to default
  }

  if (!endpoint) {
    return {
      ...OFFICIAL_TOKEN_SPEC,
      ...rpcData,
      logoUrl: OFFICIAL_TOKEN_SPEC.logoUrl,
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return {
      ...OFFICIAL_TOKEN_SPEC,
      ...rpcData,
      name: json.name || rpcData.name || OFFICIAL_TOKEN_SPEC.name,
      symbol: json.symbol || rpcData.symbol || OFFICIAL_TOKEN_SPEC.symbol,
      marketData: json.marketData,
      logoUrl: OFFICIAL_TOKEN_SPEC.logoUrl,
    };
  } catch (err) {
    console.warn("Using baseline official token specification:", err);
    return {
      ...OFFICIAL_TOKEN_SPEC,
      ...rpcData,
      logoUrl: OFFICIAL_TOKEN_SPEC.logoUrl,
    };
  }
}

/**
 * React hook to consume official token data and vault holdings reactively.
 */
export function useOfficialToken(wallets: WalletView[] = [], enabled = false) {
  const [tokenInfo, setTokenInfo] = useState<OfficialTokenInfo>(OFFICIAL_TOKEN_SPEC);
  const [loading, setLoading] = useState(false);

  const vaultHoldings = useMemo(() => {
    return calculateVaultTokenHoldings(wallets);
  }, [wallets]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await fetchOfficialTokenData();
      setTokenInfo(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      void refresh();
    } else {
      setLoading(false);
    }
  }, [enabled, refresh]);

  return {
    token: tokenInfo,
    vaultHoldings,
    isHolding: vaultHoldings > 0,
    loading,
    refresh,
  };
}
