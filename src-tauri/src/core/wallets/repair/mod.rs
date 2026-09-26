pub mod dual_missing;
pub mod fast_checksum;
pub mod single_missing;
pub mod target_match;
pub mod types;
pub mod typos;

// Re-export key structs and public functions so callers have seamless backward compatibility
pub use fast_checksum::{fast_pack_12_entropy, fast_validate_12_words};
pub use target_match::check_target_match;
pub use types::{
    MnemonicRepairResult, PositionCandidateGroup, SlotCandidateWord, TargetAddressMatch,
    WordAnalysis,
};
pub use typos::{
    detect_mnemonic_language, is_placeholder_token, levenshtein_distance, suggest_bip39_words,
    suggest_bip39_words_for_lang, SUPPORTED_LANGUAGES,
};

use bip39::Mnemonic;
use dual_missing::solve_dual_word_missing;
use single_missing::{solve_11_words_all_positions, solve_single_word_at_slot};

/// Inspect and attempt heuristic repair on a mnemonic phrase, with auto-solve for missing words & target address matching
pub fn analyze_and_repair_mnemonic(
    phrase: &str,
    target_address: Option<&str>,
    target_position: Option<usize>,
) -> MnemonicRepairResult {
    let mut raw_tokens: Vec<&str> = phrase.split_whitespace().collect();

    let initial_count = raw_tokens.len();
    let (detected_lang, lang_name) = detect_mnemonic_language(&raw_tokens);
    let word_list = detected_lang.word_list();

    let mut is_single_word_missing = false;
    let mut is_dual_word_missing = false;
    let mut missing_word_index = None;
    let mut missing_word_indices = Vec::new();

    // Detect if user pasted 10 words (for 12-word seed) -> 2 words missing!
    if initial_count == 10 {
        is_dual_word_missing = true;
        let p = target_position.unwrap_or(10);
        let p1 = if p < 11 { p } else { 10 };
        let p2 = if p1 + 1 < 12 { p1 + 1 } else { 11 };
        missing_word_indices = vec![p1, p2];

        let mut tokens_with_ph = Vec::with_capacity(12);
        let mut orig_idx = 0;
        for i in 0..12 {
            if i == p1 || i == p2 {
                tokens_with_ph.push("?");
            } else if orig_idx < raw_tokens.len() {
                tokens_with_ph.push(raw_tokens[orig_idx]);
                orig_idx += 1;
            }
        }
        raw_tokens = tokens_with_ph;
    } else if initial_count == 11 || initial_count == 23 {
        is_single_word_missing = true;
        let pos = match target_position {
            Some(p) if p <= initial_count => p,
            _ => initial_count,
        };
        missing_word_index = Some(pos);
        raw_tokens.insert(pos, "?"); // Insert placeholder at requested position (default end)
    }

    let total_words = raw_tokens.len();
    let is_length_valid = matches!(total_words, 12 | 15 | 18 | 21 | 24);

    let mut words = Vec::with_capacity(total_words);
    let mut invalid_indices = Vec::new();
    let mut placeholder_indices = Vec::new();

    for (index, &token) in raw_tokens.iter().enumerate() {
        let clean = token.to_lowercase();
        let is_placeholder = is_placeholder_token(&clean);
        let is_valid = !is_placeholder && word_list.contains(&clean.as_str());

        let suggestions = if is_valid {
            Vec::new()
        } else if is_placeholder {
            placeholder_indices.push(index);
            Vec::new()
        } else {
            invalid_indices.push(index);
            suggest_bip39_words_for_lang(&clean, 5, detected_lang)
        };

        words.push(WordAnalysis {
            index,
            raw_word: clean,
            is_valid_bip39: is_valid,
            is_placeholder,
            suggestions,
        });
    }

    // If there is exactly one placeholder inside a valid-length phrase
    if is_length_valid && placeholder_indices.len() == 1 && invalid_indices.is_empty() {
        is_single_word_missing = true;
        missing_word_index = Some(placeholder_indices[0]);
    }
    // If there are exactly two placeholders inside a 12-word phrase
    else if total_words == 12 && placeholder_indices.len() == 2 && invalid_indices.is_empty() {
        is_dual_word_missing = true;
        missing_word_indices = placeholder_indices.clone();
    }

    let has_invalid_words = !invalid_indices.is_empty() || !placeholder_indices.is_empty();

    // Check if the current phrase passes BIP-39 validation directly
    let is_checksum_valid = if !has_invalid_words && is_length_valid {
        let clean_phrase = raw_tokens
            .iter()
            .map(|s| s.to_lowercase())
            .collect::<Vec<String>>()
            .join(" ");

        if total_words == 12 {
            let mut indices = [0u16; 12];
            let mut all_found = true;
            for (i, w) in raw_tokens.iter().enumerate() {
                let clean = w.to_lowercase();
                if let Some(pos) = word_list.iter().position(|&item| item == clean.as_str()) {
                    indices[i] = pos as u16;
                } else {
                    all_found = false;
                    break;
                }
            }
            all_found && fast_validate_12_words(&indices)
        } else {
            Mnemonic::parse_normalized(&clean_phrase).is_ok()
        }
    } else {
        false
    };

    let mut candidate_valid_words = Vec::new();
    let mut auto_repaired_phrases = Vec::new();
    let mut target_match = None;
    let mut position_candidates = Vec::new();
    let mut all_slot_candidates = Vec::new();
    let mut dual_word_combinations_tested = 0;
    let mut dual_word_solutions_count = 0;
    let mut is_transposition_detected = false;
    let mut transposed_indices = None;

    let clean_target = target_address.map(|s| s.trim()).filter(|s| !s.is_empty());

    // Case A: 11 words entered (single word missing anywhere)
    if initial_count == 11 && invalid_indices.is_empty() {
        let (cands, phrases, match_res, pos_groups, slot_cands) =
            solve_11_words_all_positions(phrase, clean_target, target_position, word_list);
        candidate_valid_words = cands;
        auto_repaired_phrases = phrases;
        target_match = match_res;
        position_candidates = pos_groups;
        all_slot_candidates = slot_cands;
    }

    // Case B: Exactly 1 word is missing at target_idx (when a specific slot is selected or 23 words)
    if is_single_word_missing && (target_position.is_some() || initial_count != 11) {
        if let Some(target_idx) = missing_word_index {
            if invalid_indices.is_empty() {
                let (cands, phrases, match_res) = solve_single_word_at_slot(
                    target_idx,
                    &mut words,
                    total_words,
                    clean_target,
                    word_list,
                );
                candidate_valid_words = cands;
                auto_repaired_phrases = phrases;
                target_match = match_res;
            }
        }
    }
    // Case C: Dual Word Missing (10 words entered or two '?' placeholders)
    else if is_dual_word_missing
        && total_words == 12
        && invalid_indices.is_empty()
        && missing_word_indices.len() == 2
    {
        let (cands, phrases, match_res, pos_groups, slot_cands, tested, count) =
            solve_dual_word_missing(
                phrase,
                &words,
                initial_count,
                target_position,
                clean_target,
                &missing_word_indices,
                word_list,
            );
        candidate_valid_words = cands;
        auto_repaired_phrases = phrases;
        target_match = match_res;
        position_candidates = pos_groups;
        all_slot_candidates = slot_cands;
        dual_word_combinations_tested = tested;
        dual_word_solutions_count = count;
    }
    // Case D: Exactly 1 word has typos with candidate suggestions -> test permutations
    else if is_length_valid && invalid_indices.len() == 1 && placeholder_indices.is_empty() {
        let typo_idx = invalid_indices[0];
        let candidates = words[typo_idx].suggestions.clone();

        for cand in &candidates {
            let mut test_words: Vec<String> = words.iter().map(|w| w.raw_word.clone()).collect();
            test_words[typo_idx] = cand.clone();
            let test_phrase = test_words.join(" ");

            if Mnemonic::parse_normalized(&test_phrase).is_ok() {
                candidate_valid_words.push(cand.clone());
                auto_repaired_phrases.push(test_phrase.clone());

                if target_match.is_none() {
                    if let Some(target) = clean_target {
                        target_match = check_target_match(target, &test_phrase, typo_idx, cand);
                    }
                }
            }
        }
    }
    // Case E: All words valid BIP-39, but invalid checksum -> Transposition check & word correction
    else if is_length_valid && !has_invalid_words && !is_checksum_valid {
        // Priority 1: Check for transposed / swapped words (all 66 pairs, prioritizing 11 adjacent pairs)
        if total_words == 12 {
            let word_strings: Vec<String> = words.iter().map(|w| w.raw_word.clone()).collect();
            let mut base_indices = [0u16; 12];
            for (i, w) in word_strings.iter().enumerate() {
                if let Some(pos) = word_list.iter().position(|&item| item == w.as_str()) {
                    base_indices[i] = pos as u16;
                }
            }

            // 1. Check all 11 adjacent pairs (i, i+1) first
            for i in 0..11 {
                let mut swapped_indices = base_indices;
                swapped_indices.swap(i, i + 1);

                if fast_validate_12_words(&swapped_indices) {
                    let mut swapped_words = word_strings.clone();
                    swapped_words.swap(i, i + 1);
                    let swapped_phrase = swapped_words.join(" ");

                    is_transposition_detected = true;
                    if transposed_indices.is_none() {
                        transposed_indices = Some((i, i + 1));
                    }

                    auto_repaired_phrases.push(swapped_phrase.clone());
                    candidate_valid_words.push(swapped_words[i].clone());

                    if target_match.is_none() {
                        if let Some(target) = clean_target {
                            target_match =
                                check_target_match(target, &swapped_phrase, i, &swapped_words[i]);
                        }
                    }
                }
            }

            // 2. Check remaining 55 non-adjacent pairs (i, j)
            for i in 0..11 {
                for j in (i + 2)..12 {
                    let mut swapped_indices = base_indices;
                    swapped_indices.swap(i, j);

                    if fast_validate_12_words(&swapped_indices) {
                        let mut swapped_words = word_strings.clone();
                        swapped_words.swap(i, j);
                        let swapped_phrase = swapped_words.join(" ");

                        is_transposition_detected = true;
                        if transposed_indices.is_none() {
                            transposed_indices = Some((i, j));
                        }

                        auto_repaired_phrases.push(swapped_phrase.clone());
                        candidate_valid_words.push(swapped_words[i].clone());

                        if target_match.is_none() {
                            if let Some(target) = clean_target {
                                target_match = check_target_match(
                                    target,
                                    &swapped_phrase,
                                    i,
                                    &swapped_words[i],
                                );
                            }
                        }
                    }
                }
            }
        }

        // Priority 2: Also test single word substitute at the last word
        let last_idx = total_words - 1;
        for &w in word_list.iter() {
            let mut test_words: Vec<String> = words.iter().map(|w| w.raw_word.clone()).collect();
            test_words[last_idx] = w.to_string();
            let test_phrase = test_words.join(" ");

            if Mnemonic::parse_normalized(&test_phrase).is_ok() {
                candidate_valid_words.push(w.to_string());
                auto_repaired_phrases.push(test_phrase.clone());

                if target_match.is_none() {
                    if let Some(target) = clean_target {
                        target_match = check_target_match(target, &test_phrase, last_idx, w);
                    }
                }
            }
        }
    }

    MnemonicRepairResult {
        total_words,
        is_length_valid,
        has_invalid_words,
        is_checksum_valid,
        is_single_word_missing,
        is_dual_word_missing,
        missing_word_index: if target_position.is_none() && initial_count == 11 {
            None
        } else {
            missing_word_index
        },
        missing_word_indices,
        candidate_valid_words,
        words,
        auto_repaired_phrases,
        target_match,
        position_candidates,
        all_slot_candidates,
        dual_word_combinations_tested,
        dual_word_solutions_count,
        detected_language: lang_name.to_string(),
        is_transposition_detected,
        transposed_indices,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bip39::Language;

    #[test]
    fn test_levenshtein() {
        assert_eq!(levenshtein_distance("kitten", "sitting"), 3);
        assert_eq!(levenshtein_distance("flaw", "lawn"), 2);
        assert_eq!(levenshtein_distance("wether", "weather"), 1);
        assert_eq!(levenshtein_distance("abandon", "abandon"), 0);
        assert_eq!(levenshtein_distance("", "abc"), 3);
    }

    #[test]
    fn test_suggest_typo() {
        let suggestions = suggest_bip39_words("aple", 3);
        assert!(suggestions.contains(&"apple".to_string()));
    }

    #[test]
    fn test_repair_known_mnemonic() {
        let valid_phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let res_valid = analyze_and_repair_mnemonic(valid_phrase, None, None);
        assert!(res_valid.is_length_valid);
        assert!(!res_valid.has_invalid_words);
        assert!(res_valid.is_checksum_valid);

        let typo_phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abou";
        let res_typo = analyze_and_repair_mnemonic(typo_phrase, None, None);
        assert!(res_typo.has_invalid_words);
        assert!(!res_typo.is_checksum_valid);
        assert_eq!(res_typo.words[11].suggestions[0], "about");
        assert!(res_typo
            .auto_repaired_phrases
            .contains(&valid_phrase.to_string()));
    }

    #[test]
    fn test_solve_11_words_auto_discovery() {
        let eleven_words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";
        let res = analyze_and_repair_mnemonic(eleven_words, None, None);
        assert!(res.is_single_word_missing);
        assert_eq!(res.missing_word_index, None);
        assert!(res.candidate_valid_words.contains(&"about".to_string()));
        assert!(res
            .auto_repaired_phrases
            .iter()
            .any(|p| p.ends_with("about")));
        assert_eq!(res.position_candidates.len(), 12);
        assert!(res.all_slot_candidates.len() >= 128);

        let res_slot12 = analyze_and_repair_mnemonic(eleven_words, None, Some(11));
        assert_eq!(res_slot12.missing_word_index, Some(11));
        assert_eq!(res_slot12.candidate_valid_words.len(), 128);
    }

    #[test]
    fn test_target_address_matcher_evm() {
        let full_phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let creds =
            crate::core::wallets::derivation::derive_dual_credentials_native(full_phrase, "seed")
                .unwrap();
        let target_evm = creds.evm_address.unwrap();

        let eleven = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";
        let res = analyze_and_repair_mnemonic(eleven, Some(&target_evm), None);

        assert!(res.target_match.is_some());
        let m = res.target_match.unwrap();
        assert_eq!(m.position_index, 11);
        assert_eq!(m.word, "about");
        assert_eq!(m.chain_family, "evm");
    }

    #[test]
    fn test_target_address_matcher_first_word_missing() {
        let full_phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let creds =
            crate::core::wallets::derivation::derive_dual_credentials_native(full_phrase, "seed")
                .unwrap();
        let target_evm = creds.evm_address.unwrap();

        let eleven_first_missing =
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let res = analyze_and_repair_mnemonic(eleven_first_missing, Some(&target_evm), None);

        assert!(res.target_match.is_some());
        let m = res.target_match.unwrap();
        assert_eq!(m.position_index, 0);
        assert_eq!(m.word, "abandon");
    }

    #[test]
    fn test_target_address_matcher_bitcoin() {
        let full_phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let creds =
            crate::core::wallets::derivation::derive_dual_credentials_native(full_phrase, "seed")
                .unwrap();
        let target_btc = creds.btc_address.unwrap();

        let eleven = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";
        let res = analyze_and_repair_mnemonic(eleven, Some(&target_btc), None);

        assert!(res.target_match.is_some());
        let m = res.target_match.unwrap();
        assert_eq!(m.position_index, 11);
        assert_eq!(m.word, "about");
        assert_eq!(m.chain_family, "bitcoin");
        assert_eq!(m.matched_address, target_btc);
    }

    #[test]
    fn test_fast_validate_12_words() {
        let valid_indices = [0u16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3];
        assert!(fast_validate_12_words(&valid_indices));

        let invalid_indices = [0u16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert!(!fast_validate_12_words(&invalid_indices));
    }

    #[test]
    fn test_dual_word_missing_10_words() {
        let full_phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let creds =
            crate::core::wallets::derivation::derive_dual_credentials_native(full_phrase, "seed")
                .unwrap();
        let target_evm = creds.evm_address.unwrap();

        let ten_words =
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";
        let res = analyze_and_repair_mnemonic(ten_words, Some(&target_evm), None);

        assert!(res.is_dual_word_missing);
        assert_eq!(res.missing_word_indices, vec![10, 11]);
        assert_eq!(res.dual_word_combinations_tested, 4_194_304);
        assert!(res.dual_word_solutions_count > 0);
        assert!(res.target_match.is_some());

        let m = res.target_match.unwrap();
        assert_eq!(m.word, "abandon");
        assert_eq!(m.phrase, full_phrase);
    }

    #[test]
    fn test_ten_words_user_all_positions() {
        let phrase = "license space law cash twice young book camera poverty energy";
        let res = analyze_and_repair_mnemonic(phrase, None, None);

        assert!(res.is_dual_word_missing);
        assert_eq!(res.position_candidates.len(), 12);
        for p in &res.position_candidates {
            assert!(
                p.candidate_count > 0,
                "Slot #{} should have valid candidate solutions",
                p.position_index + 1
            );
        }
        let distinct_slots: std::collections::BTreeSet<usize> = res
            .all_slot_candidates
            .iter()
            .map(|c| c.position_index)
            .collect();
        assert!(
            distinct_slots.len() > 2,
            "Expected solutions across multiple slots, found {:?}",
            distinct_slots
        );
    }

    #[test]
    fn test_detect_mnemonic_language() {
        let es_tokens = vec!["ábaco", "abdomen", "abeja", "abierto"];
        let (lang_es, name_es) = detect_mnemonic_language(&es_tokens);
        assert_eq!(lang_es, Language::Spanish);
        assert_eq!(name_es, "spanish");

        let fr_tokens = vec!["abaisser", "abandon", "abdiquer", "abeille"];
        let (lang_fr, name_fr) = detect_mnemonic_language(&fr_tokens);
        assert_eq!(lang_fr, Language::French);
        assert_eq!(name_fr, "french");

        let en_tokens = vec!["abandon", "ability", "able", "about"];
        let (lang_en, name_en) = detect_mnemonic_language(&en_tokens);
        assert_eq!(lang_en, Language::English);
        assert_eq!(name_en, "english");
    }

    #[test]
    fn test_transposed_adjacent_words() {
        // Generate a real valid phrase with distinct words
        let original_mnemonic = Mnemonic::from_entropy(&[42u8; 16]).unwrap();
        let original_phrase = original_mnemonic.to_string();
        let words: Vec<&str> = original_phrase.split_whitespace().collect();
        assert_eq!(words.len(), 12);

        // Swap adjacent words at index 2 and 3 (Slot #3 and Slot #4)
        let mut swapped_words = words.clone();
        swapped_words.swap(2, 3);
        let swapped_phrase = swapped_words.join(" ");

        let res = analyze_and_repair_mnemonic(&swapped_phrase, None, None);
        assert!(res.is_transposition_detected);
        assert_eq!(res.transposed_indices, Some((2, 3)));
        assert!(res.auto_repaired_phrases.contains(&original_phrase));
    }

    #[test]
    fn test_spanish_mnemonic_analysis() {
        let es_mnemonic = Mnemonic::from_entropy_in(Language::Spanish, &[55u8; 16]).unwrap();
        let es_phrase = es_mnemonic.to_string();

        let res = analyze_and_repair_mnemonic(&es_phrase, None, None);
        assert_eq!(res.detected_language, "spanish");
        assert!(res.is_checksum_valid);
        assert!(!res.has_invalid_words);
    }
}
