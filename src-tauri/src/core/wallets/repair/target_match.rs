use super::types::TargetAddressMatch;

/// Check if test phrase matches target address by selectively deriving ONLY the target chain
pub fn check_target_match(
    target: &str,
    test_phrase: &str,
    position_index: usize,
    word: &str,
) -> Option<TargetAddressMatch> {
    let t = target.trim();
    let is_evm = t.starts_with("0x") || t.starts_with("0X");
    let is_btc = t.starts_with("bc1") || t.starts_with('1') || t.starts_with('3');

    if is_evm {
        if let Ok(Some(addr)) =
            crate::core::wallets::derivation::derive_evm_address_only_native(test_phrase)
        {
            if addr.eq_ignore_ascii_case(t) {
                return Some(TargetAddressMatch {
                    position_index,
                    word: word.to_string(),
                    phrase: test_phrase.to_string(),
                    matched_address: addr,
                    chain_family: "evm".to_string(),
                });
            }
        }
    } else if is_btc {
        if let Ok((segwit, p2sh, legacy)) =
            crate::core::wallets::derivation::derive_bitcoin_addresses_only_native(test_phrase)
        {
            if let Some(ref addr) = segwit {
                if addr.eq_ignore_ascii_case(t) {
                    return Some(TargetAddressMatch {
                        position_index,
                        word: word.to_string(),
                        phrase: test_phrase.to_string(),
                        matched_address: addr.clone(),
                        chain_family: "bitcoin".to_string(),
                    });
                }
            }
            if let Some(ref addr) = p2sh {
                if addr == t {
                    return Some(TargetAddressMatch {
                        position_index,
                        word: word.to_string(),
                        phrase: test_phrase.to_string(),
                        matched_address: addr.clone(),
                        chain_family: "bitcoin".to_string(),
                    });
                }
            }
            if let Some(ref addr) = legacy {
                if addr == t {
                    return Some(TargetAddressMatch {
                        position_index,
                        word: word.to_string(),
                        phrase: test_phrase.to_string(),
                        matched_address: addr.clone(),
                        chain_family: "bitcoin".to_string(),
                    });
                }
            }
        }
    } else if let Ok(Some(addr)) =
        crate::core::wallets::derivation::derive_solana_address_only_native(test_phrase)
    {
        if addr == t {
            return Some(TargetAddressMatch {
                position_index,
                word: word.to_string(),
                phrase: test_phrase.to_string(),
                matched_address: addr,
                chain_family: "solana".to_string(),
            });
        }
    }
    None
}
