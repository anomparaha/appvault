import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface PriceQuote {
  usd?: number;
  idr?: number;
  eur?: number;
  gbp?: number;
  jpy?: number;
  cny?: number;
  cad?: number;
  aud?: number;
  chf?: number;
  sgd?: number;
  inr?: number;
  krw?: number;
  brl?: number;
  [key: string]: number | undefined;
}

export interface PriceReport {
  prices: Record<string, PriceQuote>;
  fetched_at_unix: number;
  stale: boolean;
}

export interface CurrencyInfo {
  code: string;
  symbol: string;
  label: string;
  locale: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: "USD", symbol: "$", label: "USD - US Dollar ($)", locale: "en-US", decimals: 2 },
  { code: "EUR", symbol: "€", label: "EUR - Euro (€)", locale: "de-DE", decimals: 2 },
  { code: "GBP", symbol: "£", label: "GBP - British Pound (£)", locale: "en-GB", decimals: 2 },
  { code: "JPY", symbol: "¥", label: "JPY - Japanese Yen (¥)", locale: "ja-JP", decimals: 0 },
  { code: "IDR", symbol: "Rp", label: "IDR - Rupiah (Rp)", locale: "id-ID", decimals: 0 },
  { code: "CAD", symbol: "CA$", label: "CAD - Canadian Dollar ($)", locale: "en-CA", decimals: 2 },
  { code: "AUD", symbol: "AU$", label: "AUD - Australian Dollar ($)", locale: "en-AU", decimals: 2 },
  { code: "CHF", symbol: "CHF", label: "CHF - Swiss Franc (Fr)", locale: "de-CH", decimals: 2 },
  { code: "SGD", symbol: "SG$", label: "SGD - Singapore Dollar ($)", locale: "en-SG", decimals: 2 },
  { code: "CNY", symbol: "¥", label: "CNY - Chinese Yuan (¥)", locale: "zh-CN", decimals: 2 },
  { code: "INR", symbol: "₹", label: "INR - Indian Rupee (₹)", locale: "en-IN", decimals: 2 },
  { code: "KRW", symbol: "₩", label: "KRW - Korean Won (₩)", locale: "ko-KR", decimals: 0 },
  { code: "BRL", symbol: "R$", label: "BRL - Brazilian Real (R$)", locale: "pt-BR", decimals: 2 },
];

const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 150.0,
  IDR: 16150.0,
  CAD: 1.37,
  AUD: 1.51,
  CHF: 0.89,
  SGD: 1.32,
  CNY: 7.23,
  INR: 83.5,
  KRW: 1380.0,
  BRL: 5.45,
};

const STORAGE_KEY = "plurivex_selected_currency";

export function useTokenPrices() {
  const [priceReport, setPriceReport] = useState<PriceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrencyState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_CURRENCIES.some((c) => c.code === saved.toUpperCase())) {
        return saved.toUpperCase();
      }
    } catch {
      // ignore
    }
    return "USD";
  });

  const refreshPrices = useCallback(async () => {
    try {
      setLoading(true);
      const report = await invoke<PriceReport>("get_token_prices", {});
      setPriceReport(report);
    } catch (err) {
      console.warn("Failed to fetch token prices:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPrices();
    const interval = setInterval(refreshPrices, 60000);
    return () => clearInterval(interval);
  }, [refreshPrices]);

  const setCurrency = useCallback((newCurr: string) => {
    const code = newCurr.toUpperCase();
    setCurrencyState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore
    }
  }, []);

  const toggleCurrency = useCallback(() => {
    setCurrencyState((prev) => {
      const idx = SUPPORTED_CURRENCIES.findIndex((c) => c.code === prev);
      const nextIdx = (idx + 1) % SUPPORTED_CURRENCIES.length;
      const nextCurr = SUPPORTED_CURRENCIES[nextIdx].code;
      try {
        localStorage.setItem(STORAGE_KEY, nextCurr);
      } catch {
        // ignore
      }
      return nextCurr;
    });
  }, []);

  const normalizeKey = (key: string): string => {
    const lower = key.toLowerCase();
    switch (lower) {
      case "btc":
      case "bitcoin":
      case "wbtc":
        return "bitcoin";
      case "eth":
      case "ethereum":
      case "weth":
        return "ethereum";
      case "bnb":
      case "bsc":
      case "binancecoin":
        return "binancecoin";
      case "sol":
      case "solana":
        return "solana";
      case "arb":
      case "arbitrum":
        return "arbitrum";
      case "robinhood":
      case "rh":
        return "ethereum";
      case "link":
      case "chainlink":
        return "chainlink";
      case "uni":
      case "uniswap":
        return "uniswap";
      case "cake":
      case "pancakeswap-token":
        return "pancakeswap-token";
      case "aero":
      case "aerodrome-finance":
        return "aerodrome-finance";
      case "gmx":
        return "gmx";
      case "shib":
      case "shiba-inu":
        return "shiba-inu";
      case "pepe":
        return "pepe";
      default:
        return lower;
    }
  };

  const getUsd = useCallback(
    (key: string): number => {
      const k = key.toLowerCase();
      // Stablecoins pinned to ~1.00 USD
      if (
        k === "usdt" ||
        k === "usdc" ||
        k === "usdbc" ||
        k === "dai" ||
        k === "busd" ||
        k === "fdusd" ||
        k === "pyusd"
      ) {
        return 1.0;
      }

      const id = normalizeKey(key);
      const quoteUsd = priceReport?.prices?.[id]?.usd;
      if (typeof quoteUsd === "number" && quoteUsd > 0) {
        return quoteUsd;
      }

      // Safe baseline fallbacks if offline or initial load
      switch (id) {
        case "bitcoin":
          return 65000;
        case "ethereum":
          return 2600;
        case "binancecoin":
          return 580;
        case "solana":
          return 140;
        case "arbitrum":
          return 0.50;
        case "chainlink":
          return 12.0;
        case "uniswap":
          return 6.0;
        case "pancakeswap-token":
          return 1.80;
        case "aerodrome-finance":
          return 0.60;
        case "gmx":
          return 25.0;
        case "shiba-inu":
          return 0.000015;
        case "pepe":
          return 0.00001;
        default:
          if (k === "base") return priceReport?.prices?.["ethereum"]?.usd ?? 2600;
          return 0;
      }
    },
    [priceReport]
  );

  const getTokenUsd = useCallback(
    (symbol: string, chain?: string, contractAddress?: string): number => {
      const sym = symbol.toUpperCase();
      const ch = (chain || "").toLowerCase();
      const addr = (contractAddress || "").toLowerCase();

      // Stablecoins pinned to ~1.00 USD
      if (
        sym === "USDT" ||
        sym === "USDC" ||
        sym === "USDBC" ||
        sym === "DAI" ||
        sym === "BUSD" ||
        sym === "FDUSD" ||
        sym === "PYUSD"
      ) {
        return 1.0;
      }

      // Solana SPL / Token-2022 tokens:
      // Never treat a Solana token named "BTc" as Bitcoin ($84,000)!
      if (ch === "sol" || ch === "solana") {
        if (
          addr === "bobbytpe2kpajwh5tppky72knd2cwmtdya63bqo2yiks" ||
          sym === "BTC" ||
          sym === "BOBBY"
        ) {
          // Bobby The Cat (BTc) meme coin live market price (~$0.00000069 USD)
          return 0.00000069;
        }
        if (sym === "BONK") return 0.000018;
        if (sym === "JUP") return 0.85;
        if (sym === "RAY") return 1.80;
        if (sym === "WIF") return 1.50;
        if (sym === "MSOL" || sym === "BSOL" || sym === "JITOSOL") {
          return priceReport?.prices?.["solana"]?.usd ? priceReport.prices["solana"].usd * 1.15 : 160;
        }
        // Unknown Solana token/meme coin: return 0, NEVER assume it's Bitcoin!
        return 0;
      }

      // For EVM tokens with symbol BTC:
      // Only treat as Bitcoin if it's explicitly WBTC or BTCB
      if (sym === "BTC") {
        if (ch === "btc" || ch === "bitcoin") {
          return priceReport?.prices?.["bitcoin"]?.usd ?? 65000;
        }
        if (ch === "eth" || ch === "arbitrum" || ch === "optimism" || ch === "polygon" || ch === "base") {
          return priceReport?.prices?.["bitcoin"]?.usd ?? 65000;
        }
        if (ch === "bsc") {
          return priceReport?.prices?.["bitcoin"]?.usd ?? 65000;
        }
        return 0;
      }

      // Plurivex Ecosystem Token
      if (sym === "$PLUR" || sym === "PLUR" || sym === "PLX" || addr === "0xf890d3fe2be22c6259bbe9f607692c7168556c93") {
        return 0.10;
      }

      // Robinhood Chain Tokens
      if (sym === "JEV" || addr === "0x4d066ab4d924b7b3d01c6ecbfc142efe33aeb7fa") {
        return 0.0003003;
      }
      if (sym === "SMA" || addr === "0x3bd9136d51af679bd1b11d06b951155543c5449f") {
        return 0.00000456;
      }
      if (sym === "ASTEROID" || sym === "IB-ASTEROID" || addr === "0x38aaf33082b20aff2e33433138de920f131b7777" || addr === "0x6e96e5d84513996ef7df308af345f9283c4da284") {
        return 0.00001918;
      }
      if (sym === "USDG" || addr === "0x5fc5360d0400a0fd4f2af552add042d716f1d168") {
        return 0.2641;
      }
      if (sym === "WETH" && (ch === "robinhood" || ch === "base" || ch === "arbitrum" || ch === "eth")) {
        return priceReport?.prices?.["ethereum"]?.usd ?? 2680;
      }

      return getUsd(symbol);
    },
    [getUsd, priceReport]
  );

  const getRate = useCallback(
    (targetCurrency: string): number => {
      const curr = targetCurrency.toUpperCase();
      if (curr === "USD") return 1.0;

      // Try dynamically computing exchange rate from CoinGecko BTC quote
      const btcQuote = priceReport?.prices?.["bitcoin"];
      if (btcQuote && btcQuote.usd && btcQuote.usd > 0) {
        const targetVal = btcQuote[curr.toLowerCase()];
        if (typeof targetVal === "number" && targetVal > 0) {
          return targetVal / btcQuote.usd;
        }
      }

      // Try ETH quote
      const ethQuote = priceReport?.prices?.["ethereum"];
      if (ethQuote && ethQuote.usd && ethQuote.usd > 0) {
        const targetVal = ethQuote[curr.toLowerCase()];
        if (typeof targetVal === "number" && targetVal > 0) {
          return targetVal / ethQuote.usd;
        }
      }

      // Safe static fallbacks
      return FALLBACK_RATES[curr] || 1.0;
    },
    [priceReport]
  );

  const getIdr = useCallback(
    (key: string): number => {
      return getUsd(key) * getRate("IDR");
    },
    [getUsd, getRate]
  );

  const formatValuation = useCallback(
    (usdAmount: number, targetCurr?: string): { primary: string; secondary: string } => {
      const activeCode = (targetCurr || currency).toUpperCase();
      const activeInfo = SUPPORTED_CURRENCIES.find((c) => c.code === activeCode) || SUPPORTED_CURRENCIES[0];

      const usdFormatted =
        usdAmount <= 0
          ? "$0.00 USD"
          : usdAmount < 0.01
          ? "< $0.01 USD"
          : `$${usdAmount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} USD`;

      if (activeCode === "USD") {
        return {
          primary: usdFormatted,
          secondary: "",
        };
      }

      const rate = getRate(activeCode);
      const convertedAmount = usdAmount * rate;

      let convertedFormatted = "";
      if (convertedAmount <= 0) {
        convertedFormatted = `${activeInfo.symbol} 0`;
      } else if (activeInfo.decimals === 0) {
        if (convertedAmount < 1) {
          convertedFormatted = `< ${activeInfo.symbol} 1`;
        } else {
          // Standard comma ',' for thousands separator, avoiding confusing dots
          convertedFormatted = `${activeInfo.symbol} ${Math.round(convertedAmount).toLocaleString("en-US")}`;
        }
      } else {
        if (convertedAmount < 0.01) {
          convertedFormatted = `< ${activeInfo.symbol}0.01`;
        } else {
          // Comma ',' for thousands, dot '.' for decimal fractions
          convertedFormatted = `${activeInfo.symbol}${convertedAmount.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
        }
      }

      // Avoid redundant text like "Rp 16,150,000 IDR"
      const primary =
        activeCode === "IDR"
          ? convertedFormatted
          : `${convertedFormatted} ${activeCode}`;

      return {
        primary,
        secondary: usdFormatted,
      };
    },
    [currency, getRate]
  );

  return {
    priceReport,
    loading,
    refreshPrices,
    currency,
    setCurrency,
    toggleCurrency,
    supportedCurrencies: SUPPORTED_CURRENCIES,
    getRate,
    getUsd,
    getTokenUsd,
    getIdr,
    formatValuation,
  };
}
