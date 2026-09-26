import { useState, useEffect, useMemo, useRef } from "react";
import { balanceAmount } from "../lib/chains";

export interface TokenPriceQuote {
  usd: number;
  eth: number;
  nativePrice?: number;
  nativeSymbol?: string;
  fetchedAt: number;
}

export function getChainNativeSymbol(chain?: string): string {
  const c = (chain || "").toLowerCase().trim();
  if (c === "sol" || c === "solana") return "SOL";
  if (c === "bsc" || c === "binance") return "BNB";
  if (c === "btc" || c === "bitcoin") return "BTC";
  if (c === "polygon" || c === "matic") return "POL";
  if (c === "avax" || c === "avalanche") return "AVAX";
  if (c === "ftm" || c === "fantom") return "FTM";
  return "ETH";
}

export function getDefaultNativeUsdPrice(nativeSymbol: string): number {
  switch (nativeSymbol.toUpperCase()) {
    case "SOL": return 180;
    case "BNB": return 600;
    case "BTC": return 95000;
    case "POL":
    case "MATIC": return 0.50;
    case "AVAX": return 25;
    case "FTM": return 0.70;
    case "ETH":
    default: return 2680;
  }
}

// In-memory cache for live DEX quotes
const priceCache = new Map<string, TokenPriceQuote>();

// Baseline market prices for known tokens (Robinhood Chain, Solana & Ecosystem)
const BASELINE_PRICES: Record<string, { usd: number; eth: number; sol?: number; bnb?: number }> = {
  // Go Cat (GOCAT on Solana SPL)
  "gocat": { usd: 0.0001438, eth: 0.0000000536, sol: 0.000000799 },
  "go cat": { usd: 0.0001438, eth: 0.0000000536, sol: 0.000000799 },

  // OpenJEV (JEV on Robinhood Chain)
  "0x4d066ab4d924b7b3d01c6ecbfc142efe33aeb7fa": { usd: 0.0003003, eth: 0.0000001116 },
  "jev": { usd: 0.0003003, eth: 0.0000001116 },

  // Summa (SMA on Robinhood Chain)
  "0x3bd9136d51af679bd1b11d06b951155543c5449f": { usd: 0.00000456, eth: 0.000000001695 },
  "sma": { usd: 0.00000456, eth: 0.000000001695 },

  // Asteroid Shiba (ASTEROID on Robinhood Chain)
  "0x38aaf33082b20aff2e33433138de920f131b7777": { usd: 0.00001918, eth: 0.000000007131 },
  "asteroid": { usd: 0.00001918, eth: 0.000000007131 },
  "0x6e96e5d84513996ef7df308af345f9283c4da284": { usd: 0.00001918, eth: 0.000000007131 },
  "ib-asteroid": { usd: 0.00001918, eth: 0.000000007131 },

  // Global Dollar (USDG / ROBIN on Robinhood Chain)
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": { usd: 0.2641, eth: 0.0000985 },
  "usdg": { usd: 1.0, eth: 0.000373 },

  // Plurivex ($PLUR / PLX Official)
  "0xf890d3fe2be22c6259bbe9f607692c7168556c93": { usd: 0.10, eth: 0.0000373 },
  "plur": { usd: 0.10, eth: 0.0000373 },
  "$plur": { usd: 0.10, eth: 0.0000373 },
  "plx": { usd: 0.10, eth: 0.0000373 },

  // Bobby The Cat (Solana SPL)
  "bobbytpe2kpajwh5tppky72knd2cwmtdya63bqo2yiks": { usd: 0.00000069, eth: 0.000000000257, sol: 0.00000000383 },
  "bobby": { usd: 0.00000069, eth: 0.000000000257, sol: 0.00000000383 },
};

/**
 * Fetch live DEX quote from DexScreener with 60s cache.
 */
export async function fetchLiveTokenPrice(
  contractAddress: string,
  ethUsdPrice = 2680,
  chain?: string,
  nativeUsdPrice?: number
): Promise<TokenPriceQuote | null> {
  const normAddr = (contractAddress || "").trim().toLowerCase();
  if (!normAddr) return null;

  const now = Date.now();
  const cached = priceCache.get(normAddr);
  if (cached && now - cached.fetchedAt < 60000) {
    return cached;
  }

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${normAddr}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const pair = data.pairs?.[0];

    if (pair) {
      const usd = parseFloat(pair.priceUsd || "0") || 0;
      const pairChain = (pair.chainId || chain || "").toLowerCase();
      const nativeSymbol = getChainNativeSymbol(pairChain);
      const pairNativePrice = parseFloat(pair.priceNative || "0") || 0;

      const effNativeUsd = (nativeUsdPrice && nativeUsdPrice > 0)
        ? nativeUsdPrice
        : getDefaultNativeUsdPrice(nativeSymbol);

      const effEthUsd = ethUsdPrice > 0 ? ethUsdPrice : 2680;
      const eth = effEthUsd > 0 ? usd / effEthUsd : 0;
      const nativePrice = pairNativePrice > 0 ? pairNativePrice : (effNativeUsd > 0 ? usd / effNativeUsd : 0);

      const quote: TokenPriceQuote = { usd, eth, nativePrice, nativeSymbol, fetchedAt: now };
      priceCache.set(normAddr, quote);
      return quote;
    }
  } catch (err) {
    // Fail silently to baseline fallback
  }

  // Fallback to baseline if available
  if (BASELINE_PRICES[normAddr]) {
    const baseline = BASELINE_PRICES[normAddr];
    const nativeSymbol = getChainNativeSymbol(chain);
    const effNativeUsd = (nativeUsdPrice && nativeUsdPrice > 0)
      ? nativeUsdPrice
      : getDefaultNativeUsdPrice(nativeSymbol);

    const quote: TokenPriceQuote = {
      usd: baseline.usd,
      eth: baseline.eth || (ethUsdPrice > 0 ? baseline.usd / ethUsdPrice : 0),
      nativePrice: nativeSymbol === "SOL" && baseline.sol
        ? baseline.sol
        : (effNativeUsd > 0 ? baseline.usd / effNativeUsd : 0),
      nativeSymbol,
      fetchedAt: now,
    };
    priceCache.set(normAddr, quote);
    return quote;
  }

  return null;
}

/**
 * Synchronously get initial price (from cache or baseline).
 */
export function getInitialTokenPrice(
  symbol?: string,
  contractAddress?: string,
  ethUsdPrice = 2680,
  chainOrNativeSymbol?: string,
  nativeUsdPrice?: number
): TokenPriceQuote {
  const normAddr = (contractAddress || "").trim().toLowerCase();
  const normSym = (symbol || "").trim().toLowerCase().replace(/^\$/, "");
  const nativeSymbol = getChainNativeSymbol(chainOrNativeSymbol);

  if (normAddr && priceCache.has(normAddr)) {
    return priceCache.get(normAddr)!;
  }

  const baseline =
    (normAddr && BASELINE_PRICES[normAddr]) ||
    BASELINE_PRICES[normSym] ||
    (normSym.includes("plur") ? BASELINE_PRICES["plur"] : null);

  if (baseline) {
    const effNativeUsd = (nativeUsdPrice && nativeUsdPrice > 0)
      ? nativeUsdPrice
      : getDefaultNativeUsdPrice(nativeSymbol);

    return {
      usd: baseline.usd,
      eth: baseline.eth || (ethUsdPrice > 0 ? baseline.usd / ethUsdPrice : 0),
      nativePrice: nativeSymbol === "SOL" && baseline.sol
        ? baseline.sol
        : (effNativeUsd > 0 ? baseline.usd / effNativeUsd : 0),
      nativeSymbol,
      fetchedAt: Date.now(),
    };
  }

  return { usd: 0, eth: 0, nativePrice: 0, nativeSymbol, fetchedAt: 0 };
}

export interface TokenValuationResult {
  usdFormatted: string;
  nativeFormatted: string;
  nativeSymbol: string;
  totalUsd: number;
  totalNative: number;
  priceUsd: number;
  priceNative: number;
  ethFormatted: string;
  totalEth: number;
  priceEth: number;
}

/**
 * Hook to resolve live USD and Chain-Native (SOL / BNB / BTC / ETH) valuation for any token holding.
 */
export function useTokenValuation(
  token: { symbol: string; balance: string; chain?: string; contractAddress?: string },
  options?: { ethUsdPrice?: number; getUsd?: (symbol: string) => number } | number
): TokenValuationResult {
  const ethUsdPrice = typeof options === "number" ? options : options?.ethUsdPrice ?? 2680;
  const getUsd = typeof options === "object" ? options?.getUsd : undefined;

  const nativeSymbol = getChainNativeSymbol(token.chain);
  const nativeUsdPrice =
    (getUsd ? getUsd(nativeSymbol) : 0) ||
    (nativeSymbol === "ETH" ? ethUsdPrice : getDefaultNativeUsdPrice(nativeSymbol));

  const [quote, setQuote] = useState<TokenPriceQuote>(() =>
    getInitialTokenPrice(token.symbol, token.contractAddress, ethUsdPrice, token.chain, nativeUsdPrice)
  );

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const addr = token.contractAddress?.trim().toLowerCase();
    if (!addr) {
      setQuote(getInitialTokenPrice(token.symbol, undefined, ethUsdPrice, token.chain, nativeUsdPrice));
      return;
    }

    fetchLiveTokenPrice(addr, ethUsdPrice, token.chain, nativeUsdPrice).then((live) => {
      if (live && mountedRef.current) {
        setQuote(live);
      }
    });
  }, [token.contractAddress, token.symbol, token.chain, ethUsdPrice, nativeUsdPrice]);

  return useMemo(() => {
    const num = balanceAmount(token.balance);
    const totalUsd = num * quote.usd;
    const totalEth = ethUsdPrice > 0 ? totalUsd / ethUsdPrice : 0;
    const totalNative = nativeUsdPrice > 0 ? totalUsd / nativeUsdPrice : 0;

    let usdFormatted = "0.00";
    if (totalUsd > 0) {
      if (totalUsd < 0.01) {
        usdFormatted = "< 0.01";
      } else {
        usdFormatted = totalUsd.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    }

    let nativeFormatted = "0.0000";
    if (totalNative > 0) {
      if (totalNative < 0.0001) {
        nativeFormatted = "< 0.0001";
      } else if (totalNative >= 1000) {
        nativeFormatted = totalNative.toFixed(2);
      } else if (totalNative >= 1) {
        nativeFormatted = totalNative.toFixed(4).replace(/\.?0+$/, "");
      } else {
        nativeFormatted = totalNative.toFixed(4);
      }
    }

    let ethFormatted = "0.0000";
    if (totalEth > 0) {
      if (totalEth < 0.0001) {
        ethFormatted = "< 0.0001";
      } else {
        ethFormatted = totalEth.toFixed(4).replace(/\.?0+$/, "");
      }
    }

    return {
      usdFormatted,
      nativeFormatted,
      nativeSymbol,
      totalUsd,
      totalNative,
      priceUsd: quote.usd,
      priceNative: quote.nativePrice ?? (nativeUsdPrice > 0 ? quote.usd / nativeUsdPrice : 0),
      ethFormatted,
      totalEth,
      priceEth: quote.eth,
    };
  }, [token.balance, quote, nativeSymbol, nativeUsdPrice, ethUsdPrice]);
}

/**
 * Reusable visual component to render the USD and Chain-Native (SOL/BNB/ETH/BTC) price tag on any token card.
 */
export function TokenValuationBadge({
  token,
  ethUsdPrice = 2680,
  getUsd,
}: {
  token: { symbol: string; balance: string; chain?: string; contractAddress?: string };
  ethUsdPrice?: number;
  getUsd?: (symbol: string) => number;
}) {
  const { usdFormatted, nativeFormatted, nativeSymbol, totalUsd } = useTokenValuation(token, {
    ethUsdPrice,
    getUsd,
  });

  const nativeColor =
    nativeSymbol === "SOL"
      ? "#c084fc"
      : nativeSymbol === "BNB"
      ? "#facc15"
      : nativeSymbol === "BTC"
      ? "#fb923c"
      : "var(--accent, #7aa2f7)";

  return (
    <div
      className="token-card-valuation"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "4px",
        fontSize: "11px",
        fontFamily: "var(--mono)",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          color: totalUsd > 0 ? "var(--ok, #10b981)" : "var(--text-dim)",
          fontWeight: 650,
        }}
        title={`Nilai estimasi USD: $${usdFormatted}`}
      >
        ≈ ${usdFormatted} USD
      </span>
      <span style={{ color: "var(--text-faint)", fontSize: "9px" }}>•</span>
      <span
        style={{
          color: totalUsd > 0 ? nativeColor : "var(--text-dim)",
          fontWeight: 500,
        }}
        title={`Nilai estimasi dalam native ${nativeSymbol}: ${nativeFormatted} ${nativeSymbol}`}
      >
        ≈ {nativeFormatted} {nativeSymbol}
      </span>
    </div>
  );
}
