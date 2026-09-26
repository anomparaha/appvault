use crate::adapters::evm::client::*;
use crate::adapters::evm::tokens::*;
use crate::core::scanner::DiscoveredToken;
use crate::core::scanner::WalletChainResult;

pub async fn scan_evm_for_wallet(
    client: &reqwest::Client,
    address: &str,
    chain_key: &str,
    symbol: &str,
    rpcs: &[&str],
    tokens_to_scan: &[TokenDef],
    wallet_id: i64,
) -> Result<WalletChainResult, String> {
    let clean_addr = address.trim_start_matches("0x");
    let padded_addr = format!("000000000000000000000000{clean_addr}");
    let balance_of_data = format!("0x70a08231{padded_addr}");

    let mut batch_calls = Vec::with_capacity(1 + tokens_to_scan.len());
    batch_calls.push(serde_json::json!({
        "jsonrpc": "2.0",
        "id": 0,
        "method": "eth_getBalance",
        "params": [address, "latest"]
    }));

    for (idx, tok) in tokens_to_scan.iter().enumerate() {
        batch_calls.push(serde_json::json!({
            "jsonrpc": "2.0",
            "id": idx + 1,
            "method": "eth_call",
            "params": [
                {
                    "to": tok.contract,
                    "data": balance_of_data
                },
                "latest"
            ]
        }));
    }

    let payload = serde_json::Value::Array(batch_calls);

    for rpc in rpcs {
        let resp = client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Mozilla/5.0")
            .json(&payload)
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(arr) = res.json::<Vec<serde_json::Value>>().await {
                    let mut native_balance = format!("0 {symbol}");
                    let mut has_funds = false;
                    let mut tokens = Vec::new();

                    for item in arr {
                        let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(999);
                        let hex_res = item.get("result").and_then(|v| v.as_str()).unwrap_or("0x");

                        if id == 0 {
                            let (amt, display_str) = format_balance_display(hex_res, symbol);
                            native_balance = display_str;
                            if amt > 0.0 {
                                has_funds = true;
                            }
                        } else {
                            let token_idx = (id - 1) as usize;
                            if token_idx < tokens_to_scan.len() {
                                let tok = &tokens_to_scan[token_idx];
                                if let Some((amt, formatted)) =
                                    format_token_amount(hex_res, tok.decimals, tok.symbol)
                                {
                                    if amt > 0.0 {
                                        has_funds = true;
                                        tokens.push(DiscoveredToken {
                                            wallet_id,
                                            chain: chain_key.to_string(),
                                            symbol: tok.symbol.to_string(),
                                            name: tok.name.to_string(),
                                            balance: formatted,
                                            raw_balance: hex_res.to_string(),
                                            contract_address: tok.contract.to_string(),
                                        });
                                    }
                                }
                            }
                        }
                    }

                    return Ok(WalletChainResult {
                        wallet_id,
                        chain_key: chain_key.to_string(),
                        native_balance,
                        has_funds,
                        tokens,
                    });
                }
            }
        }
    }

    Err(format!("All RPCs failed for {chain_key}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::evm::tokens::ROBINHOOD_TOKENS;

    #[test]
    fn test_robinhood_tokens_configuration() {
        assert!(!ROBINHOOD_TOKENS.is_empty(), "ROBINHOOD_TOKENS should not be empty");
        let plur = ROBINHOOD_TOKENS.iter().find(|t| t.symbol == "$PLUR");
        assert!(plur.is_some(), "$PLUR token should be defined in ROBINHOOD_TOKENS");
        let plur_def = plur.unwrap();
        assert_eq!(plur_def.contract, "0xf890d3fe2be22c6259bbe9f607692c7168556c93");
        assert_eq!(plur_def.decimals, 18);
        assert_eq!(plur_def.name, "Plurivex");

        let weth = ROBINHOOD_TOKENS.iter().find(|t| t.symbol == "WETH");
        assert!(weth.is_some(), "WETH should be defined in ROBINHOOD_TOKENS");
    }

    #[test]
    fn test_format_token_amount_plur() {
        // Hex representation of ~994,953,759.92 tokens with 18 decimals
        let hex_val = "0x0000000000000000000000000000000000000000033701a766c97d6ac0d3f4ac";
        let res = format_token_amount(hex_val, 18, "$PLUR");
        assert!(res.is_some());
        let (amt, formatted) = res.unwrap();
        assert!(amt > 900_000_000.0);
        assert!(formatted.ends_with("$PLUR"));
    }

    #[tokio::test]
    async fn test_scan_evm_for_robinhood_tokens_live() {
        let client = shared_client();
        let rpcs = ["https://rpc.mainnet.chain.robinhood.com"];
        let addr = "0xa4707cf72aae83361d0b46b8aa83f7d4620f964a";
        if let Ok(res) = scan_evm_for_wallet(&client, addr, "robinhood", "ETH", &rpcs, ROBINHOOD_TOKENS, 999).await {
            assert_eq!(res.wallet_id, 999);
            assert_eq!(res.chain_key, "robinhood");
            assert!(res.has_funds, "Known address should have funds on Robinhood");
            let plur = res.tokens.iter().find(|t| t.symbol == "$PLUR");
            assert!(plur.is_some(), "Should discover $PLUR token for known holder");
        }
    }
}
