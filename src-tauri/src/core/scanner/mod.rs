pub mod bitcoin;
pub mod evm;
pub mod pricing;
pub mod solana;

use futures::future::join_all;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::Semaphore;

use crate::adapters::evm::tokens::*;
use crate::core::vault::repository::get_db_path;

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredToken {
    pub wallet_id: i64,
    pub chain: String,
    pub symbol: String,
    pub name: String,
    pub balance: String,
    pub raw_balance: String,
    pub contract_address: String,
    pub decimals: u8,
    pub logo_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ExistingEvmToken {
    pub symbol: String,
    pub name: String,
    pub contract_address: String,
    pub decimals: Option<u8>,
}

#[derive(Debug, Clone)]
pub struct WalletChainResult {
    pub wallet_id: i64,
    pub chain_key: String,
    pub native_balance: String,
    pub has_funds: bool,
    pub tokens: Vec<DiscoveredToken>,
}

#[derive(Debug, Serialize)]
pub struct ScanSummary {
    pub scanned: u32,
    pub funded: u32,
    pub errors: u32,
}

#[derive(PartialEq)]
pub enum ChainKind {
    Evm,
    Solana,
    Bitcoin,
}

pub struct ChainConfig {
    pub key: &'static str,
    pub rpcs: &'static [&'static str],
    pub symbol: &'static str,
    pub kind: ChainKind,
    pub tokens: &'static [TokenDef],
}

pub const CHAINS: &[ChainConfig] = &[
    ChainConfig {
        key: "btc",
        rpcs: &["https://mempool.space/api", "https://blockstream.info/api"],
        symbol: "BTC",
        kind: ChainKind::Bitcoin,
        tokens: &[],
    },
    ChainConfig {
        key: "eth",
        rpcs: &[
            "https://cloudflare-eth.com",
            "https://eth.drpc.org",
            "https://ethereum.publicnode.com",
        ],
        symbol: "ETH",
        kind: ChainKind::Evm,
        tokens: ETH_TOKENS,
    },
    ChainConfig {
        key: "robinhood",
        rpcs: &[
            "https://api.zan.top/node/v1/robinhood/mainnet/9f2590af4fda43418ca4f0e8ded27af5",
            "https://rpc.mainnet.chain.robinhood.com",
        ],
        symbol: "ETH",
        kind: ChainKind::Evm,
        tokens: ROBINHOOD_TOKENS,
    },
    ChainConfig {
        key: "base",
        rpcs: &[
            "https://mainnet.base.org",
            "https://base.publicnode.com",
            "https://base.drpc.org",
            "https://1rpc.io/base",
        ],
        symbol: "ETH",
        kind: ChainKind::Evm,
        tokens: BASE_TOKENS,
    },
    ChainConfig {
        key: "arb",
        rpcs: &[
            "https://arb1.arbitrum.io/rpc",
            "https://arbitrum.publicnode.com",
            "https://1rpc.io/arb",
        ],
        symbol: "ETH",
        kind: ChainKind::Evm,
        tokens: ARB_TOKENS,
    },
    ChainConfig {
        key: "bsc",
        rpcs: &[
            "https://bsc-dataseed.binance.org",
            "https://bsc-dataseed1.defibit.io",
            "https://bsc.publicnode.com",
            "https://1rpc.io/bnb",
        ],
        symbol: "BNB",
        kind: ChainKind::Evm,
        tokens: BSC_TOKENS,
    },
    ChainConfig {
        key: "sol",
        rpcs: &[
            "https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9",
            "https://api.mainnet-beta.solana.com",
            "https://solana-rpc.publicnode.com",
        ],
        symbol: "SOL",
        kind: ChainKind::Solana,
        tokens: &[],
    },
];

pub async fn execute_scan_balances(
    app: tauri::AppHandle,
    wallet_id: Option<i64>,
    wallet_ids: Option<Vec<i64>>,
    chain_key: Option<String>,
) -> Result<ScanSummary, String> {
    let path = get_db_path(&app)?;
    if !path.exists() {
        return Err(format!("database not found: {}", path.display()));
    }

    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));
    let _ = conn.execute_batch(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;",
    );

    type WalletAddressTuple = (i64, Option<String>, Option<String>, Option<String>);

    let wallets: Vec<WalletAddressTuple> = if let Some(id) = wallet_id {
        conn.query_row(
            "SELECT id, address, sol_address, btc_address FROM wallets WHERE id = ?1 AND (address IS NOT NULL OR sol_address IS NOT NULL OR btc_address IS NOT NULL)",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map(|row| vec![row])
        .map_err(|e| e.to_string())?
    } else if let Some(ids) = wallet_ids {
        if ids.is_empty() {
            return Ok(ScanSummary {
                scanned: 0,
                funded: 0,
                errors: 0,
            });
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id, address, sol_address, btc_address FROM wallets WHERE id IN ({placeholders}) AND (address IS NOT NULL OR sol_address IS NOT NULL OR btc_address IS NOT NULL) ORDER BY id"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(ids.iter()), |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    } else {
        let mut stmt = conn
            .prepare("SELECT id, address, sol_address, btc_address FROM wallets WHERE address IS NOT NULL OR sol_address IS NOT NULL OR btc_address IS NOT NULL ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let existing_token_rows = {
        let mut stmt = conn
            .prepare(
                "SELECT wallet_id, chain, token_symbol, token_name, contract_address, decimals, logo_url
                 FROM token_balances WHERE contract_address IS NOT NULL",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|row| row.ok()).collect::<Vec<_>>()
    };
    let mut existing_evm_tokens: std::collections::HashMap<(i64, String), Vec<ExistingEvmToken>> =
        std::collections::HashMap::new();
    let mut existing_token_logos = std::collections::HashMap::<(i64, String, String), String>::new();
    for (token_wallet_id, token_chain, symbol, name, contract_address, decimals, logo_url) in existing_token_rows {
        let chain_key = token_chain.to_lowercase();
        if let Some(logo_url) = logo_url.filter(|url| !url.trim().is_empty()) {
            existing_token_logos.insert(
                (token_wallet_id, chain_key.clone(), contract_address.to_lowercase()),
                logo_url,
            );
        }
        if !matches!(chain_key.as_str(), "eth" | "robinhood" | "base" | "arb" | "bsc") {
            continue;
        }
        existing_evm_tokens
            .entry((token_wallet_id, chain_key))
            .or_default()
            .push(ExistingEvmToken {
                symbol,
                name: name.unwrap_or_default(),
                contract_address,
                decimals: decimals.and_then(|value| u8::try_from(value).ok()),
            });
    }

    drop(conn);

    if wallets.is_empty() {
        return Ok(ScanSummary {
            scanned: 0,
            funded: 0,
            errors: 0,
        });
    }

    let client = crate::adapters::evm::client::shared_client();
    let semaphore = Arc::new(Semaphore::new(16));
    let mut tasks = Vec::new();

    for (w_id, evm_addr, sol_addr, btc_addr) in wallets {
        for chain in CHAINS {
            if chain_key.as_deref().is_some_and(|requested| requested != chain.key) {
                continue;
            }
            let has_addr = match chain.kind {
                ChainKind::Solana => sol_addr.is_some(),
                ChainKind::Bitcoin => btc_addr.is_some(),
                ChainKind::Evm => evm_addr.is_some(),
            };
            if !has_addr {
                continue;
            }

            let permit = semaphore.clone();
            let c_client = client.clone();
            let c_evm = evm_addr.clone();
            let c_sol = sol_addr.clone();
            let c_btc = btc_addr.clone();
            let c_existing_tokens = existing_evm_tokens
                .get(&(w_id, chain.key.to_lowercase()))
                .cloned()
                .unwrap_or_default();

            tasks.push(async move {
                let _permit = permit.acquire().await.ok();
                if chain.kind == ChainKind::Solana {
                    if let Some(ref addr) = c_sol {
                        solana::scan_solana_for_wallet(&c_client, addr, chain.rpcs, w_id).await
                    } else {
                        Err("No solana address".to_string())
                    }
                } else if chain.kind == ChainKind::Bitcoin {
                    if let Some(ref addr) = c_btc {
                        bitcoin::scan_bitcoin_for_wallet(&c_client, addr, chain.rpcs, w_id).await
                    } else {
                        Err("No bitcoin address".to_string())
                    }
                } else if let Some(ref addr) = c_evm {
                    evm::scan_evm_for_wallet(
                        &c_client,
                        addr,
                        chain.key,
                        chain.symbol,
                        chain.rpcs,
                        chain.tokens,
                        c_existing_tokens,
                        w_id,
                    )
                    .await
                } else {
                    Err("No evm address".to_string())
                }
            });
        }
    }

    let results = join_all(tasks).await;

    let mut write_conn = Connection::open(&path).map_err(|e| e.to_string())?;
    let _ = write_conn.busy_timeout(std::time::Duration::from_millis(5000));
    let _ = write_conn.execute_batch(
        "PRAGMA synchronous = NORMAL; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    );
    let tx = write_conn.transaction().map_err(|e| e.to_string())?;

    let mut scanned_count = 0u32;
    let mut funded_count = 0u32;
    let mut error_count = 0u32;

    {
        let mut update_stmt = tx
            .prepare(
                "INSERT INTO balances (wallet_id, chain, balance, updated_at)
                 VALUES (?1, ?2, ?3, datetime('now'))
                 ON CONFLICT(wallet_id, chain) DO UPDATE SET
                     balance = excluded.balance,
                     updated_at = excluded.updated_at;",
            )
            .map_err(|e| e.to_string())?;

        let mut insert_tok_stmt = tx
            .prepare(
                "INSERT INTO token_balances (wallet_id, chain, token_symbol, token_name, balance, raw_balance, contract_address, decimals, logo_url, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
                 ON CONFLICT(wallet_id, chain, token_symbol, contract_address) DO UPDATE SET
                     balance = excluded.balance,
                     raw_balance = excluded.raw_balance,
                     token_name = excluded.token_name,
                     decimals = excluded.decimals,
                     logo_url = COALESCE(excluded.logo_url, token_balances.logo_url),
                     updated_at = excluded.updated_at;",
            )
            .map_err(|e| e.to_string())?;

        let mut del_old_tok_stmt = tx
            .prepare("DELETE FROM token_balances WHERE wallet_id = ?1 AND chain = ?2;")
            .map_err(|e| e.to_string())?;

        for res in results {
            match res {
                Ok(w_res) => {
                    scanned_count += 1;
                    if w_res.has_funds {
                        funded_count += 1;
                    }
                    let _ = update_stmt.execute(params![
                        w_res.wallet_id,
                        w_res.chain_key,
                        w_res.native_balance
                    ]);

                    let mut tokens = w_res.tokens;
                    for token in &mut tokens {
                        if token.logo_url.is_none() {
                            let logo_key = (
                                token.wallet_id,
                                token.chain.to_lowercase(),
                                token.contract_address.to_lowercase(),
                            );
                            token.logo_url = existing_token_logos.get(&logo_key).cloned();
                        }
                    }
                    let _ = del_old_tok_stmt.execute(params![w_res.wallet_id, w_res.chain_key]);

                    for tok in tokens {
                        let _ = insert_tok_stmt.execute(params![
                            tok.wallet_id,
                            tok.chain,
                            tok.symbol,
                            tok.name,
                            tok.balance,
                            tok.raw_balance,
                            tok.contract_address,
                            i64::from(tok.decimals),
                            tok.logo_url,
                        ]);
                    }
                }
                Err(_) => {
                    error_count += 1;
                }
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ScanSummary {
        scanned: scanned_count,
        funded: funded_count,
        errors: error_count,
    })
}
