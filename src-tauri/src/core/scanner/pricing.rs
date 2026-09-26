use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// PriceQuote holds valuation in major international fiat/stable currencies
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct PriceQuote {
    pub usd: Option<f64>,
    pub idr: Option<f64>,
    pub eur: Option<f64>,
    pub gbp: Option<f64>,
    pub jpy: Option<f64>,
    pub cny: Option<f64>,
    pub cad: Option<f64>,
    pub aud: Option<f64>,
    pub chf: Option<f64>,
    pub sgd: Option<f64>,
    pub inr: Option<f64>,
    pub krw: Option<f64>,
    pub brl: Option<f64>,
    #[serde(flatten)]
    pub extra: HashMap<String, f64>,
}

/// PriceReport holds the aggregated price snapshot and cache freshness metadata
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PriceReport {
    pub prices: HashMap<String, PriceQuote>,
    pub fetched_at_unix: u64,
    pub stale: bool,
}

impl PriceReport {
    /// Return the price for a standard symbol or CoinGecko ID in any requested currency
    pub fn get_price(&self, asset_key: &str, currency: &str) -> Option<f64> {
        let lookup_key = Self::normalize_asset_id(asset_key);
        let quote = self.prices.get(&lookup_key)?;
        match currency.to_lowercase().as_str() {
            "usd" => quote.usd,
            "idr" => quote.idr,
            "eur" => quote.eur,
            "gbp" => quote.gbp,
            "jpy" => quote.jpy,
            "cny" => quote.cny,
            "cad" => quote.cad,
            "aud" => quote.aud,
            "chf" => quote.chf,
            "sgd" => quote.sgd,
            "inr" => quote.inr,
            "krw" => quote.krw,
            "brl" => quote.brl,
            other => quote.extra.get(other).copied(),
        }
    }

    /// Return the USD price for a standard symbol or CoinGecko ID (default base)
    pub fn get_usd_price(&self, key: &str) -> Option<f64> {
        self.get_price(key, "usd")
    }

    /// Return the USD price or fallback to baseline fallback quote
    pub fn get_usd_price_or_baseline(&self, key: &str) -> f64 {
        if let Some(price) = self.get_usd_price(key) {
            price
        } else {
            Self::baseline_fallback()
                .get_usd_price(key)
                .unwrap_or(0.0)
        }
    }

    /// Return the IDR price for a standard symbol or CoinGecko ID
    pub fn get_idr_price(&self, key: &str) -> Option<f64> {
        self.get_price(key, "idr")
    }

    /// Normalizes common symbols to standard CoinGecko IDs
    pub fn normalize_asset_id(key: &str) -> String {
        let lower = key.to_lowercase();
        match lower.as_str() {
            "btc" | "bitcoin" | "wbtc" => "bitcoin".to_string(),
            "eth" | "ethereum" | "weth" => "ethereum".to_string(),
            "bnb" | "binancecoin" | "bsc" => "binancecoin".to_string(),
            "sol" | "solana" => "solana".to_string(),
            "arb" | "arbitrum" => "arbitrum".to_string(),
            "link" | "chainlink" => "chainlink".to_string(),
            "uni" | "uniswap" => "uniswap".to_string(),
            "cake" => "pancakeswap-token".to_string(),
            "aero" => "aerodrome-finance".to_string(),
            _ => lower,
        }
    }

    /// Generates baseline fallback prices if network is unreachable
    pub fn baseline_fallback() -> Self {
        let mut prices = HashMap::new();
        prices.insert(
            "bitcoin".to_string(),
            PriceQuote {
                usd: Some(65000.0),
                idr: Some(1_050_000_000.0),
                eur: Some(59800.0),
                gbp: Some(51200.0),
                jpy: Some(9_750_000.0),
                cad: Some(89000.0),
                aud: Some(98000.0),
                sgd: Some(86000.0),
                ..Default::default()
            },
        );
        prices.insert(
            "ethereum".to_string(),
            PriceQuote {
                usd: Some(2600.0),
                idr: Some(42_000_000.0),
                eur: Some(2390.0),
                gbp: Some(2050.0),
                jpy: Some(390_000.0),
                cad: Some(3560.0),
                aud: Some(3920.0),
                sgd: Some(3440.0),
                ..Default::default()
            },
        );
        prices.insert(
            "binancecoin".to_string(),
            PriceQuote {
                usd: Some(580.0),
                idr: Some(9_300_000.0),
                eur: Some(533.0),
                gbp: Some(457.0),
                jpy: Some(87_000.0),
                cad: Some(794.0),
                aud: Some(875.0),
                sgd: Some(768.0),
                ..Default::default()
            },
        );
        prices.insert(
            "solana".to_string(),
            PriceQuote {
                usd: Some(140.0),
                idr: Some(2_250_000.0),
                eur: Some(128.0),
                gbp: Some(110.0),
                jpy: Some(21_000.0),
                cad: Some(191.0),
                aud: Some(211.0),
                sgd: Some(185.0),
                ..Default::default()
            },
        );
        prices.insert(
            "arbitrum".to_string(),
            PriceQuote {
                usd: Some(0.50),
                idr: Some(8_000.0),
                eur: Some(0.46),
                gbp: Some(0.39),
                jpy: Some(75.0),
                cad: Some(0.68),
                aud: Some(0.75),
                sgd: Some(0.66),
                ..Default::default()
            },
        );

        let now_unix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        Self {
            prices,
            fetched_at_unix: now_unix,
            stale: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_price_report_lookup() {
        let report = PriceReport::baseline_fallback();
        assert!(report.stale);
        assert_eq!(report.get_usd_price("btc"), Some(65000.0));
        assert_eq!(report.get_price("btc", "eur"), Some(59800.0));
        assert_eq!(report.get_price("eth", "gbp"), Some(2050.0));
        assert_eq!(report.get_price("sol", "jpy"), Some(21_000.0));
        assert_eq!(report.get_usd_price("ETH"), Some(2600.0));
        assert_eq!(report.get_usd_price("BNB"), Some(580.0));
        assert_eq!(report.get_usd_price("SOL"), Some(140.0));
        assert_eq!(report.get_usd_price_or_baseline("btc"), 65000.0);
        assert_eq!(report.get_usd_price_or_baseline("unknown_coin"), 0.0);
        assert!(report.get_idr_price("BTC").unwrap() > 1_000_000_000.0);
    }
}
