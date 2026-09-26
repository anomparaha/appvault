// Blockchain Explorers URL Hub
pub fn explorer_tx_url(chain_key: &str, tx_hash: &str) -> String {
    match chain_key {
        "eth" => format!("https://etherscan.io/tx/{tx_hash}"),
        "bsc" => format!("https://bscscan.com/tx/{tx_hash}"),
        "base" => format!("https://basescan.org/tx/{tx_hash}"),
        "arb" => format!("https://arbiscan.io/tx/{tx_hash}"),
        "robinhood" => format!("https://robinhoodchain.blockscout.com/tx/{tx_hash}"),
        "sol" => format!("https://solscan.io/tx/{tx_hash}"),
        _ => format!("https://etherscan.io/tx/{tx_hash}"),
    }
}
