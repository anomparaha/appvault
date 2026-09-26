use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinDataDto {
    pub pin_token: String,
    pub pin_vault: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewWalletItem {
    pub r#type: String,
    pub encrypted_secret: String,
    pub fingerprint: String,
    pub address: Option<String>,
    pub sol_address: Option<String>,
    pub btc_address: Option<String>,
    pub word_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletTokenDto {
    pub wallet_id: i64,
    pub chain: String,
    pub symbol: String,
    pub name: String,
    pub balance: String,
    pub raw_balance: Option<String>,
    pub contract_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletRecordDto {
    pub id: i64,
    pub r#type: String,
    pub encrypted_secret: Option<String>,
    pub address: Option<String>,
    pub sol_address: Option<String>,
    pub btc_address: Option<String>,
    pub word_count: Option<i64>,
    pub label: Option<String>,
    pub created_at: String,
    pub balances: std::collections::HashMap<String, Option<String>>,
    pub tokens: Vec<WalletTokenDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletAddressRecordDto {
    pub id: i64,
    pub r#type: String,
    pub address: Option<String>,
    pub sol_address: Option<String>,
    pub btc_address: Option<String>,
}

pub fn get_connection(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    let path = crate::core::vault::repository::get_db_path(app)?;
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = rusqlite::Connection::open(&path).map_err(|e| format!("Failed to open SQLite database: {e}"))?;
    let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));
    let _ = conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA foreign_keys = ON;",
    );
    ensure_schema(&conn)?;
    Ok(conn)
}

pub fn ensure_schema(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            encrypted_secret TEXT NOT NULL,
            fingerprint TEXT NOT NULL UNIQUE,
            address TEXT,
            sol_address TEXT,
            btc_address TEXT,
            word_count INTEGER,
            label TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS balances (
            wallet_id INTEGER NOT NULL,
            chain TEXT NOT NULL,
            balance TEXT,
            updated_at TEXT,
            PRIMARY KEY (wallet_id, chain),
            FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS token_balances (
            wallet_id INTEGER NOT NULL,
            chain TEXT NOT NULL,
            token_symbol TEXT NOT NULL,
            token_name TEXT,
            balance TEXT NOT NULL,
            raw_balance TEXT,
            contract_address TEXT,
            updated_at TEXT,
            PRIMARY KEY (wallet_id, chain, token_symbol, contract_address),
            FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wallets_fingerprint ON wallets(fingerprint);
        CREATE INDEX IF NOT EXISTS idx_balances_wallet_id ON balances(wallet_id);
        CREATE INDEX IF NOT EXISTS idx_token_balances_wallet_id ON token_balances(wallet_id);",
    )
    .map_err(|e| format!("Failed to ensure database schema: {e}"))?;

    let _ = conn.execute("ALTER TABLE wallets ADD COLUMN sol_address TEXT", []);
    let _ = conn.execute("ALTER TABLE wallets ADD COLUMN btc_address TEXT", []);

    let _ = conn.execute(
        "UPDATE token_balances 
         SET token_symbol = 'BTc', token_name = 'Bobby The Cat', balance = REPLACE(balance, 'BoBB..yiKs', 'BTc') 
         WHERE contract_address = 'BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs'",
        [],
    );

    Ok(())
}

pub fn verify_session_authenticated(session_token: &str) -> Result<(), String> {
    if !crate::core::security::session::get_session_manager().is_authenticated(session_token) {
        return Err("Action denied: Active unlocked vault session required.".to_string());
    }
    Ok(())
}

// ==========================================
// CORE NATIVE DATABASE LOGIC
// ==========================================

pub fn db_has_master_password(conn: &rusqlite::Connection) -> Result<bool, String> {
    let mut stmt = conn
        .prepare("SELECT 1 FROM meta WHERE key = 'verification' LIMIT 1")
        .map_err(|e| e.to_string())?;
    let exists = stmt.exists([]).map_err(|e| e.to_string())?;
    Ok(exists)
}

pub fn db_has_pin(conn: &rusqlite::Connection) -> Result<bool, String> {
    let mut stmt = conn
        .prepare("SELECT 1 FROM meta WHERE key = 'pin_verification' LIMIT 1")
        .map_err(|e| e.to_string())?;
    let exists = stmt.exists([]).map_err(|e| e.to_string())?;
    Ok(exists)
}

pub fn db_save_master_password(conn: &rusqlite::Connection, token: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('verification', ?1)",
        rusqlite::params![token],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn db_save_pin_vault(
    conn: &mut rusqlite::Connection,
    pin_token: &str,
    encrypted_master_pw: &str,
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('pin_verification', ?1)",
        rusqlite::params![pin_token],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('pin_vault', ?1)",
        rusqlite::params![encrypted_master_pw],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn db_get_pin_data(conn: &rusqlite::Connection) -> Result<Option<PinDataDto>, String> {
    let pin_token: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'pin_verification'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let pin_vault: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'pin_vault'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    match (pin_token, pin_vault) {
        (Some(token), Some(vault)) => Ok(Some(PinDataDto {
            pin_token: token,
            pin_vault: vault,
        })),
        _ => Ok(None),
    }
}

pub fn db_get_verification_token(conn: &rusqlite::Connection) -> Result<Option<String>, String> {
    let token: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'verification'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(token)
}

pub fn db_reset_entire_vault(conn: &mut rusqlite::Connection) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let _ = tx.execute("DELETE FROM token_balances", []);
    let _ = tx.execute("DELETE FROM balances", []);
    let _ = tx.execute("DELETE FROM wallets", []);
    let _ = tx.execute("DELETE FROM meta", []);
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn db_insert_wallets_batch(
    conn: &mut rusqlite::Connection,
    items: &[NewWalletItem],
) -> Result<usize, String> {
    if items.is_empty() {
        return Ok(0);
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut inserted = 0;
    {
        let mut stmt = tx
            .prepare(
                "INSERT OR IGNORE INTO wallets (type, encrypted_secret, fingerprint, address, sol_address, btc_address, word_count, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
            .map_err(|e| e.to_string())?;

        for item in items {
            let rows = stmt
                .execute(rusqlite::params![
                    item.r#type,
                    item.encrypted_secret,
                    item.fingerprint,
                    item.address,
                    item.sol_address,
                    item.btc_address,
                    item.word_count,
                ])
                .map_err(|e| e.to_string())?;
            inserted += rows;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(inserted)
}

pub fn db_get_all_wallets(conn: &rusqlite::Connection) -> Result<Vec<WalletRecordDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, type, address, sol_address, btc_address, word_count, label, created_at
             FROM wallets ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    struct RawWallet {
        id: i64,
        r#type: String,
        address: Option<String>,
        sol_address: Option<String>,
        btc_address: Option<String>,
        word_count: Option<i64>,
        label: Option<String>,
        created_at: String,
    }

    let wallets_iter = stmt
        .query_map([], |row| {
            Ok(RawWallet {
                id: row.get(0)?,
                r#type: row.get(1)?,
                address: row.get(2)?,
                sol_address: row.get(3)?,
                btc_address: row.get(4)?,
                word_count: row.get(5)?,
                label: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut wallets = Vec::new();
    for w in wallets_iter {
        wallets.push(w.map_err(|e| e.to_string())?);
    }

    // Load balances
    let mut bal_stmt = conn
        .prepare("SELECT wallet_id, chain, balance FROM balances")
        .map_err(|e| e.to_string())?;

    let mut balances_by_wallet: std::collections::HashMap<i64, std::collections::HashMap<String, Option<String>>> =
        std::collections::HashMap::new();

    let bal_iter = bal_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for (wid, chain, bal) in bal_iter.flatten() {
        balances_by_wallet
            .entry(wid)
            .or_default()
            .insert(chain, bal);
    }

    // Load tokens
    let mut tok_stmt = conn
        .prepare(
            "SELECT wallet_id, chain, token_symbol, token_name, balance, raw_balance, contract_address
             FROM token_balances",
        )
        .map_err(|e| e.to_string())?;

    let mut tokens_by_wallet: std::collections::HashMap<i64, Vec<WalletTokenDto>> =
        std::collections::HashMap::new();

    let tok_iter = tok_stmt
        .query_map([], |row| {
            let wid: i64 = row.get(0)?;
            let chain: String = row.get(1)?;
            let token_symbol: String = row.get(2)?;
            let token_name: Option<String> = row.get(3)?;
            let balance: String = row.get(4)?;
            let raw_balance: Option<String> = row.get(5)?;
            let contract_address: Option<String> = row.get(6)?;
            let name = token_name.unwrap_or_else(|| token_symbol.clone());
            Ok((
                wid,
                WalletTokenDto {
                    wallet_id: wid,
                    chain,
                    symbol: token_symbol,
                    name,
                    balance,
                    raw_balance,
                    contract_address,
                },
            ))
        })
        .map_err(|e| e.to_string())?;

    for (wid, dto) in tok_iter.flatten() {
        tokens_by_wallet.entry(wid).or_default().push(dto);
    }

    let chain_keys = [
        "ethereum", "bsc", "polygon", "arbitrum", "optimism", "base", "avalanche", "solana", "bitcoin", "robinhood",
    ];

    let mut results = Vec::with_capacity(wallets.len());
    for w in wallets {
        let mut bal_map = std::collections::HashMap::new();
        for &ck in &chain_keys {
            bal_map.insert(ck.to_string(), None);
        }
        if let Some(loaded_bals) = balances_by_wallet.remove(&w.id) {
            for (k, v) in loaded_bals {
                bal_map.insert(k, v);
            }
        }
        let tokens = tokens_by_wallet.remove(&w.id).unwrap_or_default();

        results.push(WalletRecordDto {
            id: w.id,
            r#type: w.r#type,
            encrypted_secret: None, // Protected: Never leak vault ciphertext to frontend UI list
            address: w.address,
            sol_address: w.sol_address,
            btc_address: w.btc_address,
            word_count: w.word_count,
            label: w.label,
            created_at: w.created_at,
            balances: bal_map,
            tokens,
        });
    }

    Ok(results)
}

pub fn db_delete_wallet(conn: &mut rusqlite::Connection, id: i64) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let _ = tx.execute("DELETE FROM token_balances WHERE wallet_id = ?1", rusqlite::params![id]);
    let _ = tx.execute("DELETE FROM balances WHERE wallet_id = ?1", rusqlite::params![id]);
    tx.execute("DELETE FROM wallets WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn db_delete_all_wallets(conn: &mut rusqlite::Connection) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let _ = tx.execute("DELETE FROM token_balances", []);
    let _ = tx.execute("DELETE FROM balances", []);
    tx.execute("DELETE FROM wallets", []).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn db_get_existing_fingerprints(conn: &rusqlite::Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT fingerprint FROM wallets")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    let mut fingerprints = Vec::new();
    for fp in rows.flatten() {
        fingerprints.push(fp);
    }
    Ok(fingerprints)
}

pub fn db_get_existing_addresses(
    conn: &rusqlite::Connection,
) -> Result<Vec<WalletAddressRecordDto>, String> {
    let mut stmt = conn
        .prepare("SELECT id, type, address, sol_address, btc_address FROM wallets")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(WalletAddressRecordDto {
                id: row.get(0)?,
                r#type: row.get(1)?,
                address: row.get(2)?,
                sol_address: row.get(3)?,
                btc_address: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for item in rows.flatten() {
        list.push(item);
    }
    Ok(list)
}

pub fn db_update_wallet_label(
    conn: &rusqlite::Connection,
    id: i64,
    label: Option<String>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE wallets SET label = ?1 WHERE id = ?2",
        rusqlite::params![label, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn db_update_wallet_addresses(
    conn: &rusqlite::Connection,
    id: i64,
    address: Option<String>,
    sol_address: Option<String>,
    btc_address: Option<String>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE wallets SET address = ?1, sol_address = ?2, btc_address = ?3 WHERE id = ?4",
        rusqlite::params![address, sol_address, btc_address, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn db_clear_swept_balance(
    conn: &mut rusqlite::Connection,
    wallet_id: i64,
    chain: &str,
    token_mint_or_contract: Option<&str>,
    symbol: Option<&str>,
) -> Result<(), String> {
    let clean_chain = chain.trim().to_lowercase();
    if let Some(target) = token_mint_or_contract {
        let clean_target = target.trim();
        let _ = conn.execute(
            "DELETE FROM token_balances 
             WHERE wallet_id = ?1 
               AND LOWER(chain) = ?2 
               AND (LOWER(contract_address) = LOWER(?3) OR LOWER(token_symbol) = LOWER(?3))",
            rusqlite::params![wallet_id, clean_chain, clean_target],
        );
    } else {
        let default_sym = match clean_chain.as_str() {
            "sol" | "solana" => "SOL",
            "eth" | "ethereum" | "robinhood" | "base" | "arb" | "arbitrum" => "ETH",
            "bsc" => "BNB",
            "btc" | "bitcoin" => "BTC",
            _ => "ETH",
        };
        let sym = symbol.unwrap_or(default_sym);
        let _ = conn.execute(
            "INSERT INTO balances (wallet_id, chain, balance, updated_at)
             VALUES (?1, ?2, '0 ' || ?3, datetime('now'))
             ON CONFLICT(wallet_id, chain) DO UPDATE SET
                 balance = '0 ' || ?3,
                 updated_at = datetime('now')",
            rusqlite::params![wallet_id, clean_chain, sym],
        );
    }
    Ok(())
}

/// Migrates legacy unkeyed SHA-256 fingerprints to keyed HMAC-SHA256 (`hmac1:...`).
/// Automatically called in the background on vault unlock. Decrypts stored secrets using `master_key`
/// and calculates new keyed HMAC fingerprints using `fp_key`.
///
/// If `session_token` is provided, checks `is_session_active` between chunks: if the user locks
/// or the session expires, migration immediately aborts and zeroizes in-memory keys.
/// Decryptions are parallelized with Rayon, and updates are committed in small batches (100 rows)
/// so the SQLite database is never locked for more than a few milliseconds.
pub fn db_migrate_legacy_fingerprints(
    conn: &mut rusqlite::Connection,
    master_key: &str,
    fp_key: &[u8],
    session_token: Option<&str>,
) -> Result<usize, String> {
    struct LegacyRow {
        id: i64,
        encrypted_secret: String,
    }

    let candidates: Vec<LegacyRow> = {
        let mut stmt = conn
            .prepare("SELECT id, encrypted_secret FROM wallets WHERE fingerprint NOT LIKE 'hmac1:%'")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(LegacyRow {
                    id: row.get(0)?,
                    encrypted_secret: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.filter_map(|r| r.ok()).collect()
    };

    if candidates.is_empty() {
        return Ok(0);
    }

    use rayon::prelude::*;
    let mut migrated_count = 0;
    let mut seen_new_fps = std::collections::HashSet::new();
    const CHUNK_SIZE: usize = 100;

    for chunk in candidates.chunks(CHUNK_SIZE) {
        // Abort check: if vault was locked by user, break immediately to drop and zeroize keys
        if let Some(st) = session_token {
            if !crate::core::security::session::get_session_manager().is_session_active(st) {
                break;
            }
        }

        let decrypted_items: Vec<(i64, String)> = chunk
            .par_iter()
            .filter_map(|candidate| {
                let plaintext = crate::core::security::crypto::decrypt_vault_zeroizing(&candidate.encrypted_secret, master_key).ok()?;
                let new_fp = crate::core::wallets::fingerprint::calculate_keyed_fingerprint(&plaintext, fp_key);
                Some((candidate.id, new_fp))
            })
            .collect();

        // Check cancellation again before acquiring SQLite transaction
        if let Some(st) = session_token {
            if !crate::core::security::session::get_session_manager().is_session_active(st) {
                break;
            }
        }

        let tx = conn.transaction().map_err(|e| e.to_string())?;

        for (id, new_fp) in decrypted_items {
            if seen_new_fps.contains(&new_fp) {
                let _ = tx.execute("DELETE FROM wallets WHERE id = ?1", rusqlite::params![id]);
                continue;
            }

            let existing_id: Result<i64, rusqlite::Error> = tx.query_row(
                "SELECT id FROM wallets WHERE fingerprint = ?1 AND id != ?2",
                rusqlite::params![new_fp, id],
                |row| row.get(0),
            );

            match existing_id {
                Ok(_duplicate_id) => {
                    let _ = tx.execute("DELETE FROM wallets WHERE id = ?1", rusqlite::params![id]);
                }
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    let _ = tx.execute(
                        "UPDATE wallets SET fingerprint = ?1 WHERE id = ?2",
                        rusqlite::params![new_fp, id],
                    );
                    seen_new_fps.insert(new_fp);
                    migrated_count += 1;
                }
                Err(e) => {
                    return Err(format!("Fingerprint migration query error: {}", e));
                }
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(migrated_count)
}

pub fn db_cleanup_duplicate_wallets(conn: &mut rusqlite::Connection) -> Result<usize, String> {
    let mut stmt = conn
        .prepare("SELECT id, type, address, sol_address FROM wallets ORDER BY id ASC")
        .map_err(|e| e.to_string())?;

    struct SimpleWallet {
        id: i64,
        r#type: String,
        address: Option<String>,
        sol_address: Option<String>,
    }

    let rows = stmt
        .query_map([], |row| {
            Ok(SimpleWallet {
                id: row.get(0)?,
                r#type: row.get(1)?,
                address: row.get(2)?,
                sol_address: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut seen_evm: std::collections::HashMap<String, (i64, String)> = std::collections::HashMap::new();
    let mut seen_sol: std::collections::HashMap<String, (i64, String)> = std::collections::HashMap::new();
    let mut to_delete: std::collections::HashSet<i64> = std::collections::HashSet::new();

    for r in rows {
        let w = r.map_err(|e| e.to_string())?;
        if let Some(ref addr) = w.address {
            let lower = addr.to_lowercase();
            if let Some(existing) = seen_evm.get(&lower) {
                if existing.1 == "seed" && w.r#type == "pk" {
                    to_delete.insert(w.id);
                } else if existing.1 == "pk" && w.r#type == "seed" {
                    to_delete.insert(existing.0);
                    seen_evm.insert(lower, (w.id, w.r#type.clone()));
                } else {
                    to_delete.insert(w.id);
                }
            } else {
                seen_evm.insert(lower, (w.id, w.r#type.clone()));
            }
        }

        if let Some(ref sol) = w.sol_address {
            if seen_sol.contains_key(sol) {
                to_delete.insert(w.id);
            } else {
                seen_sol.insert(sol.clone(), (w.id, w.r#type.clone()));
            }
        }
    }

    drop(stmt);

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut cleaned = 0;
    for del_id in to_delete {
        let _ = tx.execute("DELETE FROM token_balances WHERE wallet_id = ?1", rusqlite::params![del_id]);
        let _ = tx.execute("DELETE FROM balances WHERE wallet_id = ?1", rusqlite::params![del_id]);
        let _ = tx.execute("DELETE FROM wallets WHERE id = ?1", rusqlite::params![del_id]);
        cleaned += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(cleaned)
}

// ==========================================
// TAURI COMMAND WRAPPERS (IPC ENDPOINTS)
// ==========================================

#[tauri::command]
pub fn vault_db_init(app: tauri::AppHandle) -> Result<(), String> {
    let _ = get_connection(&app)?;
    Ok(())
}

#[tauri::command]
pub fn vault_db_has_master_password(app: tauri::AppHandle) -> Result<bool, String> {
    let conn = get_connection(&app)?;
    db_has_master_password(&conn)
}

#[tauri::command]
pub fn vault_db_has_pin(app: tauri::AppHandle) -> Result<bool, String> {
    let conn = get_connection(&app)?;
    db_has_pin(&conn)
}

#[tauri::command]
pub fn vault_db_save_master_password(
    app: tauri::AppHandle,
    token: String,
    session_token: Option<String>,
) -> Result<(), String> {
    let conn = get_connection(&app)?;
    // If master password already exists, require active session to overwrite
    if db_has_master_password(&conn)? {
        verify_session_authenticated(session_token.as_deref().unwrap_or(""))?;
    }
    db_save_master_password(&conn, &token)
}

#[tauri::command]
pub fn vault_db_save_pin_vault(
    app: tauri::AppHandle,
    pin_token: String,
    encrypted_master_pw: String,
    session_token: String,
) -> Result<(), String> {
    verify_session_authenticated(&session_token)?;
    let mut conn = get_connection(&app)?;
    db_save_pin_vault(&mut conn, &pin_token, &encrypted_master_pw)
}

pub fn verify_master_password_internal(
    conn: &rusqlite::Connection,
    password: &str,
) -> Result<(), String> {
    let token = match db_get_verification_token(conn)? {
        Some(t) => t,
        None => return Err("Vault has no master password configured".into()),
    };
    if !crate::core::security::crypto::verify_password(&token, password) {
        return Err("Incorrect master password. Verification failed.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn vault_db_verify_master_password(
    app: tauri::AppHandle,
    password: String,
) -> Result<bool, String> {
    let conn = get_connection(&app)?;
    Ok(verify_master_password_internal(&conn, &password).is_ok())
}

pub fn validate_reset_confirmation(confirmation: &str) -> Result<(), String> {
    let clean = confirmation.trim();
    if clean != "CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY" {
        return Err("Security violation: Explicit confirmation string 'CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY' is required to reset vault".into());
    }
    Ok(())
}

#[tauri::command]
pub fn vault_db_reset_entire_vault(
    app: tauri::AppHandle,
    confirmation: String,
    session_token: Option<String>,
) -> Result<(), String> {
    validate_reset_confirmation(&confirmation)?;
    // If vault has active in-memory session, verify that the caller provides a valid authenticated token
    let session_mgr = crate::core::security::session::get_session_manager();
    if !session_mgr.is_locked() {
        verify_session_authenticated(session_token.as_deref().unwrap_or(""))?;
    }
    // Zeroize any active in-memory session on vault reset
    session_mgr.lock();
    let mut conn = get_connection(&app)?;
    db_reset_entire_vault(&mut conn)
}

#[tauri::command]
pub fn vault_db_insert_wallets_batch(
    app: tauri::AppHandle,
    items: Vec<NewWalletItem>,
    session_token: Option<String>,
) -> Result<usize, String> {
    let mut conn = get_connection(&app)?;
    if db_has_master_password(&conn)? {
        verify_session_authenticated(session_token.as_deref().unwrap_or(""))?;
    }
    db_insert_wallets_batch(&mut conn, &items)
}

#[tauri::command]
pub fn vault_db_get_all_wallets(
    app: tauri::AppHandle,
    session_token: Option<String>,
) -> Result<Vec<WalletRecordDto>, String> {
    let conn = get_connection(&app)?;
    if db_has_master_password(&conn)? {
        verify_session_authenticated(session_token.as_deref().unwrap_or(""))?;
    }
    db_get_all_wallets(&conn)
}

#[tauri::command]
pub fn vault_db_delete_wallet(
    app: tauri::AppHandle,
    id: i64,
    session_token: String,
    password: String,
) -> Result<(), String> {
    verify_session_authenticated(&session_token)?;
    let mut conn = get_connection(&app)?;
    verify_master_password_internal(&conn, &password)?;
    db_delete_wallet(&mut conn, id)
}

#[tauri::command]
pub fn vault_db_delete_all_wallets(
    app: tauri::AppHandle,
    session_token: String,
    password: String,
) -> Result<(), String> {
    verify_session_authenticated(&session_token)?;
    let mut conn = get_connection(&app)?;
    verify_master_password_internal(&conn, &password)?;
    db_delete_all_wallets(&mut conn)
}

#[tauri::command]
pub fn vault_db_get_existing_fingerprints(
    app: tauri::AppHandle,
    session_token: Option<String>,
) -> Result<Vec<String>, String> {
    let conn = get_connection(&app)?;
    if db_has_master_password(&conn)? {
        verify_session_authenticated(session_token.as_deref().unwrap_or(""))?;
    }
    db_get_existing_fingerprints(&conn)
}

#[tauri::command]
pub fn vault_db_get_existing_addresses(
    app: tauri::AppHandle,
    session_token: Option<String>,
) -> Result<Vec<WalletAddressRecordDto>, String> {
    let conn = get_connection(&app)?;
    if db_has_master_password(&conn)? {
        verify_session_authenticated(session_token.as_deref().unwrap_or(""))?;
    }
    db_get_existing_addresses(&conn)
}

#[tauri::command]
pub fn vault_db_update_wallet_label(
    app: tauri::AppHandle,
    id: i64,
    label: Option<String>,
    session_token: Option<String>,
) -> Result<(), String> {
    let conn = get_connection(&app)?;
    if db_has_master_password(&conn)? {
        verify_session_authenticated(session_token.as_deref().unwrap_or(""))?;
    }
    db_update_wallet_label(&conn, id, label)
}

#[tauri::command]
pub fn vault_db_update_wallet_addresses(
    app: tauri::AppHandle,
    id: i64,
    address: Option<String>,
    sol_address: Option<String>,
    btc_address: Option<String>,
    session_token: String,
) -> Result<(), String> {
    verify_session_authenticated(&session_token)?;
    let conn = get_connection(&app)?;
    db_update_wallet_addresses(&conn, id, address, sol_address, btc_address)
}

#[tauri::command]
pub fn vault_db_cleanup_duplicate_wallets(
    app: tauri::AppHandle,
    session_token: String,
) -> Result<usize, String> {
    verify_session_authenticated(&session_token)?;
    let mut conn = get_connection(&app)?;
    db_cleanup_duplicate_wallets(&mut conn)
}

#[tauri::command]
pub fn vault_db_clear_swept_balance(
    app: tauri::AppHandle,
    wallet_id: i64,
    chain: String,
    token_mint_or_contract: Option<String>,
    symbol: Option<String>,
    session_token: Option<String>,
) -> Result<(), String> {
    let mut conn = get_connection(&app)?;
    if db_has_master_password(&conn)? {
        verify_session_authenticated(session_token.as_deref().unwrap_or(""))?;
    }
    db_clear_swept_balance(
        &mut conn,
        wallet_id,
        &chain,
        token_mint_or_contract.as_deref(),
        symbol.as_deref(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_in_memory_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_native_db_meta_and_pin_flow() {
        let mut conn = setup_in_memory_db();

        assert!(!db_has_master_password(&conn).unwrap());
        assert!(!db_has_pin(&conn).unwrap());
        assert_eq!(db_get_verification_token(&conn).unwrap(), None);

        db_save_master_password(&conn, "argon2id_token_12345").unwrap();
        assert!(db_has_master_password(&conn).unwrap());
        assert_eq!(
            db_get_verification_token(&conn).unwrap(),
            Some("argon2id_token_12345".to_string())
        );

        // PIN vault
        assert!(db_get_pin_data(&conn).unwrap().is_none());
        assert!(!db_has_pin(&conn).unwrap());
        db_save_pin_vault(&mut conn, "pin_salt_hash", "encrypted_master").unwrap();
        assert!(db_has_pin(&conn).unwrap());
        let pin_data = db_get_pin_data(&conn).unwrap().expect("Pin data must exist");
        assert_eq!(pin_data.pin_token, "pin_salt_hash");
        assert_eq!(pin_data.pin_vault, "encrypted_master");
    }

    #[test]
    fn test_native_db_wallets_crud_and_deduplication() {
        let mut conn = setup_in_memory_db();

        let items = vec![
            NewWalletItem {
                r#type: "seed".to_string(),
                encrypted_secret: "enc_seed_1".to_string(),
                fingerprint: "fp_seed_1".to_string(),
                address: Some("0x1111111111111111111111111111111111111111".to_string()),
                sol_address: Some("sol_address_1".to_string()),
                btc_address: Some("btc_address_1".to_string()),
                word_count: Some(12),
            },
            NewWalletItem {
                r#type: "pk".to_string(),
                encrypted_secret: "enc_pk_duplicate".to_string(),
                fingerprint: "fp_pk_duplicate".to_string(),
                address: Some("0x1111111111111111111111111111111111111111".to_string()), // same EVM as seed
                sol_address: None,
                btc_address: None,
                word_count: None,
            },
            NewWalletItem {
                r#type: "seed".to_string(),
                encrypted_secret: "enc_seed_2".to_string(),
                fingerprint: "fp_seed_2".to_string(),
                address: Some("0x2222222222222222222222222222222222222222".to_string()),
                sol_address: Some("sol_address_2".to_string()),
                btc_address: None,
                word_count: Some(24),
            },
        ];

        let inserted = db_insert_wallets_batch(&mut conn, &items).unwrap();
        assert_eq!(inserted, 3);

        // Fingerprints
        let fps = db_get_existing_fingerprints(&conn).unwrap();
        assert_eq!(fps.len(), 3);
        assert!(fps.contains(&"fp_seed_1".to_string()));

        // Addresses
        let addrs = db_get_existing_addresses(&conn).unwrap();
        assert_eq!(addrs.len(), 3);

        // Check deduplication (seed keeps precedence over pk for same EVM address)
        let cleaned = db_cleanup_duplicate_wallets(&mut conn).unwrap();
        assert_eq!(cleaned, 1);

        let remaining = db_get_all_wallets(&conn).unwrap();
        assert_eq!(remaining.len(), 2);
        // Ciphertext is NOT exposed in the wallet list DTO
        assert!(remaining.iter().all(|w| w.encrypted_secret.is_none()));

        // Update label
        let first_id = remaining[0].id;
        db_update_wallet_label(&conn, first_id, Some("My Main Vault".to_string())).unwrap();
        let updated_wallets = db_get_all_wallets(&conn).unwrap();
        assert_eq!(
            updated_wallets.iter().find(|w| w.id == first_id).unwrap().label,
            Some("My Main Vault".to_string())
        );

        // Update addresses
        db_update_wallet_addresses(
            &conn,
            first_id,
            Some("0x9999999999999999999999999999999999999999".to_string()),
            Some("sol_new".to_string()),
            Some("btc_new".to_string()),
        )
        .unwrap();
        let final_wallets = db_get_all_wallets(&conn).unwrap();
        let w1 = final_wallets.iter().find(|w| w.id == first_id).unwrap();
        assert_eq!(w1.address.as_deref(), Some("0x9999999999999999999999999999999999999999"));
        assert_eq!(w1.sol_address.as_deref(), Some("sol_new"));
        assert_eq!(w1.btc_address.as_deref(), Some("btc_new"));

        // Delete single wallet
        db_delete_wallet(&mut conn, first_id).unwrap();
        assert_eq!(db_get_all_wallets(&conn).unwrap().len(), 1);

        // Reset entire vault
        db_reset_entire_vault(&mut conn).unwrap();
        assert_eq!(db_get_all_wallets(&conn).unwrap().len(), 0);
        assert!(!db_has_master_password(&conn).unwrap());
    }

    #[test]
    fn test_verify_session_authenticated_rejects_empty_token() {
        assert!(verify_session_authenticated("").is_err());
        assert!(verify_session_authenticated("invalid_token_12345").is_err());
    }

    #[test]
    fn test_db_migrate_legacy_fingerprints() {
        let mut conn = setup_in_memory_db();
        let pw = "MyVaultPassword456!";
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let encrypted = crate::core::security::crypto::encrypt_vault(mnemonic, pw).unwrap();
        let legacy_fp = crate::core::wallets::fingerprint::calculate_legacy_fingerprint(mnemonic);

        conn.execute(
            "INSERT INTO wallets (type, encrypted_secret, fingerprint, address, created_at) VALUES ('seed', ?1, ?2, '0x123', 1000)",
            rusqlite::params![encrypted, legacy_fp],
        )
        .unwrap();

        // Verify initial state has legacy unkeyed fingerprint
        let fps = db_get_existing_fingerprints(&conn).unwrap();
        assert_eq!(fps.len(), 1);
        assert!(crate::core::wallets::fingerprint::is_legacy_fingerprint(&fps[0]));

        // Run migration with derived HMAC key
        let fp_key = crate::core::security::crypto::derive_fingerprint_key(pw, None);
        let migrated = db_migrate_legacy_fingerprints(&mut conn, pw, &fp_key, None).unwrap();
        assert_eq!(migrated, 1);

        // Verify fingerprint is now keyed HMAC with prefix
        let updated_fps = db_get_existing_fingerprints(&conn).unwrap();
        assert_eq!(updated_fps.len(), 1);
        assert!(!crate::core::wallets::fingerprint::is_legacy_fingerprint(&updated_fps[0]));
        let expected_keyed_fp = crate::core::wallets::fingerprint::calculate_keyed_fingerprint(mnemonic, &fp_key);
        assert_eq!(updated_fps[0], expected_keyed_fp);

        // Running migration again must be a clean no-op
        let rerun = db_migrate_legacy_fingerprints(&mut conn, pw, &fp_key, None).unwrap();
        assert_eq!(rerun, 0);
    }

    #[test]
    fn test_vault_reset_entire_vault_confirmation_validation() {
        assert!(validate_reset_confirmation("").is_err());
        assert!(validate_reset_confirmation("reset").is_err());
        assert!(validate_reset_confirmation("CONFIRM").is_err());
        assert!(validate_reset_confirmation("CONFIRM_RESET_ENTIRE_VAULT").is_err());
        assert!(validate_reset_confirmation("CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY").is_ok());
        assert!(validate_reset_confirmation("  CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY  ").is_ok());
    }

    #[test]
    fn test_db_migrate_legacy_fingerprints_race_with_concurrent_import() {
        let mut conn = setup_in_memory_db();
        let pw = "RaceVaultPass123!";
        let mnemonic1 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let mnemonic2 = "legal winner thank year wave sausage worth useful legal winner thank yellow";

        let enc1 = crate::core::security::crypto::encrypt_vault(mnemonic1, pw).unwrap();
        let enc2 = crate::core::security::crypto::encrypt_vault(mnemonic2, pw).unwrap();

        let legacy_fp1 = crate::core::wallets::fingerprint::calculate_legacy_fingerprint(mnemonic1);
        let legacy_fp2 = crate::core::wallets::fingerprint::calculate_legacy_fingerprint(mnemonic2);

        // Insert legacy rows W1 and W2
        conn.execute(
            "INSERT INTO wallets (type, encrypted_secret, fingerprint, address, created_at) VALUES ('seed', ?1, ?2, '0x111', 1000)",
            rusqlite::params![enc1, legacy_fp1],
        ).unwrap();
        conn.execute(
            "INSERT INTO wallets (type, encrypted_secret, fingerprint, address, created_at) VALUES ('seed', ?1, ?2, '0x222', 1001)",
            rusqlite::params![enc2, legacy_fp2],
        ).unwrap();

        let fp_key = crate::core::security::crypto::derive_fingerprint_key(pw, None);
        let modern_fp1 = crate::core::wallets::fingerprint::calculate_keyed_fingerprint(mnemonic1, &fp_key);

        // Simulate concurrent import during the migration window:
        // An import arrives with modern keyed HMAC fingerprint for W1 (same secret)
        conn.execute(
            "INSERT INTO wallets (type, encrypted_secret, fingerprint, address, created_at) VALUES ('seed', ?1, ?2, '0x111', 1002)",
            rusqlite::params![enc1, modern_fp1],
        ).unwrap();

        // Run chunked migration: must handle collision by deleting duplicate candidate row
        let migrated = db_migrate_legacy_fingerprints(&mut conn, pw, &fp_key, None).unwrap();
        assert_eq!(migrated, 1); // W2 migrated; W1 duplicate deleted

        let fps = db_get_existing_fingerprints(&conn).unwrap();
        assert_eq!(fps.len(), 2);
        for fp in &fps {
            assert!(!crate::core::wallets::fingerprint::is_legacy_fingerprint(fp));
            assert!(fp.starts_with("hmac1:"));
        }

        // Verify 0 legacy fingerprints remain in database
        let unmigrated_count: i64 = conn.query_row(
            "SELECT COUNT(1) FROM wallets WHERE fingerprint NOT LIKE 'hmac1:%'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(unmigrated_count, 0);
    }

    #[test]
    fn test_db_migrate_legacy_fingerprints_aborts_on_lock() {
        let mut conn = setup_in_memory_db();
        let pw = "LockAbortPass123!";
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let enc = crate::core::security::crypto::encrypt_vault(mnemonic, pw).unwrap();
        let legacy_fp = crate::core::wallets::fingerprint::calculate_legacy_fingerprint(mnemonic);

        conn.execute(
            "INSERT INTO wallets (type, encrypted_secret, fingerprint, address, created_at) VALUES ('seed', ?1, ?2, '0x333', 1000)",
            rusqlite::params![enc, legacy_fp],
        ).unwrap();

        let fp_key = crate::core::security::crypto::derive_fingerprint_key(pw, None);
        let session_mgr = crate::core::security::session::get_session_manager();
        let token = session_mgr.unlock(pw.to_string(), Some(300));

        // Lock vault immediately to simulate lock during migration
        session_mgr.lock();

        // Migration must abort immediately on lock
        let migrated = db_migrate_legacy_fingerprints(&mut conn, pw, &fp_key, Some(&token)).unwrap();
        assert_eq!(migrated, 0);

        // Candidate remains unmigrated safely for next session
        let unmigrated_count: i64 = conn.query_row(
            "SELECT COUNT(1) FROM wallets WHERE fingerprint NOT LIKE 'hmac1:%'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(unmigrated_count, 1);
    }

    #[test]
    fn test_native_verify_master_password_flow() {
        let mut conn = setup_in_memory_db();
        let pw = "SecurePassword789!";
        let token = crate::core::security::crypto::create_verification_token(pw).unwrap();
        db_save_master_password(&mut conn, &token).unwrap();

        // Stored token matches password
        let stored_token = db_get_verification_token(&conn).unwrap().unwrap();
        assert!(crate::core::security::crypto::verify_password(&stored_token, pw));
        assert!(!crate::core::security::crypto::verify_password(&stored_token, "WrongPassword"));
    }

    #[test]
    fn test_verify_master_password_internal_and_delete_protection() {
        let mut conn = setup_in_memory_db();
        let pw = "SuperSecretVaultPw2026!";
        let token = crate::core::security::crypto::create_verification_token(pw).unwrap();
        db_save_master_password(&mut conn, &token).unwrap();

        // Valid password succeeds
        assert!(verify_master_password_internal(&conn, pw).is_ok());

        // Incorrect password fails with explicit message
        let err = verify_master_password_internal(&conn, "IncorrectPassword!").unwrap_err();
        assert_eq!(err, "Incorrect master password. Verification failed.");

        // Empty password fails
        assert!(verify_master_password_internal(&conn, "").is_err());
    }
}
