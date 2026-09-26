use base64::Engine;
use bip39::Mnemonic;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

pub const HMAC_FINGERPRINT_PREFIX: &str = "hmac1:";

pub fn canonical_key(text: &str) -> String {
    let t = text.trim();
    let hex = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")).unwrap_or(t);
    if hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit()) && !t.contains(char::is_whitespace) {
        return format!("pk:{}", hex.to_ascii_lowercase());
    }
    let words: Vec<&str> = t.split_whitespace().collect();
    if [12, 15, 18, 21, 24].contains(&words.len()) && Mnemonic::parse_normalized(t).is_ok() {
        return format!("seed:{}", words.iter().map(|w| w.to_ascii_lowercase()).collect::<Vec<_>>().join(" "));
    }
    if let Ok(bytes) = bs58::decode(t).into_vec() {
        if bytes.len() == 32 || bytes.len() == 64 {
            return format!("sol:{}", bs58::encode(&bytes).into_string());
        }
    }
    format!("seed:{}", words.iter().map(|w| w.to_ascii_lowercase()).collect::<Vec<_>>().join(" "))
}

/// Computes a keyed HMAC-SHA256 fingerprint for a wallet credential.
/// Produces a deterministic, rainbow-table-resistant fingerprint prefixed with `hmac1:`.
pub fn calculate_keyed_fingerprint(data: &str, hmac_key: &[u8]) -> String {
    let canonical = canonical_key(data);
    let mut mac = Hmac::<Sha256>::new_from_slice(hmac_key)
        .expect("HMAC accepts keys of any length");
    mac.update(canonical.as_bytes());
    let result = mac.finalize().into_bytes();
    format!(
        "{}{}",
        HMAC_FINGERPRINT_PREFIX,
        base64::engine::general_purpose::STANDARD.encode(result)
    )
}

/// Computes legacy unkeyed SHA-256 fingerprint (kept for backward compatibility and migration detection).
pub fn calculate_legacy_fingerprint(data: &str) -> String {
    let canonical = canonical_key(data);
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(hasher.finalize())
}

/// Checks whether a stored fingerprint string is in the legacy unkeyed format
pub fn is_legacy_fingerprint(fp: &str) -> bool {
    !fp.starts_with(HMAC_FINGERPRINT_PREFIX)
}

/// Fallback / default calculate_fingerprint (maintains backward compatibility with unkeyed callers)
pub fn calculate_fingerprint(data: &str) -> String {
    calculate_legacy_fingerprint(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_fingerprint_uniqueness() {
        let p1 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let p2 = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
        let f1 = calculate_fingerprint(p1);
        let f2 = calculate_fingerprint(p2);

        assert_ne!(f1, f2, "Different phrases must not collide");
        assert_eq!(f1, calculate_fingerprint(&format!("  {}  ", p1)), "Whitespace normalization must match");
    }

    #[test]
    fn test_canonical_key_hex_pk() {
        let pk = "0x4f3edf983ac636a65a842ce7c78d3270fad800125aa24e83cb4b08b204ad9ee8";
        let canonical = canonical_key(pk);
        assert_eq!(
            canonical,
            "pk:4f3edf983ac636a65a842ce7c78d3270fad800125aa24e83cb4b08b204ad9ee8"
        );
    }

    #[test]
    fn test_canonical_key_seed_and_solana() {
        let valid_mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        assert_eq!(
            canonical_key(valid_mnemonic),
            "seed:abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
        );

        // 32-byte dummy Solana key in Base58
        let sol_bytes = [7u8; 32];
        let sol_b58 = bs58::encode(&sol_bytes).into_string();
        assert_eq!(canonical_key(&sol_b58), format!("sol:{}", sol_b58));
    }

    #[test]
    fn test_calculate_keyed_fingerprint() {
        let key_a = [1u8; 32];
        let key_b = [2u8; 32];
        let p1 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

        let fp1 = calculate_keyed_fingerprint(p1, &key_a);
        let fp2 = calculate_keyed_fingerprint(p1, &key_a);
        assert_eq!(fp1, fp2, "Keyed fingerprint must be deterministic");
        assert!(fp1.starts_with(HMAC_FINGERPRINT_PREFIX));

        let fp_diff_key = calculate_keyed_fingerprint(p1, &key_b);
        assert_ne!(fp1, fp_diff_key, "Different keys must yield different fingerprints");

        // Legacy fingerprint must not have the prefix
        let legacy = calculate_legacy_fingerprint(p1);
        assert!(is_legacy_fingerprint(&legacy));
        assert!(!is_legacy_fingerprint(&fp1));
    }
}
