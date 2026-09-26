use crate::core::scanner::pricing::{PriceQuote, PriceReport};
use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

struct CachedPriceState {
    report: PriceReport,
    last_fetched: Instant,
}

static PRICE_CACHE: RwLock<Option<CachedPriceState>> = RwLock::new(None);
const CACHE_TTL: Duration = Duration::from_secs(60);

/// Parse raw CoinGecko simple price JSON response
pub fn parse_coingecko_json(json_val: &serde_json::Value) -> HashMap<String, PriceQuote> {
    let mut map = HashMap::new();
    if let Some(obj) = json_val.as_object() {
        for (id, val) in obj {
            let usd = val.get("usd").and_then(|v| v.as_f64());
            let idr = val.get("idr").and_then(|v| v.as_f64());
            let eur = val.get("eur").and_then(|v| v.as_f64());
            let gbp = val.get("gbp").and_then(|v| v.as_f64());
            let jpy = val.get("jpy").and_then(|v| v.as_f64());
            let cny = val.get("cny").and_then(|v| v.as_f64());
            let cad = val.get("cad").and_then(|v| v.as_f64());
            let aud = val.get("aud").and_then(|v| v.as_f64());
            let chf = val.get("chf").and_then(|v| v.as_f64());
            let sgd = val.get("sgd").and_then(|v| v.as_f64());
            let inr = val.get("inr").and_then(|v| v.as_f64());
            let krw = val.get("krw").and_then(|v| v.as_f64());
            let brl = val.get("brl").and_then(|v| v.as_f64());

            let mut extra = HashMap::new();
            if let Some(inner_obj) = val.as_object() {
                for (k, v) in inner_obj {
                    match k.as_str() {
                        "usd" | "idr" | "eur" | "gbp" | "jpy" | "cny" | "cad" | "aud" | "chf"
                        | "sgd" | "inr" | "krw" | "brl" => {}
                        _ => {
                            if let Some(num) = v.as_f64() {
                                extra.insert(k.clone(), num);
                            }
                        }
                    }
                }
            }

            map.insert(
                id.clone(),
                PriceQuote {
                    usd,
                    idr,
                    eur,
                    gbp,
                    jpy,
                    cny,
                    cad,
                    aud,
                    chf,
                    sgd,
                    inr,
                    krw,
                    brl,
                    extra,
                },
            );
        }
    }
    map
}

/// Retrieve prices from memory cache if fresh (<60s), or query CoinGecko API
pub async fn get_cached_or_fetch_prices(
    requested_ids: Option<Vec<String>>,
) -> Result<PriceReport, String> {
    // 1. Check existing in-memory cache
    if let Ok(guard) = PRICE_CACHE.read() {
        if let Some(ref cached) = *guard {
            if cached.last_fetched.elapsed() < CACHE_TTL {
                return Ok(cached.report.clone());
            }
        }
    }

    // 2. Build CoinGecko target IDs
    let default_ids = vec![
        "bitcoin".to_string(),
        "ethereum".to_string(),
        "binancecoin".to_string(),
        "solana".to_string(),
        "arbitrum".to_string(),
        "chainlink".to_string(),
        "uniswap".to_string(),
        "pancakeswap-token".to_string(),
        "aerodrome-finance".to_string(),
        "gmx".to_string(),
    ];

    let ids = match requested_ids {
        Some(list) if !list.is_empty() => list,
        _ => default_ids,
    };

    let ids_param = ids.join(",");
    let url = format!(
        "https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies=usd,idr,eur,gbp,jpy,cny,cad,aud,chf,sgd,inr,krw,brl",
        ids_param
    );

    // 3. Execute HTTP request with short timeout
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Plurivex/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await;

    match resp {
        Ok(res) if res.status().is_success() => {
            if let Ok(json_body) = res.json::<serde_json::Value>().await {
                let parsed_prices = parse_coingecko_json(&json_body);

                let now_unix = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                let report = PriceReport {
                    prices: parsed_prices,
                    fetched_at_unix: now_unix,
                    stale: false,
                };

                // Update cache
                if let Ok(mut write_guard) = PRICE_CACHE.write() {
                    *write_guard = Some(CachedPriceState {
                        report: report.clone(),
                        last_fetched: Instant::now(),
                    });
                }

                Ok(report)
            } else {
                // Fallback to stale cache or baseline
                fallback_stale()
            }
        }
        _ => {
            // Network failed or rate limited: return stale cache or baseline
            fallback_stale()
        }
    }
}

fn fallback_stale() -> Result<PriceReport, String> {
    if let Ok(guard) = PRICE_CACHE.read() {
        if let Some(ref cached) = *guard {
            let mut stale_report = cached.report.clone();
            stale_report.stale = true;
            return Ok(stale_report);
        }
    }
    Ok(PriceReport::baseline_fallback())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_coingecko_json() {
        let sample = serde_json::json!({
            "bitcoin": { "usd": 68420.5, "idr": 1094728000.0, "eur": 62500.0, "gbp": 53600.0 },
            "ethereum": { "usd": 2650.0, "idr": 42400000.0, "jpy": 398000.0 }
        });

        let parsed = parse_coingecko_json(&sample);
        assert_eq!(parsed.len(), 2);
        let btc = parsed.get("bitcoin").unwrap();
        assert_eq!(btc.usd, Some(68420.5));
        assert_eq!(btc.eur, Some(62500.0));
        assert_eq!(btc.gbp, Some(53600.0));
        let eth = parsed.get("ethereum").unwrap();
        assert_eq!(eth.idr, Some(42400000.0));
        assert_eq!(eth.jpy, Some(398000.0));
    }
}
