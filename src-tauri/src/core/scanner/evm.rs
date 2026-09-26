use crate::adapters::evm::client::*;
use crate::adapters::evm::tokens::*;
use crate::core::scanner::{DiscoveredToken, ExistingEvmToken, WalletChainResult};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::cmp::Reverse;

const TRANSFER_EVENT_TOPIC: &str = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TOKEN_LOOKBACK_WINDOWS: [u64; 4] = [100_000, 10_000, 2_000, 250];
const MAX_DISCOVERED_CONTRACTS: usize = 100;
const MAX_TOKEN_DECIMALS: u8 = 36;

#[derive(Clone, Debug)]
struct EvmToken {
    symbol: String,
    name: String,
    contract: String,
    decimals: u8,
}

fn is_evm_address(address: &str) -> bool {
    let clean = address.strip_prefix("0x").unwrap_or(address);
    clean.len() == 40 && clean.chars().all(|ch| ch.is_ascii_hexdigit())
}

fn address_topic(address: &str) -> Option<String> {
    if !is_evm_address(address) {
        return None;
    }
    Some(format!(
        "0x000000000000000000000000{}",
        address.trim_start_matches("0x").to_lowercase()
    ))
}

fn parse_hex_u64(value: &str) -> Option<u64> {
    u64::from_str_radix(value.trim_start_matches("0x"), 16).ok()
}

fn word_as_usize(word: &[u8]) -> Option<usize> {
    if word.is_empty() {
        return None;
    }
    word.iter()
        .rev()
        .take(8)
        .rev()
        .try_fold(0usize, |value, byte| {
            value.checked_mul(256)?.checked_add(usize::from(*byte))
        })
}

fn decode_abi_text(value: &str) -> Option<String> {
    let clean = value.strip_prefix("0x").unwrap_or(value);
    if clean.is_empty() || (clean.len() & 1) != 0 {
        return None;
    }
    let bytes = hex::decode(clean).ok()?;

    // Standard ABI dynamic string: offset word, length word, UTF-8 bytes.
    if bytes.len() >= 64 {
        if let Some(offset) = word_as_usize(&bytes[..32]) {
            if offset.checked_add(32).is_some_and(|end| end <= bytes.len()) {
                let length_start = offset;
                let data_start = offset + 32;
                if let Some(length) = word_as_usize(&bytes[length_start..data_start]) {
                    if length > 0 && data_start.checked_add(length).is_some_and(|end| end <= bytes.len()) {
                        let text = String::from_utf8_lossy(&bytes[data_start..data_start + length]);
                        let cleaned: String = text
                            .chars()
                            .filter(|ch| !ch.is_control() || ch.is_whitespace())
                            .take(64)
                            .collect();
                        let cleaned = cleaned.trim().trim_matches('\0').trim();
                        if !cleaned.is_empty() {
                            return Some(cleaned.to_string());
                        }
                    }
                }
            }
        }
    }

    // Some older ERC-20 contracts return bytes32 instead of an ABI string.
    let fixed = bytes.iter().copied().take(32).take_while(|byte| *byte != 0).collect::<Vec<_>>();
    if fixed.is_empty() {
        return None;
    }
    let text = String::from_utf8_lossy(&fixed);
    let cleaned: String = text
        .chars()
        .filter(|ch| !ch.is_control() || ch.is_whitespace())
        .take(64)
        .collect();
    let cleaned = cleaned.trim();
    (!cleaned.is_empty()).then(|| cleaned.to_string())
}

fn decode_decimals(value: &str) -> Option<u8> {
    let clean = value.strip_prefix("0x").unwrap_or(value);
    if clean.is_empty() || !clean.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return None;
    }
    if clean.chars().all(|ch| ch == '0') {
        return Some(0);
    }
    if clean.len() > 2 && clean[..clean.len() - 2].chars().any(|ch| ch != '0') {
        return None;
    }
    let tail = if clean.len() > 2 { &clean[clean.len() - 2..] } else { clean };
    let decimals = u8::from_str_radix(tail, 16).ok()?;
    (decimals <= MAX_TOKEN_DECIMALS).then_some(decimals)
}

async fn rpc_result(
    client: &reqwest::Client,
    rpc: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let response = client
        .post(rpc)
        .header("Content-Type", "application/json")
        .header("User-Agent", "Plurivex/1.0")
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        }))
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} from {rpc}", response.status()));
    }
    let body: serde_json::Value = response.json().await.map_err(|err| err.to_string())?;
    if let Some(error) = body.get("error") {
        return Err(error.to_string());
    }
    body.get("result")
        .cloned()
        .ok_or_else(|| format!("Missing JSON-RPC result from {rpc}"))
}

fn parse_batch_results(
    items: Vec<serde_json::Value>,
    expected_ids: &[u64],
) -> Option<HashMap<u64, String>> {
    let mut results_by_id = HashMap::<u64, String>::new();
    for item in items {
        if item.get("error").is_some() {
            return None;
        }
        let id = item.get("id")?.as_u64()?;
        let result = item.get("result")?.as_str()?;
        let clean = result.strip_prefix("0x").unwrap_or(result);
        if clean.is_empty() || !clean.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return None;
        }
        results_by_id.insert(id, result.to_string());
    }

    if results_by_id.len() != expected_ids.len()
        || expected_ids.iter().any(|id| !results_by_id.contains_key(id))
    {
        return None;
    }
    Some(results_by_id)
}

async fn recent_transfer_contracts(
    client: &reqwest::Client,
    rpc: &str,
    address: &str,
) -> Result<Vec<String>, String> {
    let topic = address_topic(address).ok_or_else(|| "Invalid EVM wallet address".to_string())?;
    let block_value = rpc_result(client, rpc, "eth_blockNumber", serde_json::json!([])).await?;
    let latest_block = block_value
        .as_str()
        .and_then(parse_hex_u64)
        .ok_or_else(|| "Invalid eth_blockNumber response".to_string())?;

    let mut last_error = String::from("eth_getLogs failed");
    for lookback in TOKEN_LOOKBACK_WINDOWS {
        let from_block = latest_block.saturating_sub(lookback);
        let from_tag = format!("0x{from_block:x}");
        let filters = [
            serde_json::json!({
                "fromBlock": from_tag.clone(),
                "toBlock": "latest",
                "topics": [TRANSFER_EVENT_TOPIC, topic.clone()],
            }),
            serde_json::json!({
                "fromBlock": from_tag,
                "toBlock": "latest",
                "topics": [TRANSFER_EVENT_TOPIC, serde_json::Value::Null, topic],
            }),
        ];

        let mut contracts = HashMap::<String, u64>::new();
        let mut successful_queries = 0usize;
        for filter in filters {
            match rpc_result(client, rpc, "eth_getLogs", serde_json::json!([filter])).await {
                Ok(serde_json::Value::Array(logs)) => {
                    successful_queries += 1;
                    for log in logs {
                        if let Some(contract) = log.get("address").and_then(|value| value.as_str()) {
                            if is_evm_address(contract) {
                                let block = log
                                    .get("blockNumber")
                                    .and_then(|value| value.as_str())
                                    .and_then(parse_hex_u64)
                                    .unwrap_or(0);
                                contracts
                                    .entry(contract.to_lowercase())
                                    .and_modify(|latest| *latest = (*latest).max(block))
                                    .or_insert(block);
                            }
                        }
                    }
                }
                Ok(_) => last_error = "Invalid eth_getLogs response".to_string(),
                Err(error) => last_error = error,
            }
        }

        if successful_queries == 2 {
            let mut contracts = contracts.into_iter().collect::<Vec<_>>();
            contracts.sort_by_key(|(contract, block)| (Reverse(*block), contract.clone()));
            contracts.truncate(MAX_DISCOVERED_CONTRACTS);
            return Ok(contracts.into_iter().map(|(contract, _)| contract).collect());
        }
    }

    Err(last_error)
}

async fn resolve_token_metadata(
    client: &reqwest::Client,
    rpc: &str,
    contracts: &[String],
) -> HashMap<String, EvmToken> {
    const METADATA_BATCH_SIZE: usize = 20;
    let mut resolved = HashMap::new();

    for chunk in contracts.chunks(METADATA_BATCH_SIZE) {
        let mut calls = Vec::with_capacity(chunk.len() * 3);
        for (index, contract) in chunk.iter().enumerate() {
            for (offset, data) in ["0x95d89b41", "0x06fdde03", "0x313ce567"].iter().enumerate() {
                calls.push(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": index * 3 + offset,
                    "method": "eth_call",
                    "params": [{"to": contract, "data": data}, "latest"],
                }));
            }
        }

        let response = client
            .post(rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&serde_json::Value::Array(calls))
            .send()
            .await;
        let Ok(response) = response else { continue };
        if !response.status().is_success() {
            continue;
        }
        let Ok(results) = response.json::<Vec<serde_json::Value>>().await else {
            continue;
        };
        let results_by_id = results
            .into_iter()
            .filter_map(|result| {
                let id = usize::try_from(result.get("id")?.as_u64()?).ok()?;
                let value = result.get("result")?.as_str()?.to_string();
                Some((id, value))
            })
            .collect::<HashMap<_, _>>();

        for (index, contract) in chunk.iter().enumerate() {
            let Some(decimals) = results_by_id
                .get(&(index * 3 + 2))
                .and_then(|value| decode_decimals(value))
            else {
                continue;
            };
            let short_address = format!(
                "{}…{}",
                &contract[2..6],
                &contract[contract.len() - 4..]
            );
            let symbol = results_by_id
                .get(&(index * 3))
                .and_then(|value| decode_abi_text(value))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| short_address.clone());
            let name = results_by_id
                .get(&(index * 3 + 1))
                .and_then(|value| decode_abi_text(value))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "Unverified ERC-20".to_string());

            resolved.insert(
                contract.to_lowercase(),
                EvmToken {
                    symbol,
                    name,
                    contract: contract.to_lowercase(),
                    decimals,
                },
            );
        }
    }

    resolved
}

#[allow(clippy::too_many_arguments)]
pub async fn scan_evm_for_wallet(
    client: &reqwest::Client,
    address: &str,
    chain_key: &str,
    symbol: &str,
    rpcs: &[&str],
    tokens_to_scan: &[TokenDef],
    existing_tokens: Vec<ExistingEvmToken>,
    wallet_id: i64,
) -> Result<WalletChainResult, String> {
    let mut tokens_by_address = BTreeMap::<String, EvmToken>::new();
    for token in tokens_to_scan {
        let contract = token.contract.to_lowercase();
        tokens_by_address.insert(
            contract.clone(),
            EvmToken {
                symbol: token.symbol.to_string(),
                name: token.name.to_string(),
                contract,
                decimals: token.decimals,
            },
        );
    }
    let mut metadata_required = HashSet::new();
    let mut existing_contracts = HashSet::new();
    for token in existing_tokens {
        if !is_evm_address(&token.contract_address) {
            continue;
        }
        let contract = token.contract_address.to_lowercase();
        existing_contracts.insert(contract.clone());
        if tokens_by_address.contains_key(&contract) {
            continue;
        }
        if token.decimals.is_none() {
            metadata_required.insert(contract.clone());
        }
        tokens_by_address.insert(contract.clone(), EvmToken {
            symbol: if token.symbol.trim().is_empty() { contract.clone() } else { token.symbol },
            name: if token.name.trim().is_empty() { "Unverified ERC-20".to_string() } else { token.name },
            contract,
            decimals: token.decimals.unwrap_or(0),
        });
    }

    // Standard EVM RPC has no token-enumeration method. Use recent Transfer logs
    // (both incoming and outgoing) to discover arbitrary ERC-20 contracts, then
    // query balanceOf + metadata. Previously discovered contracts are also loaded
    // from SQLite above, so they continue to be checked after the log window moves.
    let mut discovered_contracts = Vec::new();
    for rpc in rpcs {
        if let Ok(contracts) = recent_transfer_contracts(client, rpc, address).await {
            discovered_contracts = contracts;
            break;
        }
    }

    for contract in discovered_contracts {
        if !tokens_by_address.contains_key(&contract) {
            metadata_required.insert(contract);
        }
    }
    let mut contracts_to_resolve = metadata_required.iter().cloned().collect::<Vec<_>>();
    contracts_to_resolve.sort();
    for rpc in rpcs {
        if metadata_required.is_empty() {
            break;
        }
        let resolved = resolve_token_metadata(client, rpc, &contracts_to_resolve).await;
        for (contract, token) in resolved {
            tokens_by_address.insert(contract.clone(), token);
            metadata_required.remove(&contract);
        }
        contracts_to_resolve.retain(|contract| metadata_required.contains(contract));
    }
    // A previously stored token with unknown decimals cannot safely be valued.
    // Keep the last persisted chain data instead of deleting it on this scan.
    if metadata_required.iter().any(|contract| existing_contracts.contains(contract)) {
        return Err("Unable to resolve decimals for previously detected token balances".to_string());
    }
    // Newly discovered contracts without readable decimals are not emitted; the
    // next periodic scan can retry without showing raw units as whole tokens.
    for contract in metadata_required {
        tokens_by_address.remove(&contract);
    }

    let token_list = tokens_by_address.into_values().collect::<Vec<_>>();
    let clean_addr = address.trim_start_matches("0x");
    if clean_addr.len() != 40 || !clean_addr.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Invalid EVM wallet address".to_string());
    }
    let padded_addr = format!("000000000000000000000000{}", clean_addr.to_lowercase());
    let balance_of_data = format!("0x70a08231{padded_addr}");

    const BALANCE_BATCH_SIZE: usize = 40;
    for rpc in rpcs {
        let mut results_by_id = HashMap::<u64, String>::new();
        let mut token_offset = 0usize;
        let mut first_batch = true;
        let mut rpc_ok = true;

        loop {
            let native_count = if first_batch { 1 } else { 0 };
            let capacity = BALANCE_BATCH_SIZE - native_count;
            let end = (token_offset + capacity).min(token_list.len());
            let mut calls = Vec::with_capacity((end - token_offset) + native_count);
            let mut expected_ids = Vec::with_capacity(calls.capacity());

            if first_batch {
                calls.push(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 0,
                    "method": "eth_getBalance",
                    "params": [address, "latest"]
                }));
                expected_ids.push(0);
            }
            for (sub_idx, token) in token_list[token_offset..end].iter().enumerate() {
                let index = token_offset + sub_idx;
                let id = u64::try_from(index + 1).unwrap_or(u64::MAX);
                calls.push(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "method": "eth_call",
                    "params": [{"to": token.contract, "data": balance_of_data}, "latest"]
                }));
                expected_ids.push(id);
            }

            let response = client
                .post(*rpc)
                .header("Content-Type", "application/json")
                .header("User-Agent", "Plurivex/1.0")
                .json(&serde_json::Value::Array(calls))
                .send()
                .await;
            let Ok(response) = response else {
                rpc_ok = false;
                break;
            };
            if !response.status().is_success() {
                rpc_ok = false;
                break;
            }
            let Ok(items) = response.json::<Vec<serde_json::Value>>().await else {
                rpc_ok = false;
                break;
            };
            let Some(batch_results) = parse_batch_results(items, &expected_ids) else {
                rpc_ok = false;
                break;
            };
            results_by_id.extend(batch_results);

            token_offset = end;
            first_batch = false;
            if token_offset >= token_list.len() {
                break;
            }
        }

        if !rpc_ok {
            continue;
        }
        let Some(native_result) = results_by_id.get(&0) else { continue };
        let (native_amount, native_balance) = format_balance_display(native_result, symbol);
        let mut has_funds = native_amount > 0.0;
        let mut tokens = Vec::new();
        let mut token_results_valid = true;

        for (index, token) in token_list.iter().enumerate() {
            let Some(result_id) = u64::try_from(index + 1).ok() else {
                token_results_valid = false;
                break;
            };
            let Some(result) = results_by_id.get(&result_id) else {
                token_results_valid = false;
                break;
            };
            let clean = result.strip_prefix("0x").unwrap_or(result);
            if u128::from_str_radix(clean, 16).is_err() {
                token_results_valid = false;
                break;
            }
            if let Some((amount, formatted)) = format_token_amount(result, token.decimals, &token.symbol) {
                if amount > 0.0 {
                    has_funds = true;
                    tokens.push(DiscoveredToken {
                        wallet_id,
                        chain: chain_key.to_string(),
                        symbol: token.symbol.clone(),
                        name: token.name.clone(),
                        balance: formatted,
                        raw_balance: result.to_string(),
                        contract_address: token.contract.clone(),
                        decimals: token.decimals,
                    });
                }
            }
        }
        if !token_results_valid {
            continue;
        }

        return Ok(WalletChainResult {
            wallet_id,
            chain_key: chain_key.to_string(),
            native_balance,
            has_funds,
            tokens,
        });
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
        let plur = ROBINHOOD_TOKENS.iter().find(|token| token.symbol == "$PLUR");
        assert!(plur.is_some(), "$PLUR token should be defined in ROBINHOOD_TOKENS");
        let plur_def = plur.unwrap();
        assert_eq!(plur_def.contract, "0xf890d3fe2be22c6259bbe9f607692c7168556c93");
        assert_eq!(plur_def.decimals, 18);
        assert_eq!(plur_def.name, "Plurivex");
        assert!(ROBINHOOD_TOKENS.iter().any(|token| token.symbol == "WETH"));
    }

    #[test]
    fn parses_standard_dynamic_abi_string() {
        let text = "USDC";
        let mut bytes = vec![0u8; 64];
        bytes[31] = 32;
        bytes[63] = text.len() as u8;
        bytes.extend_from_slice(text.as_bytes());
        bytes.resize(128, 0);
        assert_eq!(decode_abi_text(&format!("0x{}", hex::encode(bytes))).as_deref(), Some(text));
    }

    #[test]
    fn parses_bytes32_metadata_and_limits_decimals() {
        assert_eq!(decode_abi_text(&format!("0x{:0<64}", hex::encode("TKN"))), Some("TKN".to_string()));
        assert_eq!(decode_decimals("0x12"), Some(18));
        assert_eq!(decode_decimals("0x25"), None);
    }

    #[test]
    fn builds_transfer_filter_topics_from_wallet_address() {
        let topic = address_topic("0x00000000000000000000000000000000000000Ab").unwrap();
        assert_eq!(topic.len(), 66);
        assert!(topic.ends_with("00000000000000000000000000000000000000ab"));
        assert!(address_topic("0xnot-an-address").is_none());
    }
}
