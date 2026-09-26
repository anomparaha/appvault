use bip39::Mnemonic;
use std::collections::HashSet;

#[inline(always)]
fn is_b58_char(b: u8) -> bool {
    matches!(b, b'1'..=b'9' | b'A'..=b'H' | b'J'..=b'N' | b'P'..=b'Z' | b'a'..=b'k' | b'm'..=b'z')
}

/// Ultra-fast zero-copy extraction of seeds and private keys from raw text
pub fn extract_credentials_native(text: &str) -> Vec<String> {
    let mut results = Vec::new();
    let mut seen = HashSet::new();

    let english_list = bip39::Language::English.word_list();

    // 1. Line-by-line token parsing for keys and phrases
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("//") {
            continue;
        }

        // Tokenize line by common delimiters (spaces, colons, quotes, commas) to find hex & solana keys
        for token in trimmed.split(|c: char| {
            c.is_whitespace() || c == ':' || c == '=' || c == '"' || c == '\'' || c == ','
        }) {
            let token_clean =
                token.trim_matches(|c: char| !c.is_alphanumeric() && c != 'x' && c != 'X');
            if token_clean.is_empty() {
                continue;
            }

            let clean_hex = token_clean
                .strip_prefix("0x")
                .or_else(|| token_clean.strip_prefix("0X"))
                .unwrap_or(token_clean);
            if clean_hex.len() == 64 && clean_hex.chars().all(|c| c.is_ascii_hexdigit()) {
                if let Ok(bytes) = hex::decode(clean_hex) {
                    if bytes.len() == 32 {
                        let mut arr = [0u8; 32];
                        arr.copy_from_slice(&bytes);
                        if k256::ecdsa::SigningKey::from_bytes((&arr).into()).is_ok() {
                            let canonical = format!("0x{}", clean_hex.to_lowercase());
                            if seen.insert(canonical.clone()) {
                                results.push(canonical);
                            }
                        }
                    }
                }
            } else if (44..=88).contains(&token_clean.len()) && token_clean.bytes().all(is_b58_char)
            {
                if let Ok(bytes) = bs58::decode(token_clean).into_vec() {
                    if (bytes.len() == 32 || bytes.len() == 64)
                        && seen.insert(token_clean.to_string())
                    {
                        results.push(token_clean.to_string());
                    }
                }
            }
        }

        // Check if the whole line is a candidate seed phrase
        let words: Vec<&str> = trimmed.split_whitespace().collect();
        if matches!(words.len(), 12 | 15 | 18 | 21 | 24) {
            let all_bip39 = words
                .iter()
                .all(|w| english_list.contains(&w.to_lowercase().as_str()));
            if all_bip39 {
                let candidate = words
                    .iter()
                    .map(|w| w.to_lowercase())
                    .collect::<Vec<String>>()
                    .join(" ");
                if Mnemonic::parse_normalized(&candidate).is_ok() && seen.insert(candidate.clone())
                {
                    results.push(candidate);
                }
            }
        }
    }

    // 2. Sliding window token extraction for embedded seed phrases in unstructured logs/dump
    let tokens: Vec<&str> = text
        .split(|c: char| !c.is_ascii_alphabetic())
        .filter(|w| w.len() >= 3 && w.len() <= 10)
        .collect();

    let mut i = 0;
    while i < tokens.len() {
        let first_word = tokens[i].to_lowercase();
        if !english_list.contains(&first_word.as_str()) {
            i += 1;
            continue;
        }

        let mut matched = false;
        // Test lengths from longest to shortest: 24, 21, 18, 15, 12
        for &len in &[24, 21, 18, 15, 12] {
            if i + len <= tokens.len() {
                let slice = &tokens[i..i + len];
                let all_bip = slice
                    .iter()
                    .all(|w| english_list.contains(&w.to_lowercase().as_str()));
                if all_bip {
                    let candidate = slice
                        .iter()
                        .map(|w| w.to_lowercase())
                        .collect::<Vec<String>>()
                        .join(" ");
                    if Mnemonic::parse_normalized(&candidate).is_ok() {
                        if seen.insert(candidate.clone()) {
                            results.push(candidate);
                        }
                        i += len;
                        matched = true;
                        break;
                    }
                }
            }
        }

        if !matched {
            i += 1;
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_credentials_native() {
        let raw_text = r#"
            Random log 2026-08-31
            Here is an EVM private key: 0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d
            Some unrelated transaction hash
            And here is a seed phrase: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
            And a Solana private key: 5MaiiCavjCmn9Hsrwgah9dahfT38bppCraGzo64ffNWUjnsam2Sdk6
        "#;

        let res = extract_credentials_native(raw_text);
        assert!(
            res.iter().any(|item| item.starts_with("0x4f3edf98")),
            "Should extract EVM key"
        );
        assert!(
            res.iter().any(|item| item.ends_with("about")),
            "Should extract seed phrase"
        );
    }
}
