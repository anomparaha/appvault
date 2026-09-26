use super::fast_checksum::fast_validate_12_words;
use super::target_match::check_target_match;
use super::types::{PositionCandidateGroup, SlotCandidateWord, TargetAddressMatch, WordAnalysis};
use bip39::Mnemonic;
use rayon::prelude::*;

pub type SingleMissingSolveResult = (
    Vec<String>,
    Vec<String>,
    Option<TargetAddressMatch>,
    Vec<PositionCandidateGroup>,
    Vec<SlotCandidateWord>,
);

pub type PosParallelResult = (
    usize,
    usize,
    Vec<String>,
    Vec<SlotCandidateWord>,
    Option<TargetAddressMatch>,
);

pub fn solve_11_words_all_positions(
    phrase: &str,
    clean_target: Option<&str>,
    target_position: Option<usize>,
    word_list: &[&'static str],
) -> SingleMissingSolveResult {
    let original_11: Vec<String> = phrase
        .split_whitespace()
        .map(|s| s.to_lowercase())
        .collect();
    let orig_indices: Vec<u16> = original_11
        .iter()
        .map(|w| {
            word_list
                .iter()
                .position(|&item| item == w.as_str())
                .unwrap_or(0) as u16
        })
        .collect();

    let pos_results: Vec<PosParallelResult> = (0..=11)
        .into_par_iter()
        .map(|pos| {
            let mut valid_count = 0;
            let mut sample_words = Vec::new();
            let mut slot_candidates = Vec::new();
            let mut local_target_match = None;

            let mut test_indices = [0u16; 12];
            for (i, &orig_idx) in orig_indices.iter().enumerate().take(11) {
                let dest = if i >= pos { i + 1 } else { i };
                test_indices[dest] = orig_idx;
            }

            for w in 0..2048u16 {
                test_indices[pos] = w;
                if fast_validate_12_words(&test_indices) {
                    valid_count += 1;
                    let word_str = word_list[w as usize].to_string();
                    if sample_words.len() < 5 {
                        sample_words.push(word_str.clone());
                    }

                    let test_phrase = test_indices
                        .iter()
                        .map(|&idx| word_list[idx as usize])
                        .collect::<Vec<&str>>()
                        .join(" ");

                    slot_candidates.push(SlotCandidateWord {
                        word: word_str.clone(),
                        position_index: pos,
                        full_phrase: test_phrase.clone(),
                    });

                    if local_target_match.is_none() {
                        if let Some(target) = clean_target {
                            local_target_match =
                                check_target_match(target, &test_phrase, pos, &word_str);
                        }
                    }
                }
            }

            (
                pos,
                valid_count,
                sample_words,
                slot_candidates,
                local_target_match,
            )
        })
        .collect();

    let mut candidate_valid_words = Vec::new();
    let mut auto_repaired_phrases = Vec::new();
    let mut target_match = None;
    let mut all_slot_candidates = Vec::new();
    let mut position_candidates = Vec::new();

    for (pos, valid_count, sample_words, slot_candidates, local_match) in pos_results {
        if target_match.is_none() && local_match.is_some() {
            target_match = local_match;
        }
        for cand in slot_candidates {
            if target_position.is_none() {
                candidate_valid_words.push(cand.word.clone());
                auto_repaired_phrases.push(cand.full_phrase.clone());
            }
            all_slot_candidates.push(cand);
        }
        position_candidates.push(PositionCandidateGroup {
            position_index: pos,
            candidate_count: valid_count,
            sample_words,
        });
    }

    (
        candidate_valid_words,
        auto_repaired_phrases,
        target_match,
        position_candidates,
        all_slot_candidates,
    )
}

pub fn solve_single_word_at_slot(
    target_idx: usize,
    words: &mut [WordAnalysis],
    total_words: usize,
    clean_target: Option<&str>,
    word_list: &[&'static str],
) -> (Vec<String>, Vec<String>, Option<TargetAddressMatch>) {
    let mut candidate_valid_words = Vec::new();
    let mut auto_repaired_phrases = Vec::new();
    let mut target_match = None;

    if total_words == 12 {
        let mut base_indices = [0u16; 12];
        for (i, w) in words.iter().enumerate() {
            if i != target_idx {
                if let Some(pos) = word_list.iter().position(|&item| item == w.raw_word) {
                    base_indices[i] = pos as u16;
                }
            }
        }

        for w in 0..2048u16 {
            base_indices[target_idx] = w;
            if fast_validate_12_words(&base_indices) {
                let word_str = word_list[w as usize].to_string();
                let test_phrase = base_indices
                    .iter()
                    .map(|&idx| word_list[idx as usize])
                    .collect::<Vec<&str>>()
                    .join(" ");

                candidate_valid_words.push(word_str.clone());
                auto_repaired_phrases.push(test_phrase.clone());

                if target_match.is_none() {
                    if let Some(target) = clean_target {
                        target_match =
                            check_target_match(target, &test_phrase, target_idx, &word_str);
                    }
                }
            }
        }
    } else {
        // Fallback for 15, 18, 24 words
        for &w in word_list.iter() {
            let mut test_words: Vec<String> = words.iter().map(|w| w.raw_word.clone()).collect();
            test_words[target_idx] = w.to_string();
            let test_phrase = test_words.join(" ");

            if Mnemonic::parse_normalized(&test_phrase).is_ok() {
                candidate_valid_words.push(w.to_string());
                auto_repaired_phrases.push(test_phrase.clone());

                if target_match.is_none() {
                    if let Some(target) = clean_target {
                        target_match = check_target_match(target, &test_phrase, target_idx, w);
                    }
                }
            }
        }
    }

    if target_idx < words.len() {
        words[target_idx].suggestions = candidate_valid_words.clone();
    }

    (candidate_valid_words, auto_repaired_phrases, target_match)
}
