use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordAnalysis {
    pub index: usize,
    pub raw_word: String,
    pub is_valid_bip39: bool,
    pub is_placeholder: bool,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct TargetAddressMatch {
    #[zeroize(skip)]
    pub position_index: usize,
    pub word: String,
    pub phrase: String,
    pub matched_address: String,
    pub chain_family: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionCandidateGroup {
    pub position_index: usize,
    pub candidate_count: usize,
    pub sample_words: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotCandidateWord {
    pub word: String,
    pub position_index: usize,
    pub full_phrase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MnemonicRepairResult {
    pub total_words: usize,
    pub is_length_valid: bool,
    pub has_invalid_words: bool,
    pub is_checksum_valid: bool,
    pub is_single_word_missing: bool,
    pub missing_word_index: Option<usize>,
    pub candidate_valid_words: Vec<String>,
    pub words: Vec<WordAnalysis>,
    pub auto_repaired_phrases: Vec<String>,
    pub target_match: Option<TargetAddressMatch>,
    pub position_candidates: Vec<PositionCandidateGroup>,
    pub all_slot_candidates: Vec<SlotCandidateWord>,
    pub is_dual_word_missing: bool,
    pub missing_word_indices: Vec<usize>,
    pub dual_word_combinations_tested: usize,
    pub dual_word_solutions_count: usize,
    pub detected_language: String,
    pub is_transposition_detected: bool,
    pub transposed_indices: Option<(usize, usize)>,
}
