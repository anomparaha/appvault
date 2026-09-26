use crate::adapters::solana::client::*;
use crate::adapters::solana::tokens::*;
use crate::core::scanner::DiscoveredToken;
use crate::core::scanner::WalletChainResult;

pub async fn scan_solana_for_wallet(
    client: &reqwest::Client,
    address: &str,
    rpcs: &[&str],
    wallet_id: i64,
) -> Result<WalletChainResult, String> {
    let mut last_err = "All Solana RPCs failed".to_string();

    for rpc in rpcs {
        let native_payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": [address, {"commitment": "confirmed"}]
        });

        let post_native = client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&native_payload)
            .send()
            .await;

        if let Ok(res1) = post_native {
            if res1.status().is_success() {
                if let Ok(data1) = res1.json::<serde_json::Value>().await {
                    let lamports = data1
                        .pointer("/result/value")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let (sol_amt, display_str) = format_sol_display(lamports);
                    let mut has_funds = sol_amt > 0.0;
                    let mut tokens = Vec::new();

                    let token_programs = [
                        ("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "SPL Token"),
                        ("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "Token-2022"),
                    ];

                    struct RawAccount {
                        mint: String,
                        ui_amount: f64,
                        amount_raw: String,
                        default_type: &'static str,
                    }

                    let mut raw_accounts = Vec::new();

                    for (prog_id, default_type) in token_programs {
                        let spl_res = client
                            .post(*rpc)
                            .header("Content-Type", "application/json")
                            .header("User-Agent", "Plurivex/1.0")
                            .json(&serde_json::json!({
                                "jsonrpc": "2.0",
                                "id": 2,
                                "method": "getTokenAccountsByOwner",
                                "params": [
                                    address,
                                    {"programId": prog_id},
                                    {"encoding": "jsonParsed"}
                                ]
                            }))
                            .send()
                            .await;

                        if let Ok(spl_response) = spl_res {
                            if spl_response.status().is_success() {
                                if let Ok(spl_data) = spl_response.json::<serde_json::Value>().await {
                                    if let Some(accounts) = spl_data
                                        .get("result")
                                        .and_then(|r| r.get("value"))
                                        .and_then(|v| v.as_array())
                                    {
                                        for acc in accounts {
                                            let info = acc
                                                .get("account")
                                                .and_then(|a| a.get("data"))
                                                .and_then(|d| d.get("parsed"))
                                                .and_then(|p| p.get("info"));
                                            let Some(info) = info else {
                                                continue;
                                            };
                                            let mint =
                                                info.get("mint").and_then(|m| m.as_str()).unwrap_or("");
                                            let token_amount = info.get("tokenAmount");
                                            let ui_amount = token_amount
                                                .and_then(|t| t.get("uiAmount"))
                                                .and_then(|u| u.as_f64())
                                                .unwrap_or(0.0);
                                            let amount_raw = token_amount
                                                .and_then(|t| t.get("amount"))
                                                .and_then(|a| a.as_str())
                                                .unwrap_or("0");

                                            if ui_amount > 0.0 && !mint.is_empty() {
                                                has_funds = true;
                                                raw_accounts.push(RawAccount {
                                                    mint: mint.to_string(),
                                                    ui_amount,
                                                    amount_raw: amount_raw.to_string(),
                                                    default_type,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Dynamically resolve metadata for unknown mints
                    let mut unknown_mints: Vec<String> = Vec::new();
                    for acc in &raw_accounts {
                        let (known_sym, _) = solana_token_meta(&acc.mint);
                        if known_sym.is_empty() && !unknown_mints.contains(&acc.mint) {
                            unknown_mints.push(acc.mint.clone());
                        }
                    }

                    let resolved_meta = if !unknown_mints.is_empty() {
                        resolve_solana_token_metas(client, rpc, &unknown_mints).await
                    } else {
                        std::collections::HashMap::new()
                    };

                    for acc in raw_accounts {
                        let (known_sym, known_name) = solana_token_meta(&acc.mint);
                        let (symbol, name) = if !known_sym.is_empty() {
                            (known_sym.to_string(), known_name.to_string())
                        } else if let Some((dyn_sym, dyn_name)) = resolved_meta.get(&acc.mint) {
                            let n = if !dyn_name.is_empty() {
                                dyn_name.clone()
                            } else {
                                acc.default_type.to_string()
                            };
                            (dyn_sym.clone(), n)
                        } else {
                            let start = &acc.mint[..acc.mint.len().min(4)];
                            let end = if acc.mint.len() > 4 {
                                &acc.mint[acc.mint.len() - 4..]
                            } else {
                                ""
                            };
                            (format!("{start}..{end}"), acc.default_type.to_string())
                        };

                        let formatted: String = if acc.ui_amount < 0.0001 {
                            format!("{:.8} {}", acc.ui_amount, symbol)
                        } else if acc.ui_amount < 1.0 {
                            format!("{:.6} {}", acc.ui_amount, symbol)
                        } else if acc.ui_amount < 1000.0 {
                            format!("{:.4} {}", acc.ui_amount, symbol)
                        } else {
                            format!("{:.2} {}", acc.ui_amount, symbol)
                        };

                        tokens.push(DiscoveredToken {
                            wallet_id,
                            chain: "sol".to_string(),
                            symbol,
                            name,
                            balance: formatted,
                            raw_balance: acc.amount_raw,
                            contract_address: acc.mint,
                        });
                    }

                    return Ok(WalletChainResult {
                        wallet_id,
                        chain_key: "sol".to_string(),
                        native_balance: display_str,
                        has_funds,
                        tokens,
                    });
                }
            }
        }

        last_err = format!("RPC {rpc} failed on Solana check");
    }

    Err(last_err)
}

async fn resolve_solana_token_metas(
    client: &reqwest::Client,
    rpc: &str,
    mints: &[String],
) -> std::collections::HashMap<String, (String, String)> {
    let mut resolved = std::collections::HashMap::new();
    if mints.is_empty() {
        return resolved;
    }

    // 1. Try Helius DAS getAssetBatch on the current RPC or Helius endpoint
    let das_endpoints = if rpc.contains("helius") {
        vec![rpc]
    } else {
        vec![
            rpc,
            "https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9",
        ]
    };

    for das_url in das_endpoints {
        let das_payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "das_meta",
            "method": "getAssetBatch",
            "params": {
                "ids": mints
            }
        });

        if let Ok(resp) = client
            .post(das_url)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&das_payload)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<serde_json::Value>().await {
                    if let Some(items) = data.get("result").and_then(|r| r.as_array()) {
                        for item in items {
                            let Some(id) = item.get("id").and_then(|v| v.as_str()) else {
                                continue;
                            };

                            let name = item
                                .pointer("/content/metadata/name")
                                .and_then(|v| v.as_str())
                                .or_else(|| {
                                    item.pointer("/mint_extensions/metadata/name")
                                        .and_then(|v| v.as_str())
                                })
                                .unwrap_or("")
                                .trim()
                                .trim_matches('\0');

                            let symbol = item
                                .pointer("/content/metadata/symbol")
                                .and_then(|v| v.as_str())
                                .or_else(|| {
                                    item.pointer("/mint_extensions/metadata/symbol")
                                        .and_then(|v| v.as_str())
                                })
                                .unwrap_or("")
                                .trim()
                                .trim_matches('\0');

                            if !symbol.is_empty() {
                                resolved.insert(id.to_string(), (symbol.to_string(), name.to_string()));
                            }
                        }
                    }
                }
            }
        }

        if resolved.len() == mints.len() {
            return resolved;
        }
    }

    // 2. Fallback: DexScreener API for any remaining unresolved mints
    for mint in mints {
        if resolved.contains_key(mint) {
            continue;
        }

        let dex_url = format!("https://api.dexscreener.com/latest/dex/tokens/{mint}");
        if let Ok(resp) = client
            .get(&dex_url)
            .header("User-Agent", "Plurivex/1.0")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<serde_json::Value>().await {
                    if let Some(pairs) = data.get("pairs").and_then(|p| p.as_array()) {
                        if let Some(first) = pairs.first() {
                            let sym = first
                                .pointer("/baseToken/symbol")
                                .and_then(|s| s.as_str())
                                .unwrap_or("")
                                .trim()
                                .trim_matches('\0');
                            let name = first
                                .pointer("/baseToken/name")
                                .and_then(|n| n.as_str())
                                .unwrap_or("")
                                .trim()
                                .trim_matches('\0');

                            if !sym.is_empty() {
                                resolved.insert(mint.clone(), (sym.to_string(), name.to_string()));
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Fallback: getAccountInfo with jsonParsed on standard Solana RPC
    for mint in mints {
        if resolved.contains_key(mint) {
            continue;
        }

        let info_payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [mint, {"encoding": "jsonParsed"}]
        });

        if let Ok(resp) = client
            .post(rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&info_payload)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<serde_json::Value>().await {
                    if let Some(exts) = data
                        .pointer("/result/value/data/parsed/info/extensions")
                        .and_then(|e| e.as_array())
                    {
                        for ext in exts {
                            if ext.get("extension").and_then(|e| e.as_str()) == Some("tokenMetadata") {
                                if let Some(state) = ext.get("state") {
                                    let sym = state.get("symbol").and_then(|s| s.as_str()).unwrap_or("").trim().trim_matches('\0');
                                    let name = state.get("name").and_then(|n| n.as_str()).unwrap_or("").trim().trim_matches('\0');
                                    if !sym.is_empty() {
                                        resolved.insert(mint.clone(), (sym.to_string(), name.to_string()));
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    resolved
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_solana_token_metadata_resolution() {
        let client = reqwest::Client::new();
        let rpc = "https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9";
        let mints = vec!["BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs".to_string()];
        let metas = resolve_solana_token_metas(&client, rpc, &mints).await;
        if let Some((sym, name)) = metas.get("BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs") {
            assert_eq!(sym, "BTc");
            assert_eq!(name, "Bobby The Cat");
        }
    }

    #[tokio::test]
    async fn test_scan_solana_for_wallet_live() {
        let client = reqwest::Client::new();
        let rpcs = ["https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9"];
        let addr = "BguMMNRsrG1QzPDYtTRYku8SyVfuSe2edoVv6jCFbt3j";
        if let Ok(res) = scan_solana_for_wallet(&client, addr, &rpcs, 1434).await {
            assert_eq!(res.wallet_id, 1434);
            assert_eq!(res.chain_key, "sol");
        }
    }
}
