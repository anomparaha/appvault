import { useState, useEffect, useMemo } from "react";
import { tokenBalanceAmount } from "../lib/chains/chains";

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

export const TRUSTED_TOKEN_SYMBOLS_BY_CHAIN: Record<string, Record<string, string>> = {
  eth: {
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
    "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
    "0x514910771af9ca656af840dff83e8264ecf986ca": "LINK",
    "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": "UNI",
    "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce": "SHIB",
    "0x6982508145454ce325ddbe47a25d4ec3d2311933": "PEPE",
  },
  bsc: {
    "0x55d398326f99059ff775485246999027b3197955": "USDT",
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USDC",
    "0xe9e7cea3dedca5984780bafc599bd69add087d56": "BUSD",
    "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82": "CAKE",
    "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3": "DAI",
    "0x7130d2a12b9bcbbfae4f2634d864a1ee1ce3ead9": "WBTC",
  },
  base: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
    "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": "USDbC",
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": "DAI",
    "0x940181a94a35a4569e4529a3cdfb74e48fd98762": "AERO",
  },
  arb: {
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT",
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
    "0x912ce59144191c1204e64559fe8253a0e49e6548": "ARB",
    "0xda10009cbd5d07dd0cecc6616156627511bb9813": "DAI",
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "WBTC",
    "0xfc5a1a6eb0ba367c0e73da63a5cc324f9f4a2111": "GMX",
  },
  robinhood: {
    "0xf890d3fe2be22c6259bbe9f607692c7168556c93": "$PLUR",
    "0x2411cfb697efc0efd32a4e98f7be5ba098b671a5": "PLX",
    "0x0bd7d308f8e1639fab988df18a8011f41eacad73": "WETH",
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": "USDG",
    "0x38aaf33082b20aff2e33433138de920f131b7777": "ASTEROID",
    "0x6e96e5d84513996ef7df308af345f9283c4da284": "IB-ASTEROID",
    "0x4d066ab4d924b7b3d01c6ecbfc142efe33aeb7fa": "JEV",
    "0x3bd9136d51af679bd1b11d06b951155543c5449f": "SMA",
  },
  sol: {
    "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v": "USDC",
    "es9vmfrzacermjfrf4h2fyd4kconky11mcce8benwnyb": "USDT",
    "dezxaz8z7pnrnrjjz3wxborgixca6xjnb7yab1ppb263": "BONK",
    "jupyiwryjfskupiha7hker8vutaefosybkedznsdvcn": "JUP",
    "4k3dyjzvzp8emzwuxbbcjevwskkk59s5icnly3qrkx6r": "RAY",
    "ekpqgsjtjmfqkz9kqansqyxrcf8fbopzlhyxdm65zcjm": "WIF",
    "msolzycxhdygdzu16g5qsh3i5k3z3kzk7ytfqcjm7so": "MSOL",
    "bso13r4tkie4kuml71lshtppl2eubylfx6h9hp3piy1": "BSOL",
    "j1toso1uck3rlmjorhttrvwy9hj7x8v9yyac6y7kgcpn": "JITOSOL",
    "bobbytpe2kpajwh5tppky72knd2cwmtdya63bqo2yiks": "BOBBY",
  },
};

function normalizeChainKey(chain?: string): string {
  const value = (chain || "").toLowerCase();
  if (value === "ethereum") return "eth";
  if (value === "arbitrum") return "arb";
  if (value === "solana") return "sol";
  if (value === "rh") return "robinhood";
  return value;
}

function priceCacheKey(address: string, chain?: string): string {
  return `${normalizeChainKey(chain) || "any"}:${address.trim().toLowerCase()}`;
}

// In-memory cache for live DEX quotes, shared requests, and short negative
// cache so multiple token cards do not fan out duplicate provider calls.
const priceCache = new Map<string, TokenPriceQuote>();
const pendingPriceFetches = new Map<string, Promise<TokenPriceQuote | null>>();
const recentPriceMisses = new Map<string, number>();

/**
 * Fetch live DEX quote from DexScreener with 60s cache.
 */
function dexScreenerChainKey(chain?: string): string | null {
  const normalized = normalizeChainKey(chain);
  switch (normalized) {
    case "eth": return "ethereum";
    case "arb": return "arbitrum";
    case "bsc": return "bsc";
    case "base": return "base";
    case "sol": return "solana";
    case "robinhood": return "robinhood";
    default: return null;
  }
}

/**
 * Fetch live DEX quote from DexScreener with a chain-aware 60s cache. A quote is
 * accepted only when the requested contract is the base token in a liquid pair;
 * DexScreener's priceNative is not a safe inverse quote for arbitrary quote-side tokens.
 */
export async function fetchLiveTokenPrice(
  contractAddress: string,
  ethUsdPrice = 0,
  chain?: string,
  nativeUsdPrice?: number
): Promise<TokenPriceQuote | null> {
  const normAddr = (contractAddress || "").trim().toLowerCase();
  if (!normAddr) return null;

  const cacheKey = priceCacheKey(normAddr, chain);
  const now = Date.now();
  const cached = priceCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < 60_000) return cached;

  const pending = pendingPriceFetches.get(cacheKey);
  if (pending) return pending;
  const lastMissAt = recentPriceMisses.get(cacheKey);
  if (lastMissAt !== undefined && now - lastMissAt < 20_000) return null;

  const request = (async (): Promise<TokenPriceQuote | null> => {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(normAddr)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const expectedChain = dexScreenerChainKey(chain);
      const pairs = Array.isArray(data.pairs) ? data.pairs : [];
      const candidates = pairs
        .filter((pair: any) => {
          const baseAddress = String(pair.baseToken?.address || "").toLowerCase();
          const pairChain = String(pair.chainId || "").toLowerCase();
          return baseAddress === normAddr && (!expectedChain || pairChain === expectedChain);
        })
        .map((pair: any) => {
          const usd = Number.parseFloat(String(pair.priceUsd || "0")) || 0;
          const liquidityUsd = Number(pair.liquidity?.usd) || 0;
          return { pair, usd, liquidityUsd };
        })
        .filter((candidate: { usd: number; liquidityUsd: number }) =>
          Number.isFinite(candidate.usd) && candidate.usd > 0 && candidate.liquidityUsd > 0,
        )
        .sort((a: { liquidityUsd: number }, b: { liquidityUsd: number }) => b.liquidityUsd - a.liquidityUsd);

      const best = candidates[0];
      if (best) {
        const pairChain = String(best.pair.chainId || chain || "").toLowerCase();
        const nativeSymbol = getChainNativeSymbol(chain || pairChain);
        const quote: TokenPriceQuote = {
          usd: best.usd,
          eth: ethUsdPrice > 0 ? best.usd / ethUsdPrice : 0,
          nativePrice: nativeUsdPrice && nativeUsdPrice > 0 ? best.usd / nativeUsdPrice : 0,
          nativeSymbol,
          fetchedAt: Date.now(),
        };
        priceCache.set(cacheKey, quote);
        recentPriceMisses.delete(cacheKey);
        return quote;
      }
    } catch {
      // An unknown or unquoted token remains unpriced rather than using a hardcoded value.
    }

    recentPriceMisses.set(cacheKey, Date.now());
    return null;
  })();

  pendingPriceFetches.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (pendingPriceFetches.get(cacheKey) === request) pendingPriceFetches.delete(cacheKey);
  }
}

/**
 * Synchronously get an initial quote only when a live quote for this exact
 * chain/contract is already cached. Unknown or uncached assets remain unpriced.
 */
export function getInitialTokenPrice(
  _symbol?: string,
  contractAddress?: string,
  _ethUsdPrice = 0,
  chainOrNativeSymbol?: string,
  _nativeUsdPrice?: number
): TokenPriceQuote {
  const normAddr = (contractAddress || "").trim().toLowerCase();
  const nativeSymbol = getChainNativeSymbol(chainOrNativeSymbol);

  const cacheKey = normAddr ? priceCacheKey(normAddr, chainOrNativeSymbol) : "";
  if (cacheKey && priceCache.has(cacheKey)) {
    return priceCache.get(cacheKey)!;
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
  token: {
    symbol: string;
    balance: string;
    chain?: string;
    contractAddress?: string;
    rawBalance?: string;
    decimals?: number | null;
    amount?: number;
  },
  options?: { ethUsdPrice?: number; getUsd?: (symbol: string) => number; livePriceEnabled?: boolean } | number
): TokenValuationResult {
  const ethUsdPrice = typeof options === "number" ? options : options?.ethUsdPrice ?? 0;
  const getUsd = typeof options === "object" ? options?.getUsd : undefined;
  const livePriceEnabled = typeof options === "object" ? options?.livePriceEnabled ?? false : false;

  const nativeSymbol = getChainNativeSymbol(token.chain);
  const nativeUsdPrice = getUsd ? getUsd(nativeSymbol) : 0;

  const [quote, setQuote] = useState<TokenPriceQuote>(() =>
    getInitialTokenPrice(token.symbol, token.contractAddress, ethUsdPrice, token.chain, nativeUsdPrice)
  );

  useEffect(() => {
    let cancelled = false;
    const addr = token.contractAddress?.trim().toLowerCase();
    setQuote(getInitialTokenPrice(token.symbol, addr, ethUsdPrice, token.chain, nativeUsdPrice));
    if (!addr || !livePriceEnabled) return () => { cancelled = true; };

    fetchLiveTokenPrice(addr, ethUsdPrice, token.chain, nativeUsdPrice).then((live) => {
      if (live && !cancelled) setQuote(live);
    });
    return () => { cancelled = true; };
  }, [token.contractAddress, token.symbol, token.chain, ethUsdPrice, nativeUsdPrice, livePriceEnabled]);

  return useMemo(() => {
    const num = tokenBalanceAmount(token);
    const totalUsd = num * quote.usd;
    const totalEth = ethUsdPrice > 0 ? totalUsd / ethUsdPrice : 0;
    const totalNative = nativeUsdPrice > 0 ? totalUsd / nativeUsdPrice : 0;

    let usdFormatted = quote.usd > 0 ? "0.00" : "N/A";
    if (quote.usd > 0 && totalUsd > 0) {
      if (totalUsd < 0.01) {
        usdFormatted = "< 0.01";
      } else {
        usdFormatted = totalUsd.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    }

    let nativeFormatted = quote.usd > 0 && nativeUsdPrice > 0 ? "0.0000" : "N/A";
    if (quote.usd > 0 && nativeUsdPrice > 0 && totalNative > 0) {
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

    let ethFormatted = ethUsdPrice > 0 ? "0.0000" : "N/A";
    if (ethUsdPrice > 0 && totalEth > 0) {
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
  }, [token.balance, token.amount, token.rawBalance, token.decimals, quote, nativeSymbol, nativeUsdPrice, ethUsdPrice]);
}

/**
 * Reusable visual component to render the USD and Chain-Native (SOL/BNB/ETH/BTC) price tag on any token card.
 */
export function TokenValuationBadge({
  token,
  ethUsdPrice = 0,
  getUsd,
  livePriceEnabled = false,
}: {
  token: {
    symbol: string;
    balance: string;
    chain?: string;
    contractAddress?: string;
    rawBalance?: string;
    decimals?: number | null;
    amount?: number;
  };
  ethUsdPrice?: number;
  getUsd?: (symbol: string) => number;
  livePriceEnabled?: boolean;
}) {
  const { usdFormatted, nativeFormatted, nativeSymbol, totalUsd } = useTokenValuation(token, {
    ethUsdPrice,
    getUsd,
    livePriceEnabled,
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
