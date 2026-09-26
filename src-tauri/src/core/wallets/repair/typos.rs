use bip39::Language;

pub const SUPPORTED_LANGUAGES: [(Language, &str); 10] = [
    (Language::English, "english"),
    (Language::Spanish, "spanish"),
    (Language::French, "french"),
    (Language::Italian, "italian"),
    (Language::Portuguese, "portuguese"),
    (Language::Czech, "czech"),
    (Language::Japanese, "japanese"),
    (Language::Korean, "korean"),
    (Language::SimplifiedChinese, "simplified_chinese"),
    (Language::TraditionalChinese, "traditional_chinese"),
];

/// Compute Levenshtein distance between two lowercase strings
pub fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let m = a_chars.len();
    let n = b_chars.len();

    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }

    let mut dp = vec![vec![0usize; n + 1]; m + 1];

    for (i, row) in dp.iter_mut().enumerate() {
        row[0] = i;
    }
    for (j, val) in dp[0].iter_mut().enumerate() {
        *val = j;
    }

    for i in 1..=m {
        for j in 1..=n {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            dp[i][j] = (dp[i - 1][j] + 1) // deletion
                .min(dp[i][j - 1] + 1) // insertion
                .min(dp[i - 1][j - 1] + cost); // substitution
        }
    }

    dp[m][n]
}

/// Check if a token is an intentional placeholder indicating a missing/unknown word
pub fn is_placeholder_token(token: &str) -> bool {
    let s = token.trim().to_lowercase();
    matches!(
        s.as_str(),
        "?" | "*" | "_" | "x" | "missing" | "unknown" | "blank" | "none" | "null" | "???"
    )
}

/// Automatically detect the most likely BIP-39 dictionary language based on input tokens
pub fn detect_mnemonic_language(tokens: &[&str]) -> (Language, &'static str) {
    if tokens.is_empty() {
        return (Language::English, "english");
    }

    let mut best_lang = Language::English;
    let mut best_name = "english";
    let mut max_matches = 0;

    for &(lang, name) in &SUPPORTED_LANGUAGES {
        let list = lang.word_list();
        let matches = tokens
            .iter()
            .filter(|&&t| {
                let clean = t.to_lowercase();
                list.contains(&clean.as_str())
            })
            .count();

        if matches > max_matches {
            max_matches = matches;
            best_lang = lang;
            best_name = name;
        }
    }

    (best_lang, best_name)
}

/// Find closest BIP-39 words for a given input word and language
pub fn suggest_bip39_words_for_lang(
    raw_word: &str,
    max_suggestions: usize,
    lang: Language,
) -> Vec<String> {
    let normalized = raw_word.trim().to_lowercase();
    if normalized.is_empty() || is_placeholder_token(&normalized) {
        return Vec::new();
    }

    let word_list = lang.word_list();

    // If exact match exists, return it immediately
    if word_list.contains(&normalized.as_str()) {
        return vec![normalized];
    }

    // Collect words with their distances
    let mut candidates: Vec<(usize, &str)> = word_list
        .iter()
        .map(|&w| (levenshtein_distance(&normalized, w), w))
        .filter(|(dist, _)| *dist <= 2) // only close typos (distance 1 or 2)
        .collect();

    // Sort by smallest distance first, then alphabetically
    candidates.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(b.1)));

    candidates
        .into_iter()
        .take(max_suggestions)
        .map(|(_, w)| w.to_string())
        .collect()
}

/// Find closest BIP-39 words (defaults to English for backwards compatibility)
pub fn suggest_bip39_words(raw_word: &str, max_suggestions: usize) -> Vec<String> {
    suggest_bip39_words_for_lang(raw_word, max_suggestions, Language::English)
}
