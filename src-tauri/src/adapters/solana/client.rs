use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
pub struct SolanaAccountDetails {
    pub exists: bool,
    pub owner: String,
    pub owner_label: String,
    pub is_system_program: bool,
    pub account_type: String,
    pub authority: Option<String>,
    pub token_mint: Option<String>,
    pub lamports: u64,
    pub sol_balance: f64,
    pub executable: bool,
    pub space: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaTransactionSignature {
    pub signature: String,
    pub slot: u64,
    pub block_time: Option<i64>,
    pub confirmation_status: Option<String>,
    pub failed: bool,
}

fn parse_solana_signature_entries(
    entries: &serde_json::Value,
) -> Result<Vec<SolanaTransactionSignature>, String> {
    let entries = entries
        .as_array()
        .ok_or_else(|| "Invalid getSignaturesForAddress result".to_string())?;
    Ok(entries
        .iter()
        .filter_map(|entry| {
            let signature = entry.get("signature")?.as_str()?.trim();
            if signature.is_empty()
                || signature.len() > 100
                || bs58::decode(signature).into_vec().ok()?.len() != 64
            {
                return None;
            }
            Some(SolanaTransactionSignature {
                signature: signature.to_string(),
                slot: entry.get("slot").and_then(|slot| slot.as_u64()).unwrap_or_default(),
                block_time: entry.get("blockTime").and_then(|time| time.as_i64()),
                confirmation_status: entry
                    .get("confirmationStatus")
                    .and_then(|status| status.as_str())
                    .map(str::to_string),
                failed: entry.get("err").map(|error| !error.is_null()).unwrap_or(false),
            })
        })
        .collect())
}

fn shared_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(9))
        .pool_max_idle_per_host(10)
        .build()
        .unwrap_or_default()
}

pub fn format_sol_display(lamports: u64) -> (f64, String) {
    let amount = lamports as f64 / 1e9;
    if amount == 0.0 {
        return (0.0, "0 SOL".to_string());
    }
    let s: String = if amount < 0.00001 {
        format!("{:.9} SOL", amount)
    } else if amount < 1.0 {
        format!("{:.6} SOL", amount)
    } else {
        format!("{:.5} SOL", amount)
    };
    (amount, s)
}

pub async fn rpc_get_sol_balance(address: &str, rpc: &str) -> Result<String, String> {
    let client = shared_client();
    let resp = client
        .post(rpc)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": [address, {"commitment": "confirmed"}]
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let lamports = data
        .get("result")
        .and_then(|r| r.get("value"))
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "empty RPC result".to_string())?;
    Ok(lamports.to_string())
}

pub async fn get_solana_recent_blockhash(rpcs: &[&str]) -> Result<String, String> {
    let client = shared_client();

    for rpc in rpcs {
        let resp = client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getLatestBlockhash",
                "params": [{"commitment": "confirmed"}]
            }))
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(data) = res.json::<serde_json::Value>().await {
                    if let Some(bh) = data
                        .pointer("/result/value/blockhash")
                        .and_then(|b| b.as_str())
                    {
                        return Ok(bh.to_string());
                    }
                }
            }
        }
    }

    Err("Failed to fetch Solana recent blockhash from RPC nodes".to_string())
}

pub async fn broadcast_solana_tx(rpcs: &[&str], raw_tx_base64: &str) -> Result<String, String> {
    let client = shared_client();
    let mut last_err = "All Solana RPC nodes failed to broadcast transaction".to_string();

    for rpc in rpcs {
        let resp = client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "sendTransaction",
                "params": [
                    raw_tx_base64,
                    {
                        "encoding": "base64",
                        "skipPreflight": true,
                        "preflightCommitment": "confirmed",
                        "maxRetries": 3
                    }
                ]
            }))
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(data) = res.json::<serde_json::Value>().await {
                    if let Some(sig) = data.get("result").and_then(|r| r.as_str()) {
                        return Ok(sig.to_string());
                    }
                    if let Some(err) = data.get("error") {
                        let msg = err
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("Solana RPC Error");
                        let details = err.get("data").map(|d| d.to_string()).unwrap_or_default();
                        last_err = if details.is_empty() {
                            msg.to_string()
                        } else {
                            format!("{}: {}", msg, details)
                        };
                        continue;
                    }
                }
            }
        }
    }

    Err(last_err)
}

pub async fn get_solana_account_details(
    rpcs: &[&str],
    address: &str,
) -> Result<SolanaAccountDetails, String> {
    let client = shared_client();
    let mut last_err = "Failed to query Solana account details from RPC nodes".to_string();

    for rpc in rpcs {
        let resp = client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Mozilla/5.0")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAccountInfo",
                "params": [
                    address,
                    {"encoding": "jsonParsed", "commitment": "confirmed"}
                ]
            }))
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(data) = res.json::<serde_json::Value>().await {
                    if let Some(err) = data.get("error") {
                        let msg = err
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("Solana RPC Error");
                        last_err = msg.to_string();
                        continue;
                    }

                    if let Some(result_obj) = data.get("result") {
                        let val = result_obj.get("value");
                        if val.is_none() || val == Some(&serde_json::Value::Null) {
                            return Ok(SolanaAccountDetails {
                                exists: false,
                                owner: "11111111111111111111111111111111".to_string(),
                                owner_label: "System Program (New / Unallocated)".to_string(),
                                is_system_program: true,
                                account_type: "unallocated".to_string(),
                                authority: None,
                                token_mint: None,
                                lamports: 0,
                                sol_balance: 0.0,
                                executable: false,
                                space: 0,
                            });
                        }

                        if let Some(val_obj) = val {
                            let owner = val_obj
                                .get("owner")
                                .and_then(|o| o.as_str())
                                .unwrap_or("11111111111111111111111111111111")
                                .to_string();
                            let lamports = val_obj
                                .get("lamports")
                                .and_then(|l| l.as_u64())
                                .unwrap_or(0);
                            let executable = val_obj
                                .get("executable")
                                .and_then(|e| e.as_bool())
                                .unwrap_or(false);
                            let space = val_obj.get("space").and_then(|s| s.as_u64()).unwrap_or(0);

                            let parsed_data = val_obj.pointer("/data/parsed");
                            let program_name = val_obj
                                .pointer("/data/program")
                                .and_then(|p| p.as_str())
                                .unwrap_or("");

                            let account_type;
                            let mut authority = None;
                            let mut token_mint = None;
                            let owner_label;

                            if owner == "11111111111111111111111111111111" {
                                if program_name == "nonce"
                                    || (parsed_data.is_some_and(|p| {
                                        p.get("type").and_then(|t| t.as_str())
                                            == Some("initialized")
                                    }) && space == 80)
                                {
                                    account_type = "nonce_account".to_string();
                                    authority = parsed_data
                                        .and_then(|p| p.pointer("/info/authority"))
                                        .and_then(|a| a.as_str())
                                        .map(|s| s.to_string());
                                    owner_label =
                                        "System Program (Durable Nonce Account)".to_string();
                                } else {
                                    account_type = "standard_eoa".to_string();
                                    owner_label =
                                        "System Program (Standard EOA Wallet)".to_string();
                                }
                            } else if owner == "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                                || owner == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
                            {
                                account_type = "token_account".to_string();
                                authority = parsed_data
                                    .and_then(|p| p.pointer("/info/owner"))
                                    .and_then(|o| o.as_str())
                                    .map(|s| s.to_string());
                                token_mint = parsed_data
                                    .and_then(|p| p.pointer("/info/mint"))
                                    .and_then(|m| m.as_str())
                                    .map(|s| s.to_string());
                                let is_2022 =
                                    owner == "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
                                owner_label = if is_2022 {
                                    "Token-2022 Program (Token Account ATA)".to_string()
                                } else {
                                    "SPL Token Program (Token Account ATA)".to_string()
                                };
                            } else if owner == "Stake11111111111111111111111111111111111111" {
                                account_type = "stake_account".to_string();
                                owner_label = "Stake Program (Staking Account)".to_string();
                            } else {
                                account_type = "custom_program".to_string();
                                owner_label = format!(
                                    "Custom Program ({})",
                                    if owner.len() > 8 {
                                        format!("{}…{}", &owner[..4], &owner[owner.len() - 4..])
                                    } else {
                                        owner.clone()
                                    }
                                );
                            }

                            let is_sys =
                                account_type == "standard_eoa" || account_type == "unallocated";

                            return Ok(SolanaAccountDetails {
                                exists: true,
                                owner,
                                owner_label,
                                is_system_program: is_sys,
                                account_type,
                                authority,
                                token_mint,
                                lamports,
                                sol_balance: (lamports as f64) / 1e9,
                                executable,
                                space,
                            });
                        }
                    }
                }
            }
        }
    }

    Err(last_err)
}

/// Returns the newest confirmed transaction signatures for an address, optionally continuing
/// before a previously returned signature. The caller enforces vault-session and Safe Mode gates.
pub async fn get_solana_transaction_history(
    rpcs: &[&str],
    address: &str,
    before: Option<&str>,
    limit: usize,
) -> Result<Vec<SolanaTransactionSignature>, String> {
    let client = shared_client();
    let limit = limit.clamp(1, 100);
    let mut last_err = "Failed to fetch Solana transaction history from RPC nodes".to_string();

    for rpc in rpcs {
        let mut config = serde_json::json!({
            "commitment": "confirmed",
            "limit": limit
        });
        if let Some(before) = before {
            config["before"] = serde_json::Value::String(before.to_string());
        }
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getSignaturesForAddress",
            "params": [address, config]
        });

        let response = match client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&payload)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_err = format!("RPC {rpc} failed: {error}");
                continue;
            }
        };
        if !response.status().is_success() {
            last_err = format!("RPC {rpc} returned HTTP {}", response.status());
            continue;
        }
        let data = match response.json::<serde_json::Value>().await {
            Ok(data) => data,
            Err(error) => {
                last_err = format!("RPC {rpc} returned invalid JSON: {error}");
                continue;
            }
        };
        if let Some(error) = data.get("error") {
            last_err = error
                .get("message")
                .and_then(|message| message.as_str())
                .unwrap_or("Solana RPC rejected the history request")
                .to_string();
            continue;
        }
        let Some(entries) = data.get("result") else {
            last_err = format!("RPC {rpc} returned an invalid getSignaturesForAddress response");
            continue;
        };
        match parse_solana_signature_entries(entries) {
            Ok(transactions) => return Ok(transactions),
            Err(error) => last_err = format!("RPC {rpc}: {error}"),
        }
    }

    Err(last_err)
}

#[cfg(test)]
mod history_tests {
    use super::*;

    #[test]
    fn parses_signature_history_and_error_status() {
        let response = serde_json::json!([
            {
                "signature": "5h6xBEauJ3PK6SWCZ1PGjBvj8vDdWG3KpwATGy1ARAXFSDwt8GFXM7W5Ncn16wmqokgpiKRLuS83KUxyZyv2sUYv",
                "slot": 114,
                "err": null,
                "blockTime": 1_700_000_000,
                "confirmationStatus": "finalized"
            },
            {
                "signature": "5h6xBEauJ3PK6SWCZ1PGjBvj8vDdWG3KpwATGy1ARAXFSDwt8GFXM7W5Ncn16wmqokgpiKRLuS83KUxyZyv2sUYv",
                "slot": 113,
                "err": { "InstructionError": [0, "Custom"] },
                "blockTime": null,
                "confirmationStatus": "confirmed"
            }
        ]);

        let history = parse_solana_signature_entries(&response).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].slot, 114);
        assert_eq!(history[0].block_time, Some(1_700_000_000));
        assert!(!history[0].failed);
        assert_eq!(history[0].confirmation_status.as_deref(), Some("finalized"));
        assert!(history[1].failed);
        assert_eq!(history[1].block_time, None);
    }

    #[test]
    fn rejects_non_array_history_response() {
        assert!(parse_solana_signature_entries(&serde_json::json!({ "error": "bad" })).is_err());
    }
}
