use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletRecord {
    pub id: i64,
    pub wallet_type: String,
    pub address: Option<String>,
    pub sol_address: Option<String>,
    pub fingerprint: String,
    pub word_count: Option<i32>,
    pub label: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceRecord {
    pub wallet_id: i64,
    pub chain: String,
    pub balance: Option<String>,
    pub updated_at: Option<String>,
}
