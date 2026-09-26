use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_meta_table",
            sql: "CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_wallets_table",
            sql: "CREATE TABLE IF NOT EXISTS wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                encrypted_secret TEXT NOT NULL,
                fingerprint TEXT NOT NULL UNIQUE,
                address TEXT,
                word_count INTEGER,
                label TEXT,
                created_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_balances_table",
            sql: "CREATE TABLE IF NOT EXISTS balances (
                wallet_id INTEGER NOT NULL,
                chain TEXT NOT NULL,
                balance TEXT,
                updated_at TEXT,
                PRIMARY KEY (wallet_id, chain),
                FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_sol_address_column",
            sql: "ALTER TABLE wallets ADD COLUMN sol_address TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_token_balances_table",
            sql: "CREATE TABLE IF NOT EXISTS token_balances (
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
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_btc_address_column",
            sql: "ALTER TABLE wallets ADD COLUMN btc_address TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "drop_recovery_sessions_table",
            sql: "DROP TABLE IF EXISTS recovery_sessions;",
            kind: MigrationKind::Up,
        },
    ]
}
