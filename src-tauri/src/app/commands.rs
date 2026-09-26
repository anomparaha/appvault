use crate::adapters::evm::client::*;
use crate::adapters::solana::client::*;
use crate::core::scanner::{execute_scan_balances, ChainKind, ScanSummary, CHAINS};
use crate::core::wallets::import::{scan_directory_native as core_scan_dir, NativeScanResult};
use std::sync::atomic::{AtomicBool, Ordering};
use base64::Engine;

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

pub fn verify_air_gap_inactive() -> Result<(), String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn scan_balances(
    app: tauri::AppHandle,
    wallet_id: Option<i64>,
    wallet_ids: Option<Vec<i64>>,
) -> Result<ScanSummary, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
    }
    execute_scan_balances(app, wallet_id, wallet_ids).await
}

#[tauri::command]
pub async fn get_chain_fee_data(chain_key: String) -> Result<ChainFeeResponse, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
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

    crate::adapters::evm::client::get_chain_fee_data(chain.key, chain.rpcs, chain.symbol).await
}

#[tauri::command]
pub async fn get_account_nonce_and_balance(
    chain_key: String,
    address: String,
) -> Result<AccountInfoResponse, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == chain_key)
        .ok_or_else(|| "Chain not found".to_string())?;

    if chain.kind == ChainKind::Solana {
        for rpc in chain.rpcs {
            if let Ok(lamports_str) =
                crate::adapters::solana::client::rpc_get_sol_balance(&address, rpc).await
            {
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
        return Err("Failed to query Solana balance from all RPC nodes".to_string());
    }

    crate::adapters::evm::client::get_account_nonce_and_balance(
        chain.key,
        chain.rpcs,
        chain.symbol,
        &address,
    )
    .await
}

#[tauri::command]
pub async fn broadcast_raw_tx(chain_key: String, raw_tx: String) -> Result<String, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == chain_key)
        .ok_or_else(|| "Chain not found".to_string())?;
    crate::adapters::evm::client::broadcast_raw_tx(chain.key, chain.rpcs, &raw_tx).await
}

#[tauri::command]
pub async fn get_solana_recent_blockhash() -> Result<String, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    crate::adapters::solana::client::get_solana_recent_blockhash(chain.rpcs).await
}

#[tauri::command]
pub async fn broadcast_solana_tx(raw_tx_base64: String) -> Result<String, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    crate::adapters::solana::client::broadcast_solana_tx(chain.rpcs, &raw_tx_base64).await
}

#[tauri::command]
pub async fn get_solana_account_details(address: String) -> Result<SolanaAccountDetails, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
    }
    let chain = CHAINS
        .iter()
        .find(|c| c.key == "sol")
        .ok_or_else(|| "Solana chain not found".to_string())?;
    crate::adapters::solana::client::get_solana_account_details(chain.rpcs, &address).await
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
    ids: Option<Vec<String>>,
) -> Result<crate::core::scanner::pricing::PriceReport, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Price feeds blocked.".to_string());
    }
    crate::adapters::pricing::coingecko::get_cached_or_fetch_prices(ids).await
}

#[tauri::command]
pub async fn scan_phrase_on_the_fly(phrase: String) -> Result<OnTheFlyBalanceResult, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
    }

    let creds = crate::core::wallets::derivation::derive_public_addresses_only_native(&phrase)?;
    let client = crate::adapters::evm::client::shared_client();

    // Fetch dynamic live/cached prices with fallback
    let price_report = crate::adapters::pricing::coingecko::get_cached_or_fetch_prices(None)
        .await
        .unwrap_or_else(|_| crate::core::scanner::pricing::PriceReport::baseline_fallback());
    let btc_price = price_report.get_usd_price_or_baseline("btc");
    let eth_price = price_report.get_usd_price_or_baseline("eth");
    let bnb_price = price_report.get_usd_price_or_baseline("bnb");
    let sol_price = price_report.get_usd_price_or_baseline("sol");

    let mut has_funds = false;
    let mut total_usd = 0.0;

    // 1. Scan Bitcoin if address present
    let mut btc_balance_str: Option<String> = None;
    if let Some(ref btc_addr) = creds.btc_address {
        let btc_rpcs = &["https://mempool.space/api", "https://blockstream.info/api"];
        if let Ok(res) =
            crate::core::scanner::bitcoin::scan_bitcoin_for_wallet(&client, btc_addr, btc_rpcs, 0)
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
                if let Ok(hex_bal) =
                    crate::adapters::evm::client::rpc_get_balance(evm_addr, rpc).await
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
                if let Ok(lamports_str) =
                    crate::adapters::solana::client::rpc_get_sol_balance(sol_addr, rpc).await
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
    pub decimals: u8,
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
    tx: EvmTransferPayload,
) -> Result<EvmSignResult, String> {
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

    let mut decimals = tx.decimals;
    let mut token_prog = tx.token_program;

    if tx.mint == "BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs" {
        if decimals == 0 || decimals == 6 {
            decimals = 9;
        }
        if token_prog.is_none() {
            token_prog = Some("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb".to_string());
        }
    } else if decimals == 0 || token_prog.is_none() {
        let client = crate::adapters::evm::client::shared_client();
        let rpcs = [
            "https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9",
            "https://api.mainnet-beta.solana.com",
        ];
        for rpc in rpcs {
            let payload = serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAccountInfo",
                "params": [&tx.mint, {"encoding": "jsonParsed"}]
            });
            if let Ok(resp) = client.post(rpc).json(&payload).send().await {
                if let Ok(data) = resp.json::<serde_json::Value>().await {
                    if let Some(val) = data.get("result").and_then(|r| r.get("value")) {
                        if token_prog.is_none() {
                            if let Some(owner) = val.get("owner").and_then(|o| o.as_str()) {
                                token_prog = Some(owner.to_string());
                            }
                        }
                        if decimals == 0 {
                            if let Some(dec) = val.pointer("/data/parsed/info/decimals").and_then(|d| d.as_u64()) {
                                decimals = dec as u8;
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    let params = crate::core::wallets::solana_signing::SolanaTokenSweepParams {
        recipient: &tx.recipient,
        mint: &tx.mint,
        amount_raw: tx.amount_raw,
        decimals,
        token_program: token_prog.as_deref(),
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

    let message_bytes = base64::engine::general_purpose::STANDARD
        .decode(&tx.message_base64)
        .map_err(|e| format!("Invalid base64 message bytes: {}", e))?;

    crate::core::wallets::solana_signing::sign_solana_versioned_message_with_secrets(
        &fee_payer_secret,
        &fee_payer_type,
        &source_secret,
        &wallet_type,
        &message_bytes,
    )
}

#[tauri::command]
pub async fn jupiter_get_quote(
    input_mint: String,
    output_mint: String,
    amount_raw: String,
    slippage_bps: u32,
) -> Result<String, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Jupiter quote blocked.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let endpoints = [
        "https://public.jupiterapi.com",
        "https://api.jup.ag/swap/v1",
    ];

    let mut last_err = String::from("Failed to connect to Jupiter quote API");

    for base in endpoints {
        let url = format!(
            "{}/quote?inputMint={}&outputMint={}&amount={}&slippageBps={}",
            base, input_mint, output_mint, amount_raw, slippage_bps
        );
        match client.get(&url).send().await {
            Ok(res) => {
                let status = res.status();
                if status.is_success() {
                    match res.text().await {
                        Ok(text) => return Ok(text),
                        Err(e) => last_err = e.to_string(),
                    }
                } else {
                    let body = res.text().await.unwrap_or_default();
                    last_err = format!("Jupiter error ({}): {}", status, body);
                }
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
    }

    Err(last_err)
}

#[tauri::command]
pub async fn jupiter_get_swap_instructions(
    payload_json: String,
) -> Result<String, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Jupiter swap blocked.".to_string());
    }

    // Strip platformFee so Jupiter swap-instructions never fails with 'feeAccount is required'
    let mut payload_val: serde_json::Value = serde_json::from_str(&payload_json).unwrap_or(serde_json::Value::Null);
    if let Some(qr) = payload_val.get_mut("quoteResponse") {
        if let Some(obj) = qr.as_object_mut() {
            obj.remove("platformFee");
        }
    }
    let sanitized_payload = if payload_val.is_null() { payload_json } else { payload_val.to_string() };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let endpoints = [
        "https://public.jupiterapi.com",
        "https://api.jup.ag/swap/v1",
    ];

    let mut last_err = String::from("Failed to connect to Jupiter swap instructions API");

    for base in endpoints {
        let url = format!("{}/swap-instructions", base);
        match client
            .post(&url)
            .header("Content-Type", "application/json")
            .body(sanitized_payload.clone())
            .send()
            .await
        {
            Ok(res) => {
                let status = res.status();
                if status.is_success() {
                    match res.text().await {
                        Ok(text) => return Ok(text),
                        Err(e) => last_err = e.to_string(),
                    }
                } else {
                    let body = res.text().await.unwrap_or_default();
                    last_err = format!("Jupiter error ({}): {}", status, body);
                }
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
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
pub async fn vault_updater_check(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    verify_air_gap_inactive()?;

    use tauri_plugin_updater::UpdaterExt;
    let updater = app
        .updater_builder()
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .map_err(|e| format!("Failed to set cache-control header: {e}"))?
        .header("Pragma", "no-cache")
        .map_err(|e| format!("Failed to set pragma header: {e}"))?
        .build()
        .map_err(|e| format!("Failed to initialize updater: {e}"))?;
    let update = updater.check().await.map_err(|e| format!("Failed to check for updates: {e}"))?;

    Ok(update.map(|u| UpdateInfo {
        version: u.version,
        current_version: u.current_version,
        body: u.body,
        date: u.date.map(|d| d.to_string()),
    }))
}

#[tauri::command]
pub async fn vault_updater_download_and_install(app: tauri::AppHandle) -> Result<(), String> {
    verify_air_gap_inactive()?;

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
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for updates: {e}"))?
        .ok_or_else(|| "No update available to download and install.".to_string())?;

    let app_handle = app.clone();
    update
        .download_and_install(
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
        )
        .await
        .map_err(|e| format!("Failed to download and install update: {e}"))?;

    let _ = app.emit("updater-finished", ());

    #[allow(unreachable_code)]
    {
        app.restart();
        Ok(())
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RpcPingResponse {
    pub url: String,
    pub latency_ms: u64,
    pub status: String,
    pub block_height: Option<u64>,
}

#[tauri::command]
pub async fn ping_rpc_node(url: String, family: String) -> Result<RpcPingResponse, String> {
    if AIR_GAPPED_MODE.load(Ordering::SeqCst) {
        return Err("Air-Gapped Safe Mode is ACTIVE: Outbound network blocked.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();

    if family == "bitcoin" {
        let endpoint = format!("{}/blocks/tip/height", url.trim_end_matches('/'));
        let res = client
            .get(&endpoint)
            .header("User-Agent", "Plurivex/1.0")
            .send()
            .await;

        let elapsed = start.elapsed().as_millis() as u64;
        match res {
            Ok(resp) => {
                if resp.status().is_success() {
                    let height = resp.text().await.ok().and_then(|t| t.trim().parse::<u64>().ok());
                    Ok(RpcPingResponse {
                        url,
                        latency_ms: elapsed,
                        status: "online".to_string(),
                        block_height: height,
                    })
                } else {
                    Ok(RpcPingResponse {
                        url,
                        latency_ms: elapsed,
                        status: format!("HTTP {}", resp.status()),
                        block_height: None,
                    })
                }
            }
            Err(e) => Ok(RpcPingResponse {
                url,
                latency_ms: elapsed,
                status: format!("Error: {}", e),
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

        let res = client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&payload)
            .send()
            .await;

        let elapsed = start.elapsed().as_millis() as u64;
        match res {
            Ok(resp) => {
                if resp.status().is_success() {
                    let json: serde_json::Value = resp.json().await.unwrap_or_default();
                    let slot = json.get("result").and_then(|v| v.as_u64());
                    Ok(RpcPingResponse {
                        url,
                        latency_ms: elapsed,
                        status: "online".to_string(),
                        block_height: slot,
                    })
                } else {
                    Ok(RpcPingResponse {
                        url,
                        latency_ms: elapsed,
                        status: format!("HTTP {}", resp.status()),
                        block_height: None,
                    })
                }
            }
            Err(e) => Ok(RpcPingResponse {
                url,
                latency_ms: elapsed,
                status: format!("Error: {}", e),
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

        let res = client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Mozilla/5.0")
            .json(&payload)
            .send()
            .await;

        let elapsed = start.elapsed().as_millis() as u64;
        match res {
            Ok(resp) => {
                if resp.status().is_success() {
                    let json: serde_json::Value = resp.json().await.unwrap_or_default();
                    let hex_block = json.get("result").and_then(|v| v.as_str());
                    let block_num = hex_block.and_then(|h| {
                        let clean = h.trim_start_matches("0x");
                        u64::from_str_radix(clean, 16).ok()
                    });
                    Ok(RpcPingResponse {
                        url,
                        latency_ms: elapsed,
                        status: "online".to_string(),
                        block_height: block_num,
                    })
                } else {
                    Ok(RpcPingResponse {
                        url,
                        latency_ms: elapsed,
                        status: format!("HTTP {}", resp.status()),
                        block_height: None,
                    })
                }
            }
            Err(e) => Ok(RpcPingResponse {
                url,
                latency_ms: elapsed,
                status: format!("Error: {}", e),
                block_height: None,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_updater_air_gap_kernel_gate() {
        set_air_gapped_mode(true).unwrap();
        let res = verify_air_gap_inactive();
        assert!(res.is_err());
        assert_eq!(
            res.unwrap_err(),
            "Air-Gapped Safe Mode is ACTIVE: Outbound network blocked."
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
