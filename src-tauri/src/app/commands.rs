use crate::adapters::evm::client::*;
use crate::adapters::solana::client::*;
use crate::core::scanner::{execute_scan_balances, ChainKind, ScanSummary, CHAINS};
use crate::core::wallets::import::{scan_directory_native as core_scan_dir, NativeScanResult};
use std::sync::atomic::{AtomicBool, Ordering};
use base64::Engine;
use rusqlite::OptionalExtension;

pub static AIR_GAPPED_MODE: AtomicBool = AtomicBool::new(true);

#[tauri::command]
pub fn set_air_gapped_mode(enabled: bool) -> Result<bool, String> {
    AIR_GAPPED_MODE.store(enabled, Ordering::SeqCst);
    Ok(enabled)
}

#[tauri::command]
pub fn get_air_gapped_mode() -> Result<bool, String> {
    Ok(AIR_GAPPED_MODE.load(Ordering::SeqCst))
}

#[tauri::command]
pub fn verify_online_network_access(session_token: String) -> Result<(), String> {
    if !crate::core::security::session::get_session_manager()
        .is_authenticated_without_touch(&session_token)
    {
        return Err("Action denied: Active unlocked vault session required.".to_string());
    }
    verify_air_gap_inactive()
}

const ROBINHOOD_ZAN_API_KEY_META_KEY: &str = "rpc.robinhood.zan_api_key.v1";

fn is_valid_zan_api_key(api_key: &str) -> bool {
    (16..=256).contains(&api_key.len())
        && api_key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn load_robinhood_zan_api_key(
    app: &tauri::AppHandle,
    session_token: &str,
) -> Result<Option<zeroize::Zeroizing<String>>, String> {
    crate::db::commands::verify_session_authenticated(session_token)?;
    let conn = crate::db::commands::get_connection(app)?;
    let encrypted: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            rusqlite::params![ROBINHOOD_ZAN_API_KEY_META_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Failed to read Robinhood WSS configuration: {error}"))?;
    let Some(encrypted) = encrypted else {
        return Ok(None);
    };

    let master_key = crate::core::security::session::get_session_manager()
        .get_master_key(session_token)?;
    let api_key = crate::core::security::crypto::decrypt_vault_zeroizing(
        &encrypted,
        master_key.as_str(),
    )?;
    if !is_valid_zan_api_key(api_key.as_str()) {
        return Err("Stored ZAN API key is invalid; save the key again.".to_string());
    }
    Ok(Some(api_key))
}

#[tauri::command]
pub fn has_robinhood_wss_api_key(
    app: tauri::AppHandle,
    session_token: String,
) -> Result<bool, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    let conn = crate::db::commands::get_connection(&app)?;
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM meta WHERE key = ?1)",
            rusqlite::params![ROBINHOOD_ZAN_API_KEY_META_KEY],
            |row| row.get(0),
        )
        .map_err(|error| format!("Failed to read Robinhood WSS configuration: {error}"))?;
    Ok(exists)
}

#[tauri::command]
pub fn set_robinhood_wss_api_key(
    app: tauri::AppHandle,
    session_token: String,
    api_key: String,
) -> Result<(), String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;

    // Keep the incoming IPC value zeroizing and never return or log it. The
    // credential is encrypted with the unlocked vault master key before storage.
    let mut raw_api_key = zeroize::Zeroizing::new(api_key);
    let normalized = raw_api_key.trim().to_string();
    crate::core::security::memory::secure_zero_string(&mut raw_api_key);
    let api_key = zeroize::Zeroizing::new(normalized);
    if !is_valid_zan_api_key(api_key.as_str()) {
        return Err("Invalid ZAN API key format".to_string());
    }

    let master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;
    let encrypted = crate::core::security::crypto::encrypt_vault(
        api_key.as_str(),
        master_key.as_str(),
    )?;
    let conn = crate::db::commands::get_connection(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        rusqlite::params![ROBINHOOD_ZAN_API_KEY_META_KEY, encrypted],
    )
    .map_err(|error| format!("Failed to save Robinhood WSS configuration: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn clear_robinhood_wss_api_key(
    app: tauri::AppHandle,
    session_token: String,
) -> Result<(), String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    let conn = crate::db::commands::get_connection(&app)?;
    conn.execute(
        "DELETE FROM meta WHERE key = ?1",
        rusqlite::params![ROBINHOOD_ZAN_API_KEY_META_KEY],
    )
    .map_err(|error| format!("Failed to clear Robinhood WSS configuration: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_robinhood_wss_endpoint_scoped(
    app: tauri::AppHandle,
    session_token: String,
) -> Result<Option<String>, String> {
    verify_authenticated_network_access(&session_token)?;
    let Some(api_key) = load_robinhood_zan_api_key(&app, &session_token)? else {
        return Ok(None);
    };

    // The key is encrypted at rest. It is only released to the renderer's
    // WebSocket transport after a fresh session + Safe Mode check.
    Ok(Some(format!(
        "wss://api.zan.top/node/ws/v1/robinhood/mainnet/{}",
        api_key.as_str()
    )))
}

pub fn verify_air_gap_inactive() -> Result<(), String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Safe Mode is active: app-command network requests are disabled.".to_string());
    }
    Ok(())
}

fn verify_authenticated_network_access(session_token: &str) -> Result<(), String> {
    // Network activity must not reset the vault's idle timeout. Each request is
    // still revalidated natively, but only explicit vault operations count as use.
    if !crate::core::security::session::get_session_manager()
        .is_authenticated_without_touch(session_token)
    {
        return Err("Action denied: Active unlocked vault session required.".to_string());
    }
    verify_air_gap_inactive()
}

fn authenticated_network_gate(session_token: &str) -> crate::core::scanner::NetworkAccessGate {
    let token = session_token.to_string();
    std::sync::Arc::new(move || verify_authenticated_network_access(&token))
}

async fn send_http_request_with_gate<F>(
    request: F,
    session_token: &str,
) -> Result<reqwest::Response, String>
where
    F: std::future::Future<Output = Result<reqwest::Response, reqwest::Error>>,
{
    let network_gate = authenticated_network_gate(session_token);
    crate::adapters::network::await_with_gate(
        async move {
            request
                .await
                .map_err(crate::adapters::network::redact_reqwest_error)
        },
        network_gate.as_ref(),
    )
    .await
}

async fn read_http_text_limited(
    mut response: reqwest::Response,
    max_bytes: usize,
    session_token: &str,
) -> Result<String, String> {
    let network_gate = authenticated_network_gate(session_token);
    let body = crate::adapters::network::read_response_limited(
        &mut response,
        max_bytes,
        network_gate.as_ref(),
    )
    .await?;
    String::from_utf8(body).map_err(|_| "HTTP response is not valid UTF-8".to_string())
}

#[tauri::command]
pub async fn scan_balances(
    app: tauri::AppHandle,
    session_token: String,
    wallet_id: Option<i64>,
    wallet_ids: Option<Vec<i64>>,
    chain_key: Option<String>,
    exclude_chain_key: Option<String>,
) -> Result<ScanSummary, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Safe Mode is active: app-command network requests are disabled.".to_string());
    }
    let gate_session_token = session_token.clone();
    let network_gate: crate::core::scanner::NetworkAccessGate =
        std::sync::Arc::new(move || verify_authenticated_network_access(&gate_session_token));
    let should_scan_robinhood = chain_key
        .as_deref()
        .map(|requested| requested == "robinhood")
        .unwrap_or(true)
        && exclude_chain_key.as_deref() != Some("robinhood");
    let robinhood_rpc_override = if should_scan_robinhood {
        network_gate.as_ref()()?;
        load_robinhood_zan_api_key(&app, &session_token)?.map(|api_key| {
            zeroize::Zeroizing::new(format!(
                "https://api.zan.top/node/v1/robinhood/mainnet/{}",
                api_key.as_str()
            ))
        })
    } else {
        None
    };
    execute_scan_balances(
        app,
        wallet_id,
        wallet_ids,
        chain_key,
        exclude_chain_key,
        robinhood_rpc_override,
        network_gate,
    )
    .await
}

#[tauri::command]
pub async fn get_chain_fee_data(
    session_token: String,
    chain_key: String,
) -> Result<ChainFeeResponse, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Safe Mode is active: app-command network requests are disabled.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == chain_key)
        .ok_or_else(|| "Chain not found".to_string())?;

    if chain.kind == ChainKind::Solana {
        return Ok(ChainFeeResponse {
            gas_price_gwei: 0.0,
            priority_fee_gwei: 0.0,
            estimated_fee_eth: "0.00000500 SOL".to_string(),
            chain_id: 101,
            symbol: "SOL".to_string(),
        });
    }

    let network_gate = authenticated_network_gate(&session_token);
    crate::adapters::evm::client::get_chain_fee_data_with_gate(
        chain.key,
        chain.rpcs,
        chain.symbol,
        network_gate.as_ref(),
    )
    .await
}

#[tauri::command]
pub async fn get_account_nonce_and_balance(
    session_token: String,
    chain_key: String,
    address: String,
) -> Result<AccountInfoResponse, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;
    let chain = CHAINS
        .iter()
        .find(|c| c.key == chain_key)
        .ok_or_else(|| "Chain not found".to_string())?;
    let network_gate = authenticated_network_gate(&session_token);

    if chain.kind == ChainKind::Solana {
        let last_error = "Failed to query Solana balance from all RPC nodes".to_string();
        for rpc in chain.rpcs {
            network_gate.as_ref()()?;
            if let Ok(lamports_str) =
                crate::adapters::solana::client::rpc_get_sol_balance_with_gate(
                    &address,
                    rpc,
                    network_gate.as_ref(),
                )
                .await
            {
                network_gate.as_ref()()?;
                let lamports: u64 = lamports_str.parse().unwrap_or(0);
                let sol_amt = (lamports as f64) / 1e9;
                let formatted = format!("{:.6} SOL", sol_amt);
                return Ok(AccountInfoResponse {
                    balance_hex: format!("{:#x}", lamports),
                    balance_eth: sol_amt,
                    balance_formatted: formatted,
                    nonce: 0,
                });
            }
        }
        network_gate.as_ref()()?;
        return Err(last_error);
    }

    crate::adapters::evm::client::get_account_nonce_and_balance_with_gate(
        chain.key,
        chain.rpcs,
        chain.symbol,
        &address,
        network_gate.as_ref(),
    )
    .await
}

#[tauri::command]
pub async fn broadcast_raw_tx(
    session_token: String,
    chain_key: String,
    raw_tx: String,
) -> Result<String, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Safe Mode is active: app-command network requests are disabled.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == chain_key)
        .ok_or_else(|| "Chain not found".to_string())?;
    let network_gate = authenticated_network_gate(&session_token);
    crate::adapters::evm::client::broadcast_raw_tx_with_gate(
        chain.key,
        chain.rpcs,
        &raw_tx,
        network_gate.as_ref(),
    )
    .await
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvmTransactionConfirmation {
    pub transaction_hash: String,
    pub status: String,
    pub block_number: Option<String>,
    pub error: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn confirm_evm_transaction(
    session_token: String,
    chain_key: String,
    transaction_hash: String,
) -> Result<EvmTransactionConfirmation, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;

    let transaction_hash = transaction_hash.trim().to_ascii_lowercase();
    if transaction_hash.len() != 66
        || !transaction_hash.starts_with("0x")
        || !transaction_hash[2..].chars().all(|character| character.is_ascii_hexdigit())
    {
        return Err("Invalid EVM transaction hash".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|candidate| candidate.key == chain_key.as_str() && candidate.kind == ChainKind::Evm)
        .ok_or_else(|| format!("Unsupported EVM chain: {chain_key}"))?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .map_err(|error| format!("Failed to create EVM RPC client: {error}"))?;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(8);
    let mut last_error: Option<serde_json::Value> = None;

    loop {
        if tokio::time::Instant::now() >= deadline {
            break;
        }
        for rpc in chain.rpcs {
            verify_authenticated_network_access(&session_token)?;
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            let request = client
                .post(*rpc)
                .header("Content-Type", "application/json")
                .header("User-Agent", "Plurivex/1.0")
                .json(&serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_getTransactionReceipt",
                    "params": [transaction_hash],
                }))
                .send();
            let Ok(Ok(response)) = tokio::time::timeout(remaining, send_http_request_with_gate(request, &session_token)).await else {
                continue;
            };
            if !response.status().is_success() {
                continue;
            }
            let body_budget = deadline.saturating_duration_since(tokio::time::Instant::now());
            if body_budget.is_zero() {
                break;
            }
            let Ok(Ok(body)) = tokio::time::timeout(
                body_budget,
                read_http_text_limited(response, 256_000, &session_token),
            )
            .await
            else {
                continue;
            };
            verify_authenticated_network_access(&session_token)?;
            let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) else {
                continue;
            };
            if let Some(error) = data.get("error") {
                last_error = Some(error.clone());
                continue;
            }
            let Some(receipt) = data.get("result").filter(|value| !value.is_null()) else {
                continue;
            };
            if receipt
                .get("transactionHash")
                .and_then(serde_json::Value::as_str)
                .map(|hash| hash.eq_ignore_ascii_case(&transaction_hash))
                != Some(true)
            {
                last_error = Some(serde_json::json!({"message": "RPC receipt hash did not match the requested transaction"}));
                continue;
            }
            let block_number = receipt
                .get("blockNumber")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            let status = receipt
                .get("status")
                .and_then(serde_json::Value::as_str)
                .and_then(|value| value.strip_prefix("0x"))
                .and_then(|value| u64::from_str_radix(value, 16).ok());
            match status {
                Some(1) => {
                    return Ok(EvmTransactionConfirmation {
                        transaction_hash,
                        status: "confirmed".to_string(),
                        block_number,
                        error: None,
                    });
                }
                Some(0) => {
                    return Ok(EvmTransactionConfirmation {
                        transaction_hash,
                        status: "failed".to_string(),
                        block_number,
                        error: Some(serde_json::json!({"message": "EVM transaction reverted", "status": "0x0"})),
                    });
                }
                _ => {
                    last_error = Some(serde_json::json!({"message": "RPC receipt omitted a valid EVM status"}));
                }
            }
        }
        if tokio::time::Instant::now() < deadline {
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        }
    }

    Ok(EvmTransactionConfirmation {
        transaction_hash,
        status: "pending".to_string(),
        block_number: None,
        error: last_error,
    })
}

#[tauri::command]
pub async fn get_solana_recent_blockhash(session_token: String) -> Result<String, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Safe Mode is active: app-command network requests are disabled.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    let network_gate = authenticated_network_gate(&session_token);
    crate::adapters::solana::client::get_solana_recent_blockhash_with_gate(
        chain.rpcs,
        network_gate.as_ref(),
    )
    .await
}

#[tauri::command]
pub async fn broadcast_solana_tx(
    session_token: String,
    raw_tx_base64: String,
) -> Result<String, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Safe Mode is active: app-command network requests are disabled.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    let network_gate = authenticated_network_gate(&session_token);
    crate::adapters::solana::client::broadcast_solana_tx_with_gate(
        chain.rpcs,
        &raw_tx_base64,
        network_gate.as_ref(),
    )
    .await
}

#[tauri::command]
pub async fn get_solana_account_details(
    session_token: String,
    address: String,
) -> Result<SolanaAccountDetails, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Safe Mode is active: app-command network requests are disabled.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    let network_gate = authenticated_network_gate(&session_token);
    crate::adapters::solana::client::get_solana_account_details_with_gate(
        chain.rpcs,
        &address,
        network_gate.as_ref(),
    )
    .await
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaMintInfo {
    pub decimals: u8,
    pub token_program_id: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialTokenMetadata {
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub description: Option<String>,
    pub ipfs_logo: Option<String>,
}

fn decode_evm_abi_string(result: &str) -> Option<String> {
    let bytes = hex::decode(result.strip_prefix("0x")?).ok()?;
    if bytes.len() < 64 {
        return None;
    }
    let offset_word = &bytes[..32];
    if offset_word[..24].iter().any(|byte| *byte != 0) {
        return None;
    }
    let offset = usize::try_from(u64::from_be_bytes(offset_word[24..32].try_into().ok()?)).ok()?;
    let length_end = offset.checked_add(32)?;
    let length_word = bytes.get(offset..length_end)?;
    if length_word[..24].iter().any(|byte| *byte != 0) {
        return None;
    }
    let value_len = usize::try_from(u64::from_be_bytes(length_word[24..32].try_into().ok()?)).ok()?;
    if value_len == 0 || value_len > 2048 {
        return None;
    }
    let value_end = length_end.checked_add(value_len)?;
    let value = std::str::from_utf8(bytes.get(length_end..value_end)?).ok()?;
    let value = value.trim_matches('\0').trim();
    (!value.is_empty()).then(|| value.to_string())
}

#[tauri::command]
pub async fn get_official_token_metadata(
    session_token: String,
) -> Result<OfficialTokenMetadata, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;
    let chain = CHAINS
        .iter()
        .find(|candidate| candidate.key == "robinhood" && candidate.kind == ChainKind::Evm)
        .ok_or_else(|| "Robinhood EVM chain is not configured".to_string())?;
    const CONTRACT: &str = "0xf890d3fe2be22c6259bbe9f607692c7168556c93";
    const CALLS: [(&str, &str); 4] = [
        ("name", "0x06fdde03"),
        ("symbol", "0x95d89b41"),
        ("description", "0x7284e416"),
        ("ipfs_logo", "0xfb7f21eb"),
    ];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|error| format!("Failed to create metadata RPC client: {error}"))?;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(8);
    let mut metadata = OfficialTokenMetadata {
        name: None,
        symbol: None,
        description: None,
        ipfs_logo: None,
    };

    for (field, selector) in CALLS {
        let mut decoded = None;
        for rpc in chain.rpcs {
            verify_air_gap_inactive()?;
            crate::db::commands::verify_session_authenticated(&session_token)?;
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            let request = client
                .post(*rpc)
                .header("Content-Type", "application/json")
                .header("User-Agent", "Plurivex/1.0")
                .json(&serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_call",
                    "params": [{"to": CONTRACT, "data": selector}, "latest"],
                }))
                .send();
            let budget = remaining.min(std::time::Duration::from_secs(1));
            let Ok(Ok(response)) = tokio::time::timeout(budget, send_http_request_with_gate(request, &session_token)).await else {
                continue;
            };
            if !response.status().is_success() {
                continue;
            }
            let body_budget = deadline
                .saturating_duration_since(tokio::time::Instant::now())
                .min(std::time::Duration::from_secs(1));
            if body_budget.is_zero() {
                break;
            }
            let Ok(Ok(body)) = tokio::time::timeout(
                body_budget,
                read_http_text_limited(response, 64_000, &session_token),
            )
            .await
            else {
                continue;
            };
            verify_authenticated_network_access(&session_token)?;
            let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) else {
                continue;
            };
            if data.get("error").is_some() {
                continue;
            }
            if let Some(value) = data
                .get("result")
                .and_then(serde_json::Value::as_str)
                .and_then(decode_evm_abi_string)
            {
                decoded = Some(value);
                break;
            }
        }
        match field {
            "name" => metadata.name = decoded,
            "symbol" => metadata.symbol = decoded,
            "description" => metadata.description = decoded,
            "ipfs_logo" => metadata.ipfs_logo = decoded,
            _ => unreachable!("metadata field is fixed above"),
        }
    }

    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;
    Ok(metadata)
}

#[tauri::command]
pub async fn get_solana_mint_info(
    session_token: String,
    mint: String,
) -> Result<SolanaMintInfo, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;
    let mint = mint.trim().to_string();
    if mint.len() > 44 {
        return Err("Invalid Solana mint address".to_string());
    }
    crate::core::wallets::solana_signing::parse_pubkey_32_bytes(&mint)?;

    let chain = CHAINS
        .iter()
        .find(|c| c.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("Failed to create Solana RPC client: {e}"))?;
    let mut last_error = "Failed to query Solana mint metadata".to_string();

    for rpc in chain.rpcs {
        verify_authenticated_network_access(&session_token)?;
        let request = client
            .post(*rpc)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAccountInfo",
                "params": [&mint, {"encoding": "jsonParsed", "commitment": "confirmed"}]
            }))
            .send();
        let response = match tokio::time::timeout(std::time::Duration::from_secs(3), send_http_request_with_gate(request, &session_token)).await {
            Ok(Ok(response)) => response,
            _ => {
                last_error = "RPC request could not be reached or timed out".to_string();
                continue;
            }
        };
        verify_authenticated_network_access(&session_token)?;
        if !response.status().is_success() {
            last_error = format!("RPC returned HTTP {}", response.status());
            continue;
        }
        let body = match tokio::time::timeout(
            std::time::Duration::from_secs(3),
            read_http_text_limited(response, 256_000, &session_token),
        ).await {
            Ok(Ok(body)) => body,
            _ => {
                last_error = "RPC returned invalid or oversized JSON".to_string();
                continue;
            }
        };
        verify_authenticated_network_access(&session_token)?;
        let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) else {
            last_error = "RPC returned invalid JSON".to_string();
            continue;
        };
        if let Some(error) = data.get("error") {
            last_error = format!("Solana RPC error: {error}");
            continue;
        }
        let Some(account) = data.pointer("/result/value").filter(|value| !value.is_null()) else {
            last_error = "Mint account does not exist".to_string();
            continue;
        };
        let Some(owner) = account.get("owner").and_then(serde_json::Value::as_str) else {
            last_error = "Mint account has no token-program owner".to_string();
            continue;
        };
        if owner != crate::core::wallets::solana_signing::TOKEN_PROGRAM_ID_STR
            && owner != crate::core::wallets::solana_signing::TOKEN_2022_PROGRAM_ID_STR
        {
            return Err("Address is not owned by the SPL Token or Token-2022 program".to_string());
        }
        let parsed_type = account.pointer("/data/parsed/type").and_then(serde_json::Value::as_str);
        if parsed_type != Some("mint") {
            return Err("Solana account is not a parsed token mint".to_string());
        }
        let decimals = account
            .pointer("/data/parsed/info/decimals")
            .and_then(serde_json::Value::as_u64)
            .and_then(|value| u8::try_from(value).ok())
            .ok_or_else(|| "Token mint returned invalid decimals".to_string())?;
        verify_authenticated_network_access(&session_token)?;
        return Ok(SolanaMintInfo {
            decimals,
            token_program_id: owner.to_string(),
        });
    }

    Err(last_error)
}

#[tauri::command]
pub async fn get_solana_address_lookup_table(
    session_token: String,
    address: String,
) -> Result<String, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;
    let address = address.trim().to_string();
    if address.len() > 44 {
        return Err("Invalid address lookup table key".to_string());
    }
    crate::core::wallets::solana_signing::parse_pubkey_32_bytes(&address)?;

    const ADDRESS_LOOKUP_TABLE_PROGRAM_ID: &str = "AddressLookupTab1e1111111111111111111111111";
    let chain = CHAINS
        .iter()
        .find(|c| c.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("Failed to create Solana RPC client: {e}"))?;
    let mut last_error = "Failed to load Solana address lookup table".to_string();

    for rpc in chain.rpcs {
        verify_authenticated_network_access(&session_token)?;
        let request = client
            .post(*rpc)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAccountInfo",
                "params": [&address, {"encoding": "base64", "commitment": "confirmed"}]
            }))
            .send();
        let response = match tokio::time::timeout(std::time::Duration::from_secs(3), send_http_request_with_gate(request, &session_token)).await {
            Ok(Ok(response)) => response,
            _ => {
                last_error = "RPC request could not be reached or timed out".to_string();
                continue;
            }
        };
        verify_authenticated_network_access(&session_token)?;
        if !response.status().is_success() {
            last_error = format!("RPC returned HTTP {}", response.status());
            continue;
        }
        let body = match tokio::time::timeout(
            std::time::Duration::from_secs(3),
            read_http_text_limited(response, 256_000, &session_token),
        ).await {
            Ok(Ok(body)) => body,
            _ => {
                last_error = "RPC returned invalid or oversized JSON".to_string();
                continue;
            }
        };
        verify_authenticated_network_access(&session_token)?;
        let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) else {
            last_error = "RPC returned invalid JSON".to_string();
            continue;
        };
        if let Some(error) = data.get("error") {
            last_error = format!("Solana RPC error: {error}");
            continue;
        }
        let Some(account) = data.pointer("/result/value").filter(|value| !value.is_null()) else {
            last_error = "Address lookup table account does not exist".to_string();
            continue;
        };
        if account.get("owner").and_then(serde_json::Value::as_str)
            != Some(ADDRESS_LOOKUP_TABLE_PROGRAM_ID)
        {
            return Err("Address is not owned by the Solana address lookup table program".to_string());
        }
        let encoded = account
            .pointer("/data/0")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "Address lookup table RPC response has no base64 account data".to_string())?;
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|e| format!("Invalid address lookup table account data: {e}"))?;
        if decoded.len() < 56
            || decoded.len() > 56 + 256 * 32
            || (decoded.len() - 56) % 32 != 0
        {
            return Err("Address lookup table account data has an invalid size".to_string());
        }
        verify_authenticated_network_access(&session_token)?;
        return Ok(encoded.to_string());
    }

    Err(last_error)
}

#[tauri::command]
pub async fn get_solana_transaction_history(
    session_token: String,
    address: String,
    before: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<SolanaTransactionSignature>, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;

    let address = address.trim().to_string();
    if address.len() > 44 {
        return Err("Invalid Solana address".to_string());
    }
    crate::core::wallets::solana_signing::parse_pubkey_32_bytes(&address)?;
    let before = before
        .map(|signature| signature.trim().to_string())
        .filter(|signature| !signature.is_empty());
    if let Some(signature) = &before {
        if signature.len() > 100 {
            return Err("Invalid Solana transaction signature cursor".to_string());
        }
        let decoded = bs58::decode(signature)
            .into_vec()
            .map_err(|_| "Invalid Solana transaction signature cursor".to_string())?;
        if decoded.len() != 64 {
            return Err("Invalid Solana transaction signature cursor".to_string());
        }
    }

    let chain = CHAINS
        .iter()
        .find(|chain| chain.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    let network_gate = authenticated_network_gate(&session_token);
    crate::adapters::solana::client::get_solana_transaction_history(
        chain.rpcs,
        &address,
        before.as_deref(),
        limit.unwrap_or(20).clamp(1, 100),
        network_gate.as_ref(),
    )
    .await
}

#[tauri::command]
pub async fn scan_directory_native(path: String) -> Result<NativeScanResult, String> {
    core_scan_dir(path).await
}

#[tauri::command]
pub fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn schedule_clipboard_clear(timeout_secs: u64) -> Result<(), String> {
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(timeout_secs)).await;
        #[cfg(target_os = "windows")]
        {
            use std::ffi::c_void;
            #[link(name = "user32")]
            extern "system" {
                fn OpenClipboard(hWndNewOwner: *mut c_void) -> i32;
                fn EmptyClipboard() -> i32;
                fn CloseClipboard() -> i32;
            }
            // Retry up to 10 times with 100ms interval in case clipboard is momentarily locked
            for _ in 0..10 {
                unsafe {
                    if OpenClipboard(std::ptr::null_mut()) != 0 {
                        EmptyClipboard();
                        CloseClipboard();
                        break;
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
        }
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("pbcopy")
                .stdin(std::process::Stdio::null())
                .status();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("wl-copy")
                .arg("--clear")
                .status();
            let _ = std::process::Command::new("xclip")
                .args(["-selection", "clipboard", "/dev/null"])
                .status();
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn vault_create_token(password: String) -> Result<String, String> {
    crate::core::security::crypto::create_verification_token(&password)
}

#[tauri::command]
pub async fn vault_verify_token(token: String, password: String) -> Result<bool, String> {
    Ok(crate::core::security::crypto::verify_password(
        &token, &password,
    ))
}

#[tauri::command]
pub async fn vault_derive_credentials(
    secret: String,
    wallet_type: String,
) -> Result<crate::core::wallets::derivation::DualCredentials, String> {
    crate::core::wallets::derivation::derive_dual_credentials_native(&secret, &wallet_type)
}

#[tauri::command]
pub async fn vault_derive_credentials_batch(
    secrets: Vec<String>,
    wallet_type: String,
) -> Result<Vec<Option<crate::core::wallets::derivation::DualCredentials>>, String> {
    Ok(
        crate::core::wallets::derivation::derive_dual_credentials_batch_native(
            &secrets,
            &wallet_type,
        ),
    )
}

#[tauri::command]
pub async fn vault_derive_public_only(
    secret: String,
    wallet_type: String,
) -> Result<crate::core::wallets::derivation::PublicAddressesOnly, String> {
    crate::core::wallets::derivation::derive_public_addresses_native(&secret, &wallet_type)
}

#[tauri::command]
pub async fn vault_derive_public_only_batch(
    secrets: Vec<String>,
    wallet_type: String,
) -> Result<Vec<Option<crate::core::wallets::derivation::PublicAddressesOnly>>, String> {
    Ok(
        crate::core::wallets::derivation::derive_public_addresses_batch_native(
            &secrets,
            &wallet_type,
        ),
    )
}


#[tauri::command]
pub async fn vault_validate_mnemonic(phrase: String) -> Result<bool, String> {
    Ok(crate::core::wallets::derivation::is_valid_mnemonic_phrase(
        &phrase,
    ))
}

#[tauri::command]
pub async fn vault_repair_mnemonic(
    phrase: String,
    target_address: Option<String>,
    missing_position: Option<usize>,
) -> Result<crate::core::wallets::repair::MnemonicRepairResult, String> {
    Ok(crate::core::wallets::repair::analyze_and_repair_mnemonic(
        &phrase,
        target_address.as_deref(),
        missing_position,
    ))
}

#[tauri::command]
pub async fn vault_extract_credentials(text: String) -> Result<Vec<String>, String> {
    Ok(crate::core::wallets::extractor::extract_credentials_native(
        &text,
    ))
}

#[tauri::command]
pub async fn start_recovery_session(
    phrase: String,
    target_address: Option<String>,
) -> Result<crate::core::wallets::recovery_session::RecoverySessionStatusResponse, String> {
    crate::core::wallets::recovery_session::start_in_memory_session(
        phrase,
        target_address,
    )
}

#[tauri::command]
pub async fn pause_recovery_session(session_id: String) -> Result<bool, String> {
    crate::core::wallets::recovery_session::request_pause_session(&session_id)
}

#[tauri::command]
pub async fn resume_recovery_session(session_id: String) -> Result<bool, String> {
    crate::core::wallets::recovery_session::request_resume_session(&session_id)
}

#[tauri::command]
pub async fn cancel_recovery_session(session_id: String) -> Result<bool, String> {
    crate::core::wallets::recovery_session::request_cancel_session(&session_id)
}

#[tauri::command]
pub async fn clear_recovery_session(session_id: Option<String>) -> Result<bool, String> {
    crate::core::wallets::recovery_session::clear_recovery_session(
        session_id.as_deref().unwrap_or(""),
    )
}

#[tauri::command]
pub async fn get_recovery_session_status(
    session_id: String,
) -> Result<crate::core::wallets::recovery_session::RecoverySessionStatusResponse, String> {
    crate::core::wallets::recovery_session::get_live_session_status(&session_id)
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OnTheFlyBalanceResult {
    pub phrase: String,
    pub btc_address: Option<String>,
    pub btc_balance: Option<String>,
    pub evm_address: Option<String>,
    pub evm_balances: std::collections::HashMap<String, String>,
    pub sol_address: Option<String>,
    pub sol_balance: Option<String>,
    pub has_funds: bool,
    pub total_usd_estimate: f64,
}

#[tauri::command]
pub async fn get_token_prices(
    session_token: String,
    ids: Option<Vec<String>>,
) -> Result<crate::core::scanner::pricing::PriceReport, String> {
    verify_authenticated_network_access(&session_token)?;
    let network_gate = authenticated_network_gate(&session_token);
    let report = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        crate::adapters::pricing::coingecko::get_cached_or_fetch_prices_with_gate(
            ids,
            network_gate.as_ref(),
        ),
    )
    .await
    .map_err(|_| "Token price request timed out".to_string())??;
    verify_authenticated_network_access(&session_token)?;
    Ok(report)
}

#[tauri::command]
pub async fn scan_phrase_on_the_fly(
    session_token: String,
    phrase: String,
) -> Result<OnTheFlyBalanceResult, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;

    let creds = crate::core::wallets::derivation::derive_public_addresses_only_native(&phrase)?;
    let client = crate::adapters::evm::client::shared_client();
    let network_gate = authenticated_network_gate(&session_token);

    // Fetch dynamic live/cached prices with fallback
    let price_report = crate::adapters::pricing::coingecko::get_cached_or_fetch_prices_with_gate(
        None,
        network_gate.as_ref(),
    )
        .await
        .unwrap_or_else(|_| crate::core::scanner::pricing::PriceReport::baseline_fallback());
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;
    let btc_price = price_report.get_usd_price_or_baseline("btc");
    let eth_price = price_report.get_usd_price_or_baseline("eth");
    let bnb_price = price_report.get_usd_price_or_baseline("bnb");
    let sol_price = price_report.get_usd_price_or_baseline("sol");

    let mut has_funds = false;
    let mut total_usd = 0.0;

    // 1. Scan Bitcoin if address present
    let mut btc_balance_str: Option<String> = None;
    if let Some(ref btc_addr) = creds.btc_address {
        network_gate.as_ref()()?;
        let btc_rpcs = &["https://mempool.space/api", "https://blockstream.info/api"];
        if let Ok(res) =
            crate::core::scanner::bitcoin::scan_bitcoin_for_wallet_with_gate(
                &client, btc_addr, btc_rpcs, 0, &network_gate,
            )
                .await
        {
            if res.has_funds {
                has_funds = true;
                let parsed_btc =
                    crate::core::scanner::bitcoin::parse_btc_display_amount(&res.native_balance);
                total_usd += (parsed_btc * btc_price).max(0.01);
            }
            btc_balance_str = Some(res.native_balance);
        }
    }

    // 2. Scan EVM across top chains (eth, bsc, base, arb)
    let mut evm_map = std::collections::HashMap::new();
    if let Some(ref evm_addr) = creds.evm_address {
        for chain in CHAINS.iter().filter(|c| c.kind == ChainKind::Evm) {
            for rpc in chain.rpcs.iter().take(2) {
                crate::db::commands::verify_session_authenticated(&session_token)?;
                verify_air_gap_inactive()?;
                if let Ok(hex_bal) =
                    crate::adapters::evm::client::rpc_get_balance_with_gate(
                        evm_addr,
                        rpc,
                        network_gate.as_ref(),
                    )
                    .await
                {
                    let (amt, display) = crate::adapters::evm::client::format_balance_display(
                        &hex_bal,
                        chain.symbol,
                    );
                    if amt > 0.0 {
                        has_funds = true;
                        let price = match chain.symbol {
                            "ETH" => eth_price,
                            "BNB" => bnb_price,
                            _ => 1.0,
                        };
                        total_usd += amt * price;
                    }
                    evm_map.insert(chain.key.to_string(), display);
                    break;
                }
            }
        }
    }

    // 3. Scan Solana
    let mut sol_balance_str: Option<String> = None;
    if let Some(ref sol_addr) = creds.sol_address {
        let sol_chain = CHAINS.iter().find(|c| c.key == "sol");
        if let Some(chain) = sol_chain {
            for rpc in chain.rpcs.iter().take(2) {
                crate::db::commands::verify_session_authenticated(&session_token)?;
                verify_air_gap_inactive()?;
                if let Ok(lamports_str) =
                    crate::adapters::solana::client::rpc_get_sol_balance_with_gate(
                        sol_addr,
                        rpc,
                        network_gate.as_ref(),
                    )
                    .await
                {
                    let lamports: u64 = lamports_str.parse().unwrap_or(0);
                    let (amt, display) =
                        crate::adapters::solana::client::format_sol_display(lamports);
                    if amt > 0.0 {
                        has_funds = true;
                        total_usd += amt * sol_price;
                    }
                    sol_balance_str = Some(display);
                    break;
                }
            }
        }
    }

    verify_authenticated_network_access(&session_token)?;
    Ok(OnTheFlyBalanceResult {
        phrase,
        btc_address: creds.btc_address,
        btc_balance: btc_balance_str,
        evm_address: creds.evm_address,
        evm_balances: evm_map,
        sol_address: creds.sol_address,
        sol_balance: sol_balance_str,
        has_funds,
        total_usd_estimate: (total_usd * 100.0).round() / 100.0,
    })
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvmTransferPayload {
    pub chain_id: u64,
    pub to_address: String,
    pub value_wei_hex: String,
    pub gas_price_wei_hex: String,
    pub gas_limit: u64,
    pub nonce: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvmSignResult {
    pub raw_tx: String,
    pub from_address: String,
}

fn deserialize_u64_from_number_or_str<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct U64Visitor;
    impl<'de> serde::de::Visitor<'de> for U64Visitor {
        type Value = u64;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a u64 integer or string representing u64")
        }

        fn visit_u64<E>(self, v: u64) -> Result<u64, E>
        where
            E: serde::de::Error,
        {
            Ok(v)
        }

        fn visit_i64<E>(self, v: i64) -> Result<u64, E>
        where
            E: serde::de::Error,
        {
            if v >= 0 {
                Ok(v as u64)
            } else {
                Err(serde::de::Error::custom("lamports cannot be negative"))
            }
        }

        fn visit_f64<E>(self, v: f64) -> Result<u64, E>
        where
            E: serde::de::Error,
        {
            if v.fract() != 0.0 {
                return Err(serde::de::Error::custom("lamports cannot be a fractional float"));
            }
            if (0.0..18446744073709551616.0).contains(&v) {
                Ok(v as u64)
            } else {
                Err(serde::de::Error::custom("out of range for u64"))
            }
        }

        fn visit_str<E>(self, v: &str) -> Result<u64, E>
        where
            E: serde::de::Error,
        {
            v.trim()
                .parse::<u64>()
                .map_err(|e| serde::de::Error::custom(format!("invalid lamports u64 string: {e}")))
        }
    }

    deserializer.deserialize_any(U64Visitor)
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaTransferPayload {
    pub recipient: String,
    #[serde(deserialize_with = "deserialize_u64_from_number_or_str")]
    pub lamports: u64,
    pub recent_blockhash: String,
    pub is_nonce_account: bool,
    pub fee_payer_wallet_id: Option<i64>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaTokenSweepPayload {
    pub recipient: String,
    pub mint: String,
    #[serde(deserialize_with = "deserialize_u64_from_number_or_str")]
    pub amount_raw: u64,
    pub decimals: Option<u8>,
    pub token_program: Option<String>,
    pub recent_blockhash: String,
    pub fee_payer_wallet_id: Option<i64>,
}

fn get_wallet_secret_and_type(
    app: &tauri::AppHandle,
    wallet_id: i64,
) -> Result<(String, String), String> {
    let path = crate::core::vault::repository::get_db_path(app)?;
    if !path.exists() {
        return Err(format!("Vault database not found at {}", path.display()));
    }
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));
    conn.query_row(
        "SELECT encrypted_secret, type FROM wallets WHERE id = ?1",
        rusqlite::params![wallet_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|e| format!("Wallet ID {} not found in vault database: {}", wallet_id, e))
}

#[tauri::command]
pub async fn vault_session_unlock(
    app: tauri::AppHandle,
    password: String,
    timeout_seconds: Option<u64>,
) -> Result<String, String> {
    let mut password = zeroize::Zeroizing::new(password);

    // Verify against database verification token if DB exists
    let path = crate::core::vault::repository::get_db_path(&app)?;
    if path.exists() {
        let conn = rusqlite::Connection::open(&path)
            .map_err(|e| format!("Failed to open vault database: {}", e))?;
        let _ = conn.busy_timeout(std::time::Duration::from_millis(3000));
        let token_res: Result<String, rusqlite::Error> = conn.query_row(
            "SELECT value FROM meta WHERE key = 'verification'",
            [],
            |row| row.get(0),
        );
        match token_res {
            Ok(token) => {
                if !crate::core::security::crypto::verify_password(&token, &password) {
                    return Err("Invalid master password. Verification failed.".to_string());
                }
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // Uninitialized vault without master password
            }
            Err(e) => {
                return Err(format!("Failed to query vault verification status: {}", e));
            }
        }
    }

    let session_token = crate::core::security::session::get_session_manager()
        .unlock(password.as_str().to_string(), timeout_seconds);
    crate::core::security::memory::secure_zero_string(&mut password);

    // Automatically migrate legacy unkeyed fingerprints to keyed HMAC in background
    let app_handle = app.clone();
    let migration_token = session_token.clone();
    if let Ok(fp_key) = crate::core::security::session::get_session_manager().get_fingerprint_key(&session_token) {
        if let Ok(master_key) = crate::core::security::session::get_session_manager().get_master_key(&session_token) {
            std::thread::spawn(move || {
                if let Ok(mut conn) = crate::db::commands::get_connection(&app_handle) {
                    let _ = crate::db::commands::db_migrate_legacy_fingerprints(
                        &mut conn,
                        &master_key,
                        &fp_key[..],
                        Some(&migration_token),
                    );
                }
            });
        }
    }

    Ok(session_token)
}

#[tauri::command]
pub async fn vault_session_unlock_with_pin(
    app: tauri::AppHandle,
    pin: String,
    timeout_seconds: Option<u64>,
) -> Result<String, String> {
    let mut pin = zeroize::Zeroizing::new(pin);
    let path = crate::core::vault::repository::get_db_path(&app)?;
    if !path.exists() {
        return Err("Vault database not found".into());
    }

    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    let _ = conn.busy_timeout(std::time::Duration::from_millis(3000));

    let pin_token: String = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'pin_verification'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "No Quick PIN configured on this vault".to_string())?;

    let pin_vault: String = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'pin_vault'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "Quick PIN vault record not found".to_string())?;

    if !crate::core::security::crypto::verify_password(&pin_token, &pin) {
        crate::core::security::memory::secure_zero_string(&mut pin);
        return Err("Invalid Quick PIN. Verification failed.".into());
    }

    let mut master_key = crate::core::security::crypto::decrypt_vault_zeroizing(&pin_vault, &pin)
        .map_err(|e| format!("Failed to decrypt master vault with PIN: {}", e))?;
    crate::core::security::memory::secure_zero_string(&mut pin);

    let session_token = crate::core::security::session::get_session_manager()
        .unlock(master_key.as_str().to_string(), timeout_seconds);
    crate::core::security::memory::secure_zero_string(&mut master_key);

    // Automatically migrate legacy unkeyed fingerprints to keyed HMAC in background
    let app_handle = app.clone();
    let migration_token = session_token.clone();
    if let Ok(fp_key) = crate::core::security::session::get_session_manager().get_fingerprint_key(&session_token) {
        if let Ok(master_key) = crate::core::security::session::get_session_manager().get_master_key(&session_token) {
            std::thread::spawn(move || {
                if let Ok(mut conn) = crate::db::commands::get_connection(&app_handle) {
                    let _ = crate::db::commands::db_migrate_legacy_fingerprints(
                        &mut conn,
                        &master_key,
                        &fp_key[..],
                        Some(&migration_token),
                    );
                }
            });
        }
    }

    Ok(session_token)
}

#[tauri::command]
pub async fn vault_setup_pin_scoped(
    app: tauri::AppHandle,
    session_token: String,
    pin: String,
) -> Result<(), String> {
    let mut pin = zeroize::Zeroizing::new(pin);
    if pin.trim().len() < 4 {
        return Err("PIN must be at least 4 characters long".into());
    }

    let mut master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;

    let path = crate::core::vault::repository::get_db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    let _ = conn.busy_timeout(std::time::Duration::from_millis(3000));

    let pin_token = crate::core::security::crypto::create_verification_token(&pin)?;
    let encrypted_master = crate::core::security::crypto::encrypt_vault(&master_key, &pin)?;

    crate::core::security::memory::secure_zero_string(&mut pin);
    crate::core::security::memory::secure_zero_string(&mut master_key);

    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('pin_verification', ?1)",
        rusqlite::params![pin_token],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('pin_vault', ?1)",
        rusqlite::params![encrypted_master],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn vault_session_lock() -> Result<(), String> {
    crate::core::security::session::get_session_manager().lock();
    Ok(())
}

#[tauri::command]
pub fn vault_session_status(session_token: String) -> Result<bool, String> {
    Ok(crate::core::security::session::get_session_manager().is_authenticated(&session_token))
}

#[tauri::command]
pub async fn vault_reveal_secret_scoped(
    app: tauri::AppHandle,
    wallet_id: i64,
    session_token: String,
) -> Result<String, String> {
    let mut master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;
    let (encrypted_secret, _) = get_wallet_secret_and_type(&app, wallet_id)?;
    let secret = crate::core::security::crypto::decrypt_vault(&encrypted_secret, &master_key);
    crate::core::security::memory::secure_zero_string(&mut master_key);
    secret
}

#[tauri::command]
pub async fn vault_encrypt_with_session(
    session_token: String,
    plaintext: String,
) -> Result<String, String> {
    let mut master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;
    let res = crate::core::security::crypto::encrypt_vault(&plaintext, &master_key);
    crate::core::security::memory::secure_zero_string(&mut master_key);
    res
}

#[tauri::command]
pub async fn vault_encrypt_batch_with_session(
    session_token: String,
    plaintexts: Vec<String>,
) -> Result<Vec<String>, String> {
    let mut master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;
    let res = crate::core::security::crypto::encrypt_vault_batch(&plaintexts, &master_key);
    crate::core::security::memory::secure_zero_string(&mut master_key);
    res
}

#[tauri::command]
pub async fn vault_calculate_fingerprint(
    session_token: String,
    data: String,
) -> Result<String, String> {
    let fp_key = crate::core::security::session::get_session_manager()
        .get_fingerprint_key(&session_token)?;
    Ok(crate::core::wallets::fingerprint::calculate_keyed_fingerprint(&data, &fp_key[..]))
}

#[tauri::command]
pub async fn vault_calculate_fingerprints_batch(
    session_token: String,
    items: Vec<String>,
) -> Result<Vec<String>, String> {
    let fp_key = crate::core::security::session::get_session_manager()
        .get_fingerprint_key(&session_token)?;
    let results = items
        .iter()
        .map(|item| crate::core::wallets::fingerprint::calculate_keyed_fingerprint(item, &fp_key[..]))
        .collect();
    Ok(results)
}

#[tauri::command]
pub async fn sign_evm_transfer_scoped(
    app: tauri::AppHandle,
    wallet_id: i64,
    session_token: String,
    chain_key: String,
    tx: EvmTransferPayload,
) -> Result<EvmSignResult, String> {
    let chain = CHAINS
        .iter()
        .find(|chain| chain.key == chain_key && chain.kind == ChainKind::Evm)
        .ok_or_else(|| format!("Unsupported EVM chain: {chain_key}"))?;
    let expected_chain_id = evm_chain_id(chain.key)
        .ok_or_else(|| format!("Unsupported EVM chain: {chain_key}"))?;
    if tx.chain_id != expected_chain_id {
        return Err(format!(
            "Transaction chain ID {} does not match {chain_key} chain ID {expected_chain_id}",
            tx.chain_id
        ));
    }

    let mut master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;
    let (encrypted_secret, wallet_type) = get_wallet_secret_and_type(&app, wallet_id)?;
    let secret = crate::core::security::crypto::decrypt_vault_zeroizing(&encrypted_secret, &master_key)?;
    crate::core::security::memory::secure_zero_string(&mut master_key);

    let from_address = crate::core::wallets::signing::derive_evm_address_from_secret(&secret, &wallet_type)?;
    let params = crate::core::wallets::signing::EvmTransferParams {
        chain_id: tx.chain_id,
        to_address: &tx.to_address,
        value_wei_hex: &tx.value_wei_hex,
        gas_price_wei_hex: &tx.gas_price_wei_hex,
        gas_limit: tx.gas_limit,
        nonce: tx.nonce,
    };
    let raw_tx = crate::core::wallets::signing::sign_evm_transfer_with_secret(
        &secret,
        &wallet_type,
        &params,
    )?;
    Ok(EvmSignResult {
        raw_tx,
        from_address,
    })
}

#[tauri::command]
pub async fn sign_solana_transfer_scoped(
    app: tauri::AppHandle,
    wallet_id: i64,
    session_token: String,
    tx: SolanaTransferPayload,
) -> Result<crate::core::wallets::solana_signing::SolanaSignResult, String> {
    let mut master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;
    let (encrypted_secret, wallet_type) = get_wallet_secret_and_type(&app, wallet_id)?;
    let source_secret = crate::core::security::crypto::decrypt_vault_zeroizing(&encrypted_secret, &master_key)?;

    let maybe_fee_payer = if let Some(fp_id) = tx.fee_payer_wallet_id {
        if fp_id != wallet_id {
            let (fp_enc, fp_type) = get_wallet_secret_and_type(&app, fp_id)?;
            let fp_sec = crate::core::security::crypto::decrypt_vault_zeroizing(&fp_enc, &master_key)?;
            Some((fp_sec, fp_type))
        } else {
            None
        }
    } else {
        None
    };

    crate::core::security::memory::secure_zero_string(&mut master_key);

    let params = crate::core::wallets::solana_signing::SolanaTransferParams {
        recipient: &tx.recipient,
        lamports: tx.lamports,
        recent_blockhash: &tx.recent_blockhash,
        is_nonce_account: tx.is_nonce_account,
    };

    let fp_ref = maybe_fee_payer.as_ref().map(|(s, t)| (s.as_str(), t.as_str()));
    crate::core::wallets::solana_signing::sign_solana_transfer_with_secrets(
        fp_ref,
        &source_secret,
        &wallet_type,
        &params,
    )
}

#[tauri::command]
pub async fn sign_solana_token_sweep_scoped(
    app: tauri::AppHandle,
    wallet_id: i64,
    session_token: String,
    tx: SolanaTokenSweepPayload,
) -> Result<crate::core::wallets::solana_signing::SolanaSignResult, String> {
    let mut master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;

    // Source wallet secret (authority of token account)
    let (encrypted_secret, wallet_type) = get_wallet_secret_and_type(&app, wallet_id)?;
    let source_secret = crate::core::security::crypto::decrypt_vault_zeroizing(&encrypted_secret, &master_key)?;

    // Fee payer secret (sponsors gas and ATA rent)
    let (fee_payer_secret, fee_payer_type) = if let Some(fp_id) = tx.fee_payer_wallet_id {
        if fp_id != wallet_id {
            let (fp_enc, fp_type) = get_wallet_secret_and_type(&app, fp_id)?;
            let fp_sec = crate::core::security::crypto::decrypt_vault_zeroizing(&fp_enc, &master_key)?;
            (fp_sec, fp_type)
        } else {
            (source_secret.clone(), wallet_type.clone())
        }
    } else {
        (source_secret.clone(), wallet_type.clone())
    };

    crate::core::security::memory::secure_zero_string(&mut master_key);

    let decimals = tx
        .decimals
        .ok_or_else(|| "Token decimals are missing; rescan the wallet or load mint metadata before sweeping".to_string())?;
    let token_prog = tx
        .token_program
        .as_deref()
        .ok_or_else(|| "Token program id is missing; load mint metadata before sweeping".to_string())?;
    if token_prog != crate::core::wallets::solana_signing::TOKEN_PROGRAM_ID_STR
        && token_prog != crate::core::wallets::solana_signing::TOKEN_2022_PROGRAM_ID_STR
    {
        return Err("Unsupported token program id for SPL token sweep".to_string());
    }

    let params = crate::core::wallets::solana_signing::SolanaTokenSweepParams {
        recipient: &tx.recipient,
        mint: &tx.mint,
        amount_raw: tx.amount_raw,
        decimals,
        token_program: Some(token_prog),
        recent_blockhash: &tx.recent_blockhash,
    };

    crate::core::wallets::solana_signing::sign_solana_token_sweep_with_secrets(
        &fee_payer_secret,
        &fee_payer_type,
        &source_secret,
        &wallet_type,
        &params,
    )
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaVersionedTxPayload {
    pub message_base64: String,
    pub fee_payer_wallet_id: Option<i64>,
}

#[tauri::command]
pub async fn sign_solana_versioned_tx_scoped(
    app: tauri::AppHandle,
    wallet_id: i64,
    session_token: String,
    tx: SolanaVersionedTxPayload,
) -> Result<crate::core::wallets::solana_signing::SolanaSignResult, String> {
    if tx.message_base64.len() > 1_644 {
        return Err("Solana transaction message is too large".to_string());
    }
    let message_bytes = base64::engine::general_purpose::STANDARD
        .decode(&tx.message_base64)
        .map_err(|e| format!("Invalid base64 message bytes: {}", e))?;
    if message_bytes.len() > 1_232 {
        return Err("Solana transaction message exceeds the packet-size limit".to_string());
    }

    let mut master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;

    // Source wallet secret (authority of token account / user signer)
    let (encrypted_secret, wallet_type) = get_wallet_secret_and_type(&app, wallet_id)?;
    let source_secret = crate::core::security::crypto::decrypt_vault_zeroizing(&encrypted_secret, &master_key)?;

    // Fee payer secret (sponsors gas / fee payer signer)
    let (fee_payer_secret, fee_payer_type) = if let Some(fp_id) = tx.fee_payer_wallet_id {
        if fp_id != wallet_id {
            let (fp_enc, fp_type) = get_wallet_secret_and_type(&app, fp_id)?;
            let fp_sec = crate::core::security::crypto::decrypt_vault_zeroizing(&fp_enc, &master_key)?;
            (fp_sec, fp_type)
        } else {
            (source_secret.clone(), wallet_type.clone())
        }
    } else {
        (source_secret.clone(), wallet_type.clone())
    };

    crate::core::security::memory::secure_zero_string(&mut master_key);

    crate::core::wallets::solana_signing::sign_solana_versioned_message_with_secrets(
        &fee_payer_secret,
        &fee_payer_type,
        &source_secret,
        &wallet_type,
        &message_bytes,
    )
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaTransactionConfirmation {
    pub signature: String,
    pub status: String,
    pub error: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn confirm_solana_transaction(
    session_token: String,
    signature: String,
) -> Result<SolanaTransactionConfirmation, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;
    let signature = signature.trim().to_string();
    if signature.len() > 100
        || bs58::decode(&signature).into_vec().map(|bytes| bytes.len()).ok() != Some(64)
    {
        return Err("Invalid Solana transaction signature".to_string());
    }

    let chain = CHAINS
        .iter()
        .find(|c| c.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .map_err(|e| format!("Failed to create Solana RPC client: {e}"))?;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(8);
    let mut last_error: Option<serde_json::Value> = None;
    let mut saw_processed = false;

    loop {
        if tokio::time::Instant::now() >= deadline {
            break;
        }
        for rpc in chain.rpcs {
            verify_authenticated_network_access(&session_token)?;
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            let request = client
                .post(*rpc)
                .json(&serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSignatureStatuses",
                    "params": [[signature], {"searchTransactionHistory": true}]
                }))
                .send();
            let Ok(Ok(response)) = tokio::time::timeout(remaining, send_http_request_with_gate(request, &session_token)).await else {
                continue;
            };
            if !response.status().is_success() {
                continue;
            }
            let body_budget = deadline.saturating_duration_since(tokio::time::Instant::now());
            if body_budget.is_zero() {
                break;
            }
            let Ok(Ok(body)) = tokio::time::timeout(
                body_budget,
                read_http_text_limited(response, 256_000, &session_token),
            )
            .await
            else {
                continue;
            };
            verify_authenticated_network_access(&session_token)?;
            let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) else {
                continue;
            };
            let Some(status) = data.pointer("/result/value/0").filter(|value| !value.is_null()) else {
                continue;
            };
            if let Some(error) = status.get("err").filter(|value| !value.is_null()) {
                return Ok(SolanaTransactionConfirmation {
                    signature,
                    status: "failed".to_string(),
                    error: Some(error.clone()),
                });
            }
            let confirmation = status
                .get("confirmationStatus")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            if confirmation == "finalized" {
                return Ok(SolanaTransactionConfirmation {
                    signature,
                    status: "finalized".to_string(),
                    error: None,
                });
            }
            if confirmation == "confirmed" {
                return Ok(SolanaTransactionConfirmation {
                    signature,
                    status: "confirmed".to_string(),
                    error: None,
                });
            }
            if confirmation == "processed" || status.get("confirmations").is_some() {
                saw_processed = true;
            }
            if let Some(error) = data.get("error") {
                last_error = Some(error.clone());
            }
        }
        if tokio::time::Instant::now() < deadline {
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        }
    }

    Ok(SolanaTransactionConfirmation {
        signature,
        status: if saw_processed { "processed" } else { "pending" }.to_string(),
        error: last_error,
    })
}

#[tauri::command]
pub async fn jupiter_get_quote(
    session_token: String,
    input_mint: String,
    output_mint: String,
    amount_raw: String,
    slippage_bps: u32,
) -> Result<String, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;
    crate::core::wallets::solana_signing::parse_pubkey_32_bytes(&input_mint)?;
    crate::core::wallets::solana_signing::parse_pubkey_32_bytes(&output_mint)?;
    let amount = amount_raw
        .parse::<u64>()
        .map_err(|_| "Jupiter quote amount must be an unsigned integer".to_string())?;
    if amount == 0 {
        return Err("Jupiter quote amount must be greater than zero".to_string());
    }
    if slippage_bps > 10_000 {
        return Err("Slippage must not exceed 10000 basis points".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let endpoints = [
        "https://public.jupiterapi.com",
        "https://api.jup.ag/swap/v1",
    ];

    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(24);
    let mut last_err = String::from("Failed to connect to Jupiter quote API");

    for base in endpoints {
        verify_authenticated_network_access(&session_token)?;
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        let url = format!(
            "{}/quote?inputMint={}&outputMint={}&amount={}&slippageBps={}",
            base, input_mint, output_mint, amount_raw, slippage_bps
        );
        let request = client.get(&url).send();
        let response = match tokio::time::timeout(remaining, send_http_request_with_gate(request, &session_token)).await {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => {
                last_err = error.to_string();
                continue;
            }
            Err(_) => {
                last_err = "Jupiter quote request timed out".to_string();
                break;
            }
        };
        if !response.status().is_success() {
            last_err = format!("Jupiter quote API returned HTTP {}", response.status());
            continue;
        }
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            last_err = "Jupiter quote request timed out".to_string();
            break;
        }
        let body = match tokio::time::timeout(remaining, read_http_text_limited(response, 250_000, &session_token)).await {
            Ok(Ok(body)) => body,
            Ok(Err(error)) => {
                last_err = error;
                continue;
            }
            Err(_) => {
                last_err = "Jupiter quote response timed out".to_string();
                break;
            }
        };
        verify_authenticated_network_access(&session_token)?;
        return Ok(body);
    }

    Err(last_err)
}

#[tauri::command]
pub async fn jupiter_get_swap_instructions(
    session_token: String,
    payload_json: String,
) -> Result<String, String> {
    crate::db::commands::verify_session_authenticated(&session_token)?;
    verify_air_gap_inactive()?;
    if payload_json.len() > 1_000_000 {
        return Err("Jupiter swap-instructions payload is too large".to_string());
    }

    let mut payload_val: serde_json::Value = serde_json::from_str(&payload_json)
        .map_err(|e| format!("Invalid Jupiter swap-instructions payload: {e}"))?;
    let payload_obj = payload_val
        .as_object_mut()
        .ok_or_else(|| "Jupiter swap-instructions payload must be a JSON object".to_string())?;
    for key in ["userPublicKey", "payer"] {
        let value = payload_obj
            .get(key)
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| format!("Jupiter payload is missing {key}"))?;
        crate::core::wallets::solana_signing::parse_pubkey_32_bytes(value)?;
    }
    let quote = payload_obj
        .get_mut("quoteResponse")
        .and_then(serde_json::Value::as_object_mut)
        .ok_or_else(|| "Jupiter payload is missing quoteResponse".to_string())?;
    for key in ["inputMint", "outputMint"] {
        let value = quote
            .get(key)
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| format!("Jupiter quote is missing {key}"))?;
        crate::core::wallets::solana_signing::parse_pubkey_32_bytes(value)?;
    }
    quote.remove("platformFee");
    let sanitized_payload = payload_val.to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let endpoints = [
        "https://public.jupiterapi.com",
        "https://api.jup.ag/swap/v1",
    ];

    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
    let mut last_err = String::from("Failed to connect to Jupiter swap instructions API");

    for base in endpoints {
        verify_authenticated_network_access(&session_token)?;
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        let url = format!("{}/swap-instructions", base);
        let request = client
            .post(&url)
            .header("Content-Type", "application/json")
            .body(sanitized_payload.clone())
            .send();
        let response = match tokio::time::timeout(remaining, send_http_request_with_gate(request, &session_token)).await {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => {
                last_err = error.to_string();
                continue;
            }
            Err(_) => {
                last_err = "Jupiter swap-instructions request timed out".to_string();
                break;
            }
        };
        if !response.status().is_success() {
            last_err = format!("Jupiter swap-instructions API returned HTTP {}", response.status());
            continue;
        }
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            last_err = "Jupiter swap-instructions request timed out".to_string();
            break;
        }
        let body = match tokio::time::timeout(remaining, read_http_text_limited(response, 1_000_000, &session_token)).await {
            Ok(Ok(body)) => body,
            Ok(Err(error)) => {
                last_err = error;
                continue;
            }
            Err(_) => {
                last_err = "Jupiter swap-instructions response timed out".to_string();
                break;
            }
        };
        verify_authenticated_network_access(&session_token)?;
        return Ok(body);
    }

    Err(last_err)
}

#[tauri::command]
pub async fn derive_solana_ata(
    wallet_address: String,
    mint: String,
    token_program: Option<String>,
) -> Result<String, String> {
    let wallet_pubkey = crate::core::wallets::solana_signing::parse_pubkey_32_bytes(&wallet_address)?;
    let mint_pubkey = crate::core::wallets::solana_signing::parse_pubkey_32_bytes(&mint)?;
    let prog_str = token_program.as_deref().unwrap_or(crate::core::wallets::solana_signing::TOKEN_PROGRAM_ID_STR);
    let prog_pubkey = crate::core::wallets::solana_signing::parse_pubkey_32_bytes(prog_str)?;

    let ata = crate::core::wallets::solana_signing::derive_associated_token_account(
        &wallet_pubkey,
        &mint_pubkey,
        &prog_pubkey,
    )?;
    Ok(bs58::encode(&ata).into_string())
}

#[tauri::command]
pub async fn vault_backfill_addresses_scoped(
    app: tauri::AppHandle,
    session_token: String,
) -> Result<usize, String> {
    let mut master_key = crate::core::security::session::get_session_manager()
        .get_master_key(&session_token)?;

    let path = crate::core::vault::repository::get_db_path(&app)?;
    if !path.exists() {
        crate::core::security::memory::secure_zero_string(&mut master_key);
        return Ok(0);
    }

    let mut conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));
    let _ = conn.execute_batch(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;",
    );

    type WalletRow = (i64, String, String, Option<String>, Option<String>, Option<String>);

    let mut stmt = conn
        .prepare(
            "SELECT id, type, encrypted_secret, address, sol_address, btc_address \
             FROM wallets \
             WHERE (type = 'seed' AND (address IS NULL OR sol_address IS NULL OR btc_address IS NULL)) \
                OR (type = 'pk' AND address IS NULL) \
                OR (type = 'sol_pk' AND sol_address IS NULL) \
                OR (address IS NULL AND sol_address IS NULL)",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<WalletRow> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    drop(stmt);

    if rows.is_empty() {
        crate::core::security::memory::secure_zero_string(&mut master_key);
        return Ok(0);
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut updated_count = 0usize;

    for (id, wtype, encrypted_secret, cur_evm, cur_sol, cur_btc) in rows {
        if let Ok(secret) = crate::core::security::crypto::decrypt_vault_zeroizing(&encrypted_secret, &master_key) {
            if let Ok(derived) = crate::core::wallets::derivation::derive_public_addresses_native(&secret, &wtype) {
                let new_evm = derived.evm_address.or(cur_evm.clone());
                let new_sol = derived.sol_address.or(cur_sol.clone());
                let new_btc = derived.btc_address.or(cur_btc.clone());

                if new_evm != cur_evm || new_sol != cur_sol || new_btc != cur_btc {
                    let res = tx.execute(
                        "UPDATE wallets SET address = ?1, sol_address = ?2, btc_address = ?3 WHERE id = ?4",
                        rusqlite::params![new_evm, new_sol, new_btc, id],
                    );
                    if res.is_ok() {
                        updated_count += 1;
                    }
                }
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    crate::core::security::memory::secure_zero_string(&mut master_key);
    Ok(updated_count)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UpdateProgressPayload {
    pub chunk_length: usize,
    pub content_length: Option<u64>,
}

#[tauri::command]
pub async fn vault_updater_check(
    app: tauri::AppHandle,
    session_token: String,
) -> Result<Option<UpdateInfo>, String> {
    let network_gate = authenticated_network_gate(&session_token);
    network_gate()?;

    use tauri_plugin_updater::UpdaterExt;
    let updater = app
        .updater_builder()
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .map_err(|e| format!("Failed to set cache-control header: {e}"))?
        .header("Pragma", "no-cache")
        .map_err(|e| format!("Failed to set pragma header: {e}"))?
        .build()
        .map_err(|e| format!("Failed to initialize updater: {e}"))?;
    let update = crate::adapters::network::await_with_gate(
        async { updater.check().await.map_err(|error| format!("Failed to check for updates: {error}")) },
        network_gate.as_ref(),
    )
    .await?;

    Ok(update.map(|u| UpdateInfo {
        version: u.version,
        current_version: u.current_version,
        body: u.body,
        date: u.date.map(|d| d.to_string()),
    }))
}

#[tauri::command]
pub async fn vault_updater_download_and_install(
    app: tauri::AppHandle,
    session_token: String,
) -> Result<(), String> {
    let network_gate = authenticated_network_gate(&session_token);
    network_gate()?;

    use tauri::Emitter;
    use tauri_plugin_updater::UpdaterExt;

    let updater = app
        .updater_builder()
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .map_err(|e| format!("Failed to set cache-control header: {e}"))?
        .header("Pragma", "no-cache")
        .map_err(|e| format!("Failed to set pragma header: {e}"))?
        .build()
        .map_err(|e| format!("Failed to initialize updater: {e}"))?;
    let update = crate::adapters::network::await_with_gate(
        async { updater.check().await.map_err(|error| format!("Failed to check for updates: {error}")) },
        network_gate.as_ref(),
    )
    .await?
    .ok_or_else(|| "No update available to download and install.".to_string())?;

    let app_handle = app.clone();
    let download = update.download_and_install(
        move |chunk_length, content_length| {
            let _ = app_handle.emit(
                "updater-progress",
                UpdateProgressPayload {
                    chunk_length,
                    content_length,
                },
            );
        },
        || {},
    );
    crate::adapters::network::await_with_gate(
        async { download.await.map_err(|error| format!("Failed to download and install update: {error}")) },
        network_gate.as_ref(),
    )
    .await?;

    let _ = app.emit("updater-finished", ());

    #[allow(unreachable_code)]
    {
        app.restart();
        Ok(())
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RpcPingResponse {
    pub latency_ms: u64,
    pub status: String,
    pub block_height: Option<u64>,
}

fn is_disallowed_rpc_ip(address: std::net::IpAddr) -> bool {
    match address {
        std::net::IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            ip.is_private() || ip.is_loopback() || (a == 169 && b == 254) || ip.is_unspecified() ||
                ip.is_multicast() || a == 0 || a >= 224 ||
                (a == 100 && (64..=127).contains(&b)) ||
                (a == 192 && (b == 0 || b == 2 || b == 168)) ||
                (a == 198 && (b == 18 || b == 19 || b == 51)) ||
                (a == 192 && b == 88 && c == 99) ||
                (a == 203 && b == 0 && c == 113)
        }
        std::net::IpAddr::V6(ip) => {
            let segments = ip.segments();
            let is_teredo = segments[0] == 0x2001 && segments[1] == 0;
            let is_documentation = segments[0] == 0x2001 && segments[1] == 0x0db8;
            let is_6to4 = segments[0] == 0x2002;
            let is_orchid = segments[0] == 0x2001
                && matches!(segments[1] & 0xfff0, 0x0010 | 0x0020);
            let is_well_known_nat64 = segments[0] == 0x0064 && segments[1] == 0xff9b;
            let compatible_ipv4 = segments[..6].iter().all(|segment| *segment == 0)
                .then(|| std::net::Ipv4Addr::new(
                    (segments[6] >> 8) as u8,
                    segments[6] as u8,
                    (segments[7] >> 8) as u8,
                    segments[7] as u8,
                ));
            let nat64_ipv4 = is_well_known_nat64.then(|| std::net::Ipv4Addr::new(
                (segments[6] >> 8) as u8,
                segments[6] as u8,
                (segments[7] >> 8) as u8,
                segments[7] as u8,
            ));
            let embedded_ipv4_disallowed = ip
                .to_ipv4_mapped()
                .or(compatible_ipv4)
                .or(nat64_ipv4)
                .map(|mapped| is_disallowed_rpc_ip(mapped.into()))
                .unwrap_or(false);

            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || (segments[0] & 0xe000) != 0x2000 // only global-unicast 2000::/3
                || (segments[0] & 0xfe00) == 0xfc00
                || (segments[0] & 0xffc0) == 0xfe80
                || (segments[0] & 0xffc0) == 0xfec0
                || is_teredo
                || is_documentation
                || is_6to4
                || is_orchid
                || is_well_known_nat64
                || embedded_ipv4_disallowed
        }
    }
}

#[tauri::command]
pub async fn ping_rpc_node(
    session_token: String,
    url: String,
    family: String,
) -> Result<RpcPingResponse, String> {
    let network_gate = authenticated_network_gate(&session_token);
    network_gate()?;
    if !matches!(family.as_str(), "bitcoin" | "solana" | "evm") {
        return Err("Unsupported RPC family".to_string());
    }

    let parsed_url = reqwest::Url::parse(url.trim())
        .map_err(|_| "Invalid RPC URL".to_string())?;
    if parsed_url.scheme() != "https" || parsed_url.host_str().is_none() ||
        !parsed_url.username().is_empty() || parsed_url.password().is_some() || parsed_url.fragment().is_some()
    {
        return Err("RPC endpoints must use HTTPS and cannot contain credentials or fragments".to_string());
    }
    let host = parsed_url.host_str().unwrap().trim_end_matches('.').to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") ||
        host.ends_with(".internal") || host.ends_with(".test")
    {
        return Err("Local or private RPC endpoints are not allowed".to_string());
    }

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .redirect(reqwest::redirect::Policy::none());
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        if is_disallowed_rpc_ip(ip) {
            return Err("Local or non-public RPC IP addresses are not allowed".to_string());
        }
    } else {
        let port = parsed_url.port_or_known_default().ok_or_else(|| "RPC URL has no port".to_string())?;
        let resolved = crate::adapters::network::await_with_gate(
            async {
                let addresses = tokio::time::timeout(
                    std::time::Duration::from_secs(3),
                    tokio::net::lookup_host((host.as_str(), port)),
                )
                .await
                .map_err(|_| "RPC hostname lookup timed out".to_string())?
                .map_err(|error| format!("RPC hostname lookup failed: {error}"))?;
                Ok(addresses.collect::<Vec<_>>())
            },
            network_gate.as_ref(),
        )
        .await?;
        let public_address = resolved
            .into_iter()
            .find(|address| !is_disallowed_rpc_ip(address.ip()))
            .ok_or_else(|| "RPC hostname did not resolve to a public IP address".to_string())?;
        // Pin the validated public resolution and disable redirects to prevent a
        // custom endpoint from redirecting the native request to a local service.
        client_builder = client_builder.resolve(&host, public_address);
    }
    network_gate()?;
    let client = client_builder.build().map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();

    if family == "bitcoin" {
        let mut endpoint_url = parsed_url.clone();
        let path = endpoint_url.path().trim_end_matches('/').to_string();
        endpoint_url.set_path(&format!("{path}/blocks/tip/height"));
        let endpoint = endpoint_url.to_string();
        let request = client
            .get(&endpoint)
            .header("User-Agent", "Plurivex/1.0")
            .send();
        let res = crate::adapters::network::await_with_gate(
            async { request.await.map_err(crate::adapters::network::redact_reqwest_error) },
            network_gate.as_ref(),
        )
        .await;

        let elapsed = start.elapsed().as_millis() as u64;
        match res {
            Ok(resp) => {
                if resp.status().is_success() {
                    let mut resp = resp;
                    let bytes = crate::adapters::network::read_response_limited(
                        &mut resp,
                        16_384,
                        network_gate.as_ref(),
                    )
                    .await?;
                    let height = String::from_utf8(bytes)
                        .ok()
                        .and_then(|text| text.trim().parse::<u64>().ok());
                    Ok(RpcPingResponse {
                        latency_ms: elapsed,
                        status: "online".to_string(),
                        block_height: height,
                    })
                } else {
                    Ok(RpcPingResponse {
                        latency_ms: elapsed,
                        status: format!("HTTP {}", resp.status()),
                        block_height: None,
                    })
                }
            }
            Err(_error) => Ok(RpcPingResponse {
                latency_ms: elapsed,
                status: "Connection failed".to_string(),
                block_height: None,
            }),
        }
    } else if family == "solana" {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getSlot",
            "params": []
        });

        let request = client
            .post(parsed_url.as_str())
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&payload)
            .send();
        let res = crate::adapters::network::await_with_gate(
            async { request.await.map_err(crate::adapters::network::redact_reqwest_error) },
            network_gate.as_ref(),
        )
        .await;

        let elapsed = start.elapsed().as_millis() as u64;
        match res {
            Ok(resp) => {
                if resp.status().is_success() {
                    let mut resp = resp;
                    let bytes = crate::adapters::network::read_response_limited(
                        &mut resp,
                        64_000,
                        network_gate.as_ref(),
                    )
                    .await?;
                    let body = String::from_utf8(bytes)
                        .map_err(|_| "RPC response is not valid UTF-8".to_string())?;
                    let json: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                    let slot = json.get("result").and_then(|v| v.as_u64());
                    Ok(RpcPingResponse {
                        latency_ms: elapsed,
                        status: "online".to_string(),
                        block_height: slot,
                    })
                } else {
                    Ok(RpcPingResponse {
                        latency_ms: elapsed,
                        status: format!("HTTP {}", resp.status()),
                        block_height: None,
                    })
                }
            }
            Err(_error) => Ok(RpcPingResponse {
                latency_ms: elapsed,
                status: "Connection failed".to_string(),
                block_height: None,
            }),
        }
    } else {
        // EVM
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_blockNumber",
            "params": []
        });

        let request = client
            .post(parsed_url.as_str())
            .header("Content-Type", "application/json")
            .header("User-Agent", "Mozilla/5.0")
            .json(&payload)
            .send();
        let res = crate::adapters::network::await_with_gate(
            async { request.await.map_err(crate::adapters::network::redact_reqwest_error) },
            network_gate.as_ref(),
        )
        .await;

        let elapsed = start.elapsed().as_millis() as u64;
        match res {
            Ok(resp) => {
                if resp.status().is_success() {
                    let mut resp = resp;
                    let bytes = crate::adapters::network::read_response_limited(
                        &mut resp,
                        64_000,
                        network_gate.as_ref(),
                    )
                    .await?;
                    let body = String::from_utf8(bytes)
                        .map_err(|_| "RPC response is not valid UTF-8".to_string())?;
                    let json: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                    let hex_block = json.get("result").and_then(|v| v.as_str());
                    let block_num = hex_block.and_then(|h| {
                        let clean = h.trim_start_matches("0x");
                        u64::from_str_radix(clean, 16).ok()
                    });
                    Ok(RpcPingResponse {
                        latency_ms: elapsed,
                        status: "online".to_string(),
                        block_height: block_num,
                    })
                } else {
                    Ok(RpcPingResponse {
                        latency_ms: elapsed,
                        status: format!("HTTP {}", resp.status()),
                        block_height: None,
                    })
                }
            }
            Err(_error) => Ok(RpcPingResponse {
                latency_ms: elapsed,
                status: "Connection failed".to_string(),
                block_height: None,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_rpc_ip_filter_rejects_private_and_special_ranges() {
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "100.64.0.1",
            "192.88.99.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "fec0::1",
            "2001:db8::1",
            "2002:c0a8:0101::1",
            "64:ff9b::a00:1",
            "::ffff:127.0.0.1",
        ] {
            let parsed = address.parse::<std::net::IpAddr>().unwrap();
            assert!(is_disallowed_rpc_ip(parsed), "{address} must be blocked");
        }

        for address in ["1.1.1.1", "2606:4700:4700::1111"] {
            let parsed = address.parse::<std::net::IpAddr>().unwrap();
            assert!(!is_disallowed_rpc_ip(parsed), "{address} should be public");
        }
    }

    #[test]
    fn test_updater_safe_mode_gate() {
        set_air_gapped_mode(true).unwrap();
        let res = verify_air_gap_inactive();
        assert!(res.is_err());
        assert_eq!(
            res.unwrap_err(),
            "Safe Mode is active: app-command network requests are disabled."
        );

        set_air_gapped_mode(false).unwrap();
        let res_active = verify_air_gap_inactive();
        assert!(res_active.is_ok());

        // Restore fail-closed safe default
        set_air_gapped_mode(true).unwrap();
    }

    #[test]
    fn test_zeroizing_secret_cleanup() {
        use zeroize::Zeroize;
        let mut s = zeroize::Zeroizing::new("super_secret_mnemonic_phrase_here".to_string());
        assert_eq!(&*s, "super_secret_mnemonic_phrase_here");
        s.zeroize();
        assert!(s.chars().all(|c| c == '\0'));
    }

    #[test]
    fn test_solana_transfer_payload_deserialize_number_and_string() {
        let json_number = r#"{
            "recipient": "11111111111111111111111111111111",
            "lamports": 1000000000,
            "recentBlockhash": "EkSnNWid2cvwEVnPx9aZaWBrespocAcjwn4SXSpMmMQx",
            "isNonceAccount": false
        }"#;
        let payload1: SolanaTransferPayload = serde_json::from_str(json_number).unwrap();
        assert_eq!(payload1.lamports, 1_000_000_000);

        let json_string = r#"{
            "recipient": "11111111111111111111111111111111",
            "lamports": "18446744073709551615",
            "recentBlockhash": "EkSnNWid2cvwEVnPx9aZaWBrespocAcjwn4SXSpMmMQx",
            "isNonceAccount": false
        }"#;
        let payload2: SolanaTransferPayload = serde_json::from_str(json_string).unwrap();
        assert_eq!(payload2.lamports, u64::MAX);
    }

    #[test]
    fn test_scoped_signing_rejects_after_lock_and_invalid_token() {
        let sm = crate::core::security::session::SessionManager::new(60);
        let password = "TestMasterPassword!RejectTest";
        let token = sm.unlock(password.to_string(), None);
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let encrypted = crate::core::security::crypto::encrypt_vault(mnemonic, password).unwrap();

        // 1. Before lock: can access master key and decrypt
        let master_key = sm.get_master_key(&token).expect("Token must be valid before lock");
        let secret = crate::core::security::crypto::decrypt_vault_zeroizing(&encrypted, &master_key).unwrap();
        assert_eq!(&*secret, mnemonic);

        // 2. Lock vault immediately
        sm.lock();

        // 3. After lock: token must be strictly rejected
        let after_lock_err = sm.get_master_key(&token).unwrap_err();
        assert!(after_lock_err.contains("Vault is locked"));

        // 4. Invalid token: must be strictly rejected
        let bogus_token = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        let bogus_err = sm.get_master_key(bogus_token).unwrap_err();
        assert!(bogus_err.contains("Vault is locked") || bogus_err.contains("Invalid session token"));
    }

    #[test]
    fn test_scoped_evm_and_solana_signing_logic() {
        let sm = crate::core::security::session::SessionManager::new(60);
        let password = "TestMasterPassword!999";
        let token = sm.unlock(password.to_string(), None);
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let encrypted = crate::core::security::crypto::encrypt_vault(mnemonic, password).unwrap();

        // 1. Verify decrypting via session token yields valid secret
        let master_key = sm.get_master_key(&token).unwrap();
        let secret = crate::core::security::crypto::decrypt_vault_zeroizing(&encrypted, &master_key).unwrap();
        assert_eq!(&*secret, mnemonic);

        // 2. EVM Signing with secret
        let evm_tx = EvmTransferPayload {
            chain_id: 1,
            to_address: "0x0000000000000000000000000000000000000001".to_string(),
            value_wei_hex: "0x01".to_string(),
            gas_price_wei_hex: "0x01".to_string(),
            gas_limit: 21000,
            nonce: 0,
        };
        let from_address = crate::core::wallets::signing::derive_evm_address_from_secret(&secret, "seed").unwrap();
        assert_eq!(from_address.to_lowercase(), "0x9858effd232b4033e47d90003d41ec34ecaeda94");

        let params = crate::core::wallets::signing::EvmTransferParams {
            chain_id: evm_tx.chain_id,
            to_address: &evm_tx.to_address,
            value_wei_hex: &evm_tx.value_wei_hex,
            gas_price_wei_hex: &evm_tx.gas_price_wei_hex,
            gas_limit: evm_tx.gas_limit,
            nonce: evm_tx.nonce,
        };
        let raw_tx = crate::core::wallets::signing::sign_evm_transfer_with_secret(
            &secret,
            "seed",
            &params,
        ).unwrap();
        assert!(!raw_tx.is_empty());

        // 3. Solana Signing with secret
        let sol_tx = SolanaTransferPayload {
            recipient: "11111111111111111111111111111112".to_string(),
            lamports: 1_000_000,
            recent_blockhash: "EkSnNWid2cvwEVnPx9aZaWBrespocAcjwn4SXSpMmMQx".to_string(),
            is_nonce_account: false,
            fee_payer_wallet_id: None,
        };
        let sol_params = crate::core::wallets::solana_signing::SolanaTransferParams {
            recipient: &sol_tx.recipient,
            lamports: sol_tx.lamports,
            recent_blockhash: &sol_tx.recent_blockhash,
            is_nonce_account: sol_tx.is_nonce_account,
        };
        let sol_res = crate::core::wallets::solana_signing::sign_solana_transfer_with_secret(
            &secret,
            "seed",
            &sol_params,
        ).unwrap();
        assert_eq!(sol_res.from_address, "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");
        assert!(!sol_res.raw_tx_base64.is_empty());
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_windows_empty_clipboard() {
        use std::ffi::c_void;
        #[link(name = "user32")]
        extern "system" {
            fn OpenClipboard(hWndNewOwner: *mut c_void) -> i32;
            fn EmptyClipboard() -> i32;
            fn CloseClipboard() -> i32;
        }
        unsafe {
            let opened = OpenClipboard(std::ptr::null_mut());
            println!("OpenClipboard returned: {}", opened);
            assert_ne!(opened, 0, "OpenClipboard failed");
            let emptied = EmptyClipboard();
            println!("EmptyClipboard returned: {}", emptied);
            assert_ne!(emptied, 0, "EmptyClipboard failed");
            CloseClipboard();
        }
    }
}
