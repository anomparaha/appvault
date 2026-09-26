use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_utc_iso() -> String {
    let now = SystemTime::now();
    let secs = now.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    // Return approximate ISO-like timestamp for SQLite logging
    format!("{}", secs)
}
