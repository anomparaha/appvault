use serde::Serialize;
use std::time::Duration;

#[derive(Serialize)]
pub struct ChainFeeResponse {
    pub gas_price_gwei: f64,
    pub priority_fee_gwei: f64,
    pub estimated_fee_eth: String,
    pub chain_id: u64,
    pub symbol: String,
}

#[derive(Serialize)]
pub struct AccountInfoResponse {
    pub balance_hex: String,
    pub balance_eth: f64,
    pub balance_formatted: String,
    pub nonce: u64,
}

pub fn shared_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(9))
        .pool_max_idle_per_host(10)
        .build()
        .unwrap_or_default()
}

pub fn format_balance_display(wei_hex: &str, symbol: &str) -> (f64, String) {
    let clean = wei_hex.trim_start_matches("0x");
    let wei = u128::from_str_radix(clean, 16).unwrap_or(0);
    let amount = wei as f64 / 1e18;
    if amount == 0.0 {
        return (0.0, format!("0 {}", symbol));
    }
    let s: String = if amount < 0.00001 {
        format!("{:.18} {}", amount, symbol)
    } else if amount < 1.0 {
        format!("{:.6} {}", amount, symbol)
    } else {
        format!("{:.5} {}", amount, symbol)
    };
    (amount, s)
}

pub fn format_token_amount(hex_val: &str, decimals: u8, symbol: &str) -> Option<(f64, String)> {
    let clean = hex_val.trim_start_matches("0x").trim();
    if clean.is_empty() || clean.chars().all(|c| c == '0') {
        return None;
    }
    let val = u128::from_str_radix(clean, 16).unwrap_or(0);
    if val == 0 {
        return None;
    }
    let divisor = 10_f64.powi(decimals as i32);
    let amount = (val as f64) / divisor;
    if amount <= 0.0 {
        return None;
    }
    let formatted: String = if amount < 0.0001 {
        format!("{:.8} {}", amount, symbol)
    } else if amount < 1.0 {
        format!("{:.6} {}", amount, symbol)
    } else if amount < 1000.0 {
        format!("{:.4} {}", amount, symbol)
    } else {
        format!("{:.2} {}", amount, symbol)
    };
    Some((amount, formatted))
}

pub async fn rpc_get_balance(address: &str, rpc: &str) -> Result<String, String> {
    let client = shared_client();
    let resp = client
        .post(rpc)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getBalance",
            "params": [address, "latest"]
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    data.get("result")
        .and_then(|r| r.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "empty RPC result".to_string())
}

pub async fn get_chain_fee_data(
    chain_key: &str,
    rpcs: &[&str],
    symbol: &str,
) -> Result<ChainFeeResponse, String> {
    let client = shared_client();
    let chain_id = match chain_key {
        "eth" => 1,
        "bsc" => 56,
        "base" => 8453,
        "arb" => 42161,
        "robinhood" => 4663,
        _ => 1,
    };

    let priority_fee_gwei = match chain_key {
        "eth" => 0.05,
        "bsc" => 1.0,
        "base" => 0.005,
        "arb" => 0.01,
        "robinhood" => 0.01,
        _ => 0.05,
    };

    for rpc in rpcs {
        let resp = client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "eth_gasPrice",
                "params": []
            }))
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(data) = res.json::<serde_json::Value>().await {
                    if let Some(hex_price) = data.get("result").and_then(|r| r.as_str()) {
                        let clean = hex_price.trim_start_matches("0x");
                        let wei = u128::from_str_radix(clean, 16).unwrap_or(1_500_000_000);
                        let gwei = (wei as f64) / 1_000_000_000.0;
                        let fee_wei = (wei as f64) * 21000.0;
                        let fee_eth = fee_wei / 1e18;
                        let estimated_fee_eth = format!("{:.8} {}", fee_eth, symbol);

                        return Ok(ChainFeeResponse {
                            gas_price_gwei: (gwei * 100.0).round() / 100.0,
                            priority_fee_gwei,
                            estimated_fee_eth,
                            chain_id,
                            symbol: symbol.to_string(),
                        });
                    }
                }
            }
        }
    }

    Ok(ChainFeeResponse {
        gas_price_gwei: 1.5,
        priority_fee_gwei,
        estimated_fee_eth: format!("0.00003150 {}", symbol),
        chain_id,
        symbol: symbol.to_string(),
    })
}

pub async fn get_account_nonce_and_balance(
    chain_key: &str,
    rpcs: &[&str],
    symbol: &str,
    address: &str,
) -> Result<AccountInfoResponse, String> {
    let client = shared_client();
    let batch = serde_json::json!([
        {
            "jsonrpc": "2.0",
            "id": 0,
            "method": "eth_getBalance",
            "params": [address, "latest"]
        },
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getTransactionCount",
            "params": [address, "latest"]
        }
    ]);

    for rpc in rpcs {
        let resp = client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&batch)
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(data) = res.json::<serde_json::Value>().await {
                    if let Some(arr) = data.as_array() {
                        let mut balance_hex = "0x0".to_string();
                        let mut nonce = 0u64;

                        for item in arr {
                            let id = item.get("id").and_then(|i| i.as_u64()).unwrap_or(99);
                            let res_str =
                                item.get("result").and_then(|r| r.as_str()).unwrap_or("0x0");
                            if id == 0 {
                                balance_hex = res_str.to_string();
                            } else if id == 1 {
                                let clean_nonce = res_str.trim_start_matches("0x");
                                nonce = u64::from_str_radix(clean_nonce, 16).unwrap_or(0);
                            }
                        }

                        let (bal_eth, formatted) = format_balance_display(&balance_hex, symbol);

                        return Ok(AccountInfoResponse {
                            balance_hex,
                            balance_eth: bal_eth,
                            balance_formatted: formatted,
                            nonce,
                        });
                    }
                }
            }
        }
    }

    Err(format!(
        "Failed to query wallet data from all RPC nodes for chain {chain_key}"
    ))
}

pub async fn broadcast_raw_tx(
    chain_key: &str,
    rpcs: &[&str],
    raw_tx: &str,
) -> Result<String, String> {
    let client = shared_client();

    for rpc in rpcs {
        let resp = client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "eth_sendRawTransaction",
                "params": [raw_tx]
            }))
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(data) = res.json::<serde_json::Value>().await {
                    if let Some(hash) = data.get("result").and_then(|h| h.as_str()) {
                        return Ok(hash.to_string());
                    }
                    if let Some(err) = data.get("error") {
                        let msg = err
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("RPC Error");
                        return Err(msg.to_string());
                    }
                }
            }
        }
    }

    Err(format!(
        "All RPC nodes failed to broadcast transaction for chain {chain_key}"
    ))
}
