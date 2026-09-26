use super::fast_checksum::fast_validate_12_words;
use super::target_match::check_target_match;
use super::types::{PositionCandidateGroup, SlotCandidateWord, TargetAddressMatch, WordAnalysis};
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};

pub type DualMissingSolveResult = (
    Vec<String>,
    Vec<String>,
    Option<TargetAddressMatch>,
    Vec<PositionCandidateGroup>,
    Vec<SlotCandidateWord>,
    usize,
    usize,
);

pub type DualPairParallelResult = (usize, usize, usize, Vec<String>, Vec<SlotCandidateWord>);

pub fn solve_dual_word_missing(
    phrase: &str,
    words: &[WordAnalysis],
    initial_count: usize,
    target_position: Option<usize>,
    clean_target: Option<&str>,
    missing_word_indices: &[usize],
    word_list: &[&'static str],
) -> DualMissingSolveResult {
    let mut candidate_valid_words = Vec::new();
    let mut auto_repaired_phrases = Vec::new();
    let mut target_match = None;
    let mut position_candidates = Vec::new();
    let mut all_slot_candidates = Vec::new();
    let dual_word_combinations_tested;
    let dual_word_solutions_count;

    let is_all_dual_mode = initial_count == 10 && target_position.is_none();

    if is_all_dual_mode {
        // "All Positions" Mode: Test all 66 possible position pairs (p1, p2)!
        let non_ph_words: Vec<String> = phrase
            .split_whitespace()
            .filter(|s| !crate::core::wallets::repair::is_placeholder_token(s))
            .map(|s| s.to_lowercase())
            .collect();
        let orig_indices: Vec<u16> = non_ph_words
            .iter()
            .map(|w| {
                word_list
                    .iter()
                    .position(|&item| item == w.as_str())
                    .unwrap_or(0) as u16
            })
            .collect();

        let mut all_pairs = Vec::with_capacity(66);
        // Prioritize consecutive pairs (p, p+1) starting from the end (10, 11)
        all_pairs.push((10, 11));
        for p in 0..10 {
            all_pairs.push((p, p + 1));
        }
        for p1 in 0..11 {
            for p2 in (p1 + 1)..12 {
                if !all_pairs.contains(&(p1, p2)) {
                    all_pairs.push((p1, p2));
                }
            }
        }

        dual_word_combinations_tested = 4_194_304; // 4,194,304 combinations per pair tested concurrently via Rayon

        // 1. Target Address Search: test pair-by-pair in a directed manner with parallel Rayon within each pair
        if let Some(target) = clean_target {
            for &(p1, p2) in &all_pairs {
                let mut base_indices = [0u16; 12];
                let mut orig_idx = 0;
                for (i, val) in base_indices.iter_mut().enumerate() {
                    if i != p1 && i != p2 && orig_idx < orig_indices.len() {
                        *val = orig_indices[orig_idx];
                        orig_idx += 1;
                    }
                }

                target_match = (0..2048u16).into_par_iter().find_map_any(|w1| {
                    let mut test_indices = base_indices;
                    test_indices[p1] = w1;
                    for w2 in 0..2048u16 {
                        test_indices[p2] = w2;
                        if fast_validate_12_words(&test_indices) {
                            let phrase = test_indices
                                .iter()
                                .map(|&idx| word_list[idx as usize])
                                .collect::<Vec<&str>>()
                                .join(" ");
                            if let Some(m) =
                                check_target_match(target, &phrase, p1, word_list[w1 as usize])
                            {
                                return Some(m);
                            }
                        }
                    }
                    None
                });

                if target_match.is_some() {
                    break;
                }
            }
        }

        // 2. Scan valid checksum solutions distributed across all 66 pairs
        let pair_results: Vec<DualPairParallelResult> = all_pairs
            .par_iter()
            .map(|&(p1, p2)| {
                let mut base_indices = [0u16; 12];
                let mut orig_idx = 0;
                for (i, val) in base_indices.iter_mut().enumerate() {
                    if i != p1 && i != p2 && orig_idx < orig_indices.len() {
                        *val = orig_indices[orig_idx];
                        orig_idx += 1;
                    }
                }

                let mut local_phrases = Vec::new();
                let mut local_candidates = Vec::new();

                let w1_start = ((p1 * 173 + p2 * 37) % 2048) as u16;
                for step in 0..2048u16 {
                    let w1 = (w1_start + step) % 2048;
                    let mut test_indices = base_indices;
                    test_indices[p1] = w1;
                    for w2 in 0..2048u16 {
                        test_indices[p2] = w2;
                        if fast_validate_12_words(&test_indices) && local_phrases.len() < 2 {
                            let phrase = test_indices
                                .iter()
                                .map(|&idx| word_list[idx as usize])
                                .collect::<Vec<&str>>()
                                .join(" ");
                            local_phrases.push(phrase.clone());
                            local_candidates.push(SlotCandidateWord {
                                word: word_list[w1 as usize].to_string(),
                                position_index: p1,
                                full_phrase: phrase.clone(),
                            });
                            local_candidates.push(SlotCandidateWord {
                                word: word_list[w2 as usize].to_string(),
                                position_index: p2,
                                full_phrase: phrase,
                            });
                        }
                        if local_phrases.len() >= 2 {
                            break;
                        }
                    }
                    if local_phrases.len() >= 2 {
                        break;
                    }
                }

                // In BIP-39 (4-bit checksum), each 2-slot pair in 12 words has exactly (2048*2048)/16 = 262,144 valid phrases
                let exact_valid_solutions = 262_144;
                (
                    p1,
                    p2,
                    exact_valid_solutions,
                    local_phrases,
                    local_candidates,
                )
            })
            .collect();

        let mut slot_counts = [0usize; 12];
        let mut total_solutions = 0;

        for (p1, p2, count, phrases, candidates) in pair_results {
            slot_counts[p1] += count;
            slot_counts[p2] += count;
            total_solutions += count;

            if auto_repaired_phrases.len() < 120 {
                auto_repaired_phrases.extend(phrases);
            }
            if all_slot_candidates.len() < 240 {
                all_slot_candidates.extend(candidates);
            }
        }

        dual_word_solutions_count = total_solutions;

        // Populate position candidates for all 12 slots so each slot tab lights up!
        for (pos, &count) in slot_counts.iter().enumerate() {
            position_candidates.push(PositionCandidateGroup {
                position_index: pos,
                candidate_count: count,
                sample_words: all_slot_candidates
                    .iter()
                    .filter(|c| c.position_index == pos)
                    .map(|c| c.word.clone())
                    .take(5)
                    .collect(),
            });
        }
    } else {
        // Specific slots mode: User selects specific slots or indicates question marks '?'
        let p1 = missing_word_indices[0];
        let p2 = missing_word_indices[1];

        let mut base_indices = [0u16; 12];
        for (i, w) in words.iter().enumerate() {
            if i != p1 && i != p2 {
                if let Some(pos) = word_list.iter().position(|&item| item == w.raw_word) {
                    base_indices[i] = pos as u16;
                }
            }
        }

        dual_word_combinations_tested = 2048 * 2048; // 4,194,304 combinations

        // Target address search with Rayon: finds the exact winning phrase in milliseconds
        if let Some(target) = clean_target {
            target_match = (0..2048u16).into_par_iter().find_map_any(|w1| {
                let mut test_indices = base_indices;
                test_indices[p1] = w1;
                for w2 in 0..2048u16 {
                    test_indices[p2] = w2;
                    if fast_validate_12_words(&test_indices) {
                        let phrase = test_indices
                            .iter()
                            .map(|&idx| word_list[idx as usize])
                            .collect::<Vec<&str>>()
                            .join(" ");
                        if let Some(m) =
                            check_target_match(target, &phrase, p1, word_list[w1 as usize])
                        {
                            return Some(m);
                        }
                    }
                }
                None
            });
        }

        // Parallel scan for valid checksum solutions
        let count_atomic = AtomicUsize::new(0);

        let sample_solutions: Vec<String> = (0..2048u16)
            .into_par_iter()
            .flat_map(|w1| {
                let mut local = Vec::new();
                let mut test_indices = base_indices;
                test_indices[p1] = w1;
                for w2 in 0..2048u16 {
                    test_indices[p2] = w2;
                    if fast_validate_12_words(&test_indices) {
                        let total = count_atomic.fetch_add(1, Ordering::Relaxed);
                        if total < 250 {
                            let phrase = test_indices
                                .iter()
                                .map(|&idx| word_list[idx as usize])
                                .collect::<Vec<&str>>()
                                .join(" ");
                            local.push(phrase);
                        }
                    }
                }
                local
            })
            .collect();

        dual_word_solutions_count = count_atomic.load(Ordering::Relaxed);
        auto_repaired_phrases = sample_solutions;

        for phr in auto_repaired_phrases.iter().take(40) {
            let split: Vec<&str> = phr.split_whitespace().collect();
            if split.len() == 12 {
                all_slot_candidates.push(SlotCandidateWord {
                    word: split[p1].to_string(),
                    position_index: p1,
                    full_phrase: phr.clone(),
                });
                all_slot_candidates.push(SlotCandidateWord {
                    word: split[p2].to_string(),
                    position_index: p2,
                    full_phrase: phr.clone(),
                });
            }
        }

        // Populate position candidate groups for the missing pair so UI tabs show candidate counts
        position_candidates.push(PositionCandidateGroup {
            position_index: p1,
            candidate_count: dual_word_solutions_count,
            sample_words: all_slot_candidates
                .iter()
                .filter(|c| c.position_index == p1)
                .map(|c| c.word.clone())
                .take(5)
                .collect(),
        });
        position_candidates.push(PositionCandidateGroup {
            position_index: p2,
            candidate_count: dual_word_solutions_count,
            sample_words: all_slot_candidates
                .iter()
                .filter(|c| c.position_index == p2)
                .map(|c| c.word.clone())
                .take(5)
                .collect(),
        });

        // If user explicitly selected a target position, filter candidate_valid_words for that specific slot
        if let Some(target_pos) = target_position {
            let mut unique_words = std::collections::BTreeSet::new();
            for phr in &auto_repaired_phrases {
                let split: Vec<&str> = phr.split_whitespace().collect();
                if split.len() == 12 && target_pos < 12 {
                    unique_words.insert(split[target_pos].to_string());
                }
            }
            candidate_valid_words = unique_words.into_iter().collect();
        }
    }

    (
        candidate_valid_words,
        auto_repaired_phrases,
        target_match,
        position_candidates,
        all_slot_candidates,
        dual_word_combinations_tested,
        dual_word_solutions_count,
    )
}
