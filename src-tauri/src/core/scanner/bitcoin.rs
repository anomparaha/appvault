use crate::core::scanner::WalletChainResult;

pub fn format_btc_display(satoshis: u64) -> (f64, String) {
    let btc = (satoshis as f64) / 100_000_000.0;
    if satoshis == 0 {
        (0.0, "0 BTC".to_string())
    } else if btc < 0.000001 {
        let s = format!("{:.8}", btc);
        let trimmed = s.trim_end_matches('0').trim_end_matches('.');
        (btc, format!("< 0.000001 BTC ({})", trimmed))
    } else {
        let s = format!("{:.8}", btc);
        let trimmed = s.trim_end_matches('0').trim_end_matches('.');
        (btc, format!("{} BTC", trimmed))
    }
}

pub async fn scan_bitcoin_for_wallet(
    client: &reqwest::Client,
    address: &str,
    rpcs: &[&str],
    wallet_id: i64,
) -> Result<WalletChainResult, String> {
    let mut last_err = "All Bitcoin endpoints failed".to_string();

    for rpc in rpcs {
        let url = format!("{}/address/{}", rpc.trim_end_matches('/'), address);
        let req = client
            .get(&url)
            .header("User-Agent", "Plurivex/1.0")
            .timeout(std::time::Duration::from_secs(12))
            .send()
            .await;

        match req {
            Ok(res) => {
                if res.status().is_success() {
                    if let Ok(data) = res.json::<serde_json::Value>().await {
                        let funded = data
                            .pointer("/chain_stats/funded_txo_sum")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0)
                            + data
                                .pointer("/mempool_stats/funded_txo_sum")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0);

                        let spent = data
                            .pointer("/chain_stats/spent_txo_sum")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0)
                            + data
                                .pointer("/mempool_stats/spent_txo_sum")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0);

                        let satoshis = funded.saturating_sub(spent);
                        let (btc_amt, display_str) = format_btc_display(satoshis);
                        let has_funds = btc_amt > 0.0;

                        return Ok(WalletChainResult {
                            wallet_id,
                            chain_key: "btc".to_string(),
                            native_balance: display_str,
                            has_funds,
                            tokens: Vec::new(),
                        });
                    }
                } else {
                    last_err = format!("HTTP error {} from {}", res.status(), rpc);
                }
            }
            Err(e) => {
                last_err = format!("Connection error to {}: {}", rpc, e);
            }
        }
    }

    Err(last_err)
}

/// Parses back the BTC amount from the `format_btc_display` string
/// ("0 BTC" | "0.0045 BTC" | "< 0.000001 BTC (0.00000012)").
/// Returns 0.0 if the format is unrecognized (never guesses).
pub fn parse_btc_display_amount(display: &str) -> f64 {
    let trimmed = display.trim();
    if let Some(rest) = trimmed.strip_prefix('<') {
        // Case "< 0.000001 BTC (x)": extract number within parentheses.
        return rest
            .split('(')
            .nth(1)
            .and_then(|s| s.split(')').next())
            .and_then(|s| s.trim().parse::<f64>().ok())
            .unwrap_or(0.0);
    }
    trimmed
        .split_whitespace()
        .next()
        .and_then(|tok| tok.parse::<f64>().ok())
        .unwrap_or(0.0)
}

#[cfg(test)]
mod parse_tests {
    use super::*;

    #[test]
    fn parses_plain_amount() {
        assert_eq!(parse_btc_display_amount("0.0045 BTC"), 0.0045);
        assert_eq!(parse_btc_display_amount("1.25 BTC"), 1.25);
    }

    #[test]
    fn parses_zero() {
        assert_eq!(parse_btc_display_amount("0 BTC"), 0.0);
    }

    #[test]
    fn parses_dust_with_parenthesized_amount() {
        let (amt, display) = format_btc_display(12); // 12 satoshi
        assert!(display.starts_with('<'));
        assert_eq!(parse_btc_display_amount(&display), amt);
        assert_eq!(parse_btc_display_amount("< 0.000001 BTC (0.00000012)"), 0.00000012);
    }

    #[test]
    fn unknown_format_returns_zero() {
        assert_eq!(parse_btc_display_amount("RPC error"), 0.0);
        assert_eq!(parse_btc_display_amount(""), 0.0);
    }
}

