use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Instant;
use rayon::prelude::*;

use crate::core::wallets::repair::{
    check_target_match, detect_mnemonic_language, fast_validate_12_words, TargetAddressMatch,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySessionStatusResponse {
    pub session_id: String,
    pub id: String, // Alias for backward compatibility with frontend rec.id
    pub status: String,
    pub current_index: usize,
    pub total_combinations: usize,
    pub percent: f64,
    pub solutions_count: usize,
    pub speed_cps: f64, // combinations per second
    pub eta_seconds: Option<f64>,
    pub target_match: Option<TargetAddressMatch>,
    pub recent_solutions: Vec<String>,
}

// Global active session tracker in RAM (100% Zero-Disk)
static ACTIVE_SESSION_ID: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
static ACTIVE_RAW_PHRASE: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
static ACTIVE_TARGET_ADDR: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
static PAUSE_FLAG: AtomicBool = AtomicBool::new(false);
static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);
static CURRENT_INDEX: AtomicUsize = AtomicUsize::new(0);
static SESSION_START_INDEX: AtomicUsize = AtomicUsize::new(0);
static SOLUTIONS_COUNT: AtomicUsize = AtomicUsize::new(0);
static TOTAL_COMBINATIONS: AtomicUsize = AtomicUsize::new(0);
static SESSION_GENERATION: AtomicUsize = AtomicUsize::new(0);
static SESSION_START_TIME: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);
static CACHED_TARGET_MATCH: std::sync::Mutex<Option<TargetAddressMatch>> =
    std::sync::Mutex::new(None);
static CACHED_SOLUTIONS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

/// Resilient lock acquisition that recovers gracefully from poisoned mutexes
#[inline]
pub fn safe_lock<T>(mutex: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn get_current_active_session_id() -> Option<String> {
    safe_lock(&ACTIVE_SESSION_ID).clone()
}

pub fn start_in_memory_session(
    phrase: String,
    target_address: Option<String>,
) -> Result<RecoverySessionStatusResponse, String> {
    // Purge any lingering secrets/solutions from previous sessions (Z5)
    clear_session_secrets();

    let session_id = format!("ses_{}", hex::encode(rand::random::<[u8; 8]>()));

    let tokens: Vec<&str> = phrase.split_whitespace().collect();
    let mut missing_count = 0;
    for t in &tokens {
        if crate::core::wallets::repair::is_placeholder_token(t) {
            missing_count += 1;
        }
    }
    let is_single_missing = (tokens.len() == 12 && missing_count == 1)
        || (tokens.len() == 11 && missing_count == 0);
    let is_all_66_pairs = tokens.len() == 10 && missing_count == 0;
    let total_combinations = if is_single_missing {
        2048
    } else if is_all_66_pairs {
        66 * 4_194_304
    } else {
        4_194_304
    };

    let generation = SESSION_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    // Store in-memory session parameters
    {
        *safe_lock(&ACTIVE_SESSION_ID) = Some(session_id.clone());
        *safe_lock(&ACTIVE_RAW_PHRASE) = Some(phrase.clone());
        *safe_lock(&ACTIVE_TARGET_ADDR) = target_address.clone();
        PAUSE_FLAG.store(false, Ordering::SeqCst);
        CANCEL_FLAG.store(false, Ordering::SeqCst);
        CURRENT_INDEX.store(0, Ordering::SeqCst);
        SESSION_START_INDEX.store(0, Ordering::SeqCst);
        SOLUTIONS_COUNT.store(0, Ordering::SeqCst);
        TOTAL_COMBINATIONS.store(total_combinations, Ordering::SeqCst);
        *safe_lock(&SESSION_START_TIME) = Some(Instant::now());
        *safe_lock(&CACHED_TARGET_MATCH) = None;
        safe_lock(&CACHED_SOLUTIONS).clear();
    }

    run_dual_word_session_worker(
        session_id.clone(),
        phrase,
        target_address,
        0,
        total_combinations,
        generation,
    );

    Ok(RecoverySessionStatusResponse {
        session_id: session_id.clone(),
        id: session_id,
        status: "running".to_string(),
        current_index: 0,
        total_combinations,
        percent: 0.0,
        solutions_count: 0,
        speed_cps: 0.0,
        eta_seconds: None,
        target_match: None,
        recent_solutions: Vec::new(),
    })
}

pub fn request_pause_session(session_id: &str) -> Result<bool, String> {
    let active = safe_lock(&ACTIVE_SESSION_ID);
    if active.as_deref() == Some(session_id) {
        PAUSE_FLAG.store(true, Ordering::SeqCst);
        Ok(true)
    } else {
        Err(format!(
            "Session {} is not actively running in memory",
            session_id
        ))
    }
}

pub fn request_resume_session(session_id: &str) -> Result<bool, String> {
    let active = safe_lock(&ACTIVE_SESSION_ID);
    if active.as_deref() != Some(session_id) {
        return Err(format!("Session {} is not active in memory", session_id));
    }
    drop(active);

    let phrase = safe_lock(&ACTIVE_RAW_PHRASE)
        .clone()
        .ok_or_else(|| "Session phrase expired from RAM".to_string())?;
    let target = safe_lock(&ACTIVE_TARGET_ADDR).clone();
    let current_idx = CURRENT_INDEX.load(Ordering::SeqCst);
    let total = TOTAL_COMBINATIONS.load(Ordering::SeqCst);

    // Invalidate previous thread by bumping generation counter
    PAUSE_FLAG.store(true, Ordering::SeqCst);
    let generation = SESSION_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    PAUSE_FLAG.store(false, Ordering::SeqCst);
    CANCEL_FLAG.store(false, Ordering::SeqCst);

    run_dual_word_session_worker(
        session_id.to_string(),
        phrase,
        target,
        current_idx,
        total,
        generation,
    );

    Ok(true)
}

pub fn clear_session_secrets() {
    {
        let mut phrase = safe_lock(&ACTIVE_RAW_PHRASE);
        if let Some(ref mut p) = *phrase {
            crate::core::security::memory::secure_zero_string(p);
        }
        *phrase = None;
    }
    {
        let mut target = safe_lock(&ACTIVE_TARGET_ADDR);
        if let Some(ref mut t) = *target {
            crate::core::security::memory::secure_zero_string(t);
        }
        *target = None;
    }
    {
        let mut match_guard = safe_lock(&CACHED_TARGET_MATCH);
        if let Some(ref mut m) = *match_guard {
            crate::core::security::memory::secure_zero_string(&mut m.phrase);
        }
        *match_guard = None;
    }
    {
        let mut sols = safe_lock(&CACHED_SOLUTIONS);
        for s in sols.iter_mut() {
            crate::core::security::memory::secure_zero_string(s);
        }
        sols.clear();
    }
}

/// Clear only the active raw input phrase from RAM on normal worker completion,
/// preserving cached solutions and target matches for frontend polling (R1 Deliver-then-Wipe)
pub fn clear_active_phrase_secret() {
    let mut phrase = safe_lock(&ACTIVE_RAW_PHRASE);
    if let Some(ref mut p) = *phrase {
        crate::core::security::memory::secure_zero_string(p);
    }
    *phrase = None;
}

pub fn request_cancel_session(session_id: &str) -> Result<bool, String> {
    let active = safe_lock(&ACTIVE_SESSION_ID);
    if active.as_deref() == Some(session_id) {
        CANCEL_FLAG.store(true, Ordering::SeqCst);
        clear_session_secrets();
        Ok(true)
    } else {
        Err(format!(
            "Session {} is not actively running in memory",
            session_id
        ))
    }
}

pub fn clear_recovery_session(session_id: &str) -> Result<bool, String> {
    let mut active = safe_lock(&ACTIVE_SESSION_ID);
    let is_match = active.as_deref() == Some(session_id);
    if !(is_match || (session_id.is_empty() && active.is_some())) {
        return Ok(false); // Stale session id from previous session or no active session; do not touch state!
    }
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    SESSION_GENERATION.fetch_add(1, Ordering::SeqCst);
    SESSION_START_INDEX.store(0, Ordering::SeqCst);
    *active = None;
    drop(active);
    clear_session_secrets();
    Ok(true)
}

pub fn get_live_session_status(session_id: &str) -> Result<RecoverySessionStatusResponse, String> {
    let active = safe_lock(&ACTIVE_SESSION_ID).clone();
    let is_active = active.as_deref() == Some(session_id);

    if is_active {
        let current_idx = CURRENT_INDEX.load(Ordering::Relaxed);
        let total = TOTAL_COMBINATIONS.load(Ordering::Relaxed);
        let sol_cnt = SOLUTIONS_COUNT.load(Ordering::Relaxed);

        let elapsed = safe_lock(&SESSION_START_TIME)
            .map(|t| t.elapsed().as_secs_f64())
            .unwrap_or(0.0);

        let start_idx = SESSION_START_INDEX.load(Ordering::Relaxed);
        let processed_since_start = current_idx.saturating_sub(start_idx);
        let speed = if elapsed > 0.1 {
            processed_since_start as f64 / elapsed
        } else {
            0.0
        };

        let percent = if total > 0 {
            ((current_idx as f64 / total as f64) * 100.0).min(100.0)
        } else {
            0.0
        };

        let remaining = total.saturating_sub(current_idx);
        let eta = if speed > 10.0 && remaining > 0 {
            Some(remaining as f64 / speed)
        } else {
            None
        };

        let target_match = safe_lock(&CACHED_TARGET_MATCH).clone();
        let cached_sols = safe_lock(&CACHED_SOLUTIONS).clone();

        let status_str = if CANCEL_FLAG.load(Ordering::SeqCst) {
            "cancelled".to_string()
        } else if PAUSE_FLAG.load(Ordering::SeqCst) {
            "paused".to_string()
        } else if current_idx >= total && total > 0 {
            "completed".to_string()
        } else {
            "running".to_string()
        };

        Ok(RecoverySessionStatusResponse {
            session_id: session_id.to_string(),
            id: session_id.to_string(),
            status: status_str,
            current_index: current_idx,
            total_combinations: total,
            percent,
            solutions_count: sol_cnt,
            speed_cps: speed,
            eta_seconds: eta,
            target_match,
            recent_solutions: cached_sols,
        })
    } else {
        Err(format!("Session {} is not active in RAM", session_id))
    }
}

/// Execute interruptible dual-word solver loop in pure RAM
pub fn run_dual_word_session_worker(
    session_id: String,
    raw_phrase: String,
    target_address: Option<String>,
    start_from_index: usize,
    total_combinations: usize,
    generation: usize,
) {
    // Synchronously initialize/bind active session tracker in calling thread BEFORE spawning worker thread (F11)
    {
        *safe_lock(&ACTIVE_SESSION_ID) = Some(session_id.clone());
        PAUSE_FLAG.store(false, Ordering::SeqCst);
        CANCEL_FLAG.store(false, Ordering::SeqCst);
        CURRENT_INDEX.store(start_from_index, Ordering::SeqCst);
        SESSION_START_INDEX.store(start_from_index, Ordering::SeqCst);
        TOTAL_COMBINATIONS.store(total_combinations, Ordering::SeqCst);
        *safe_lock(&SESSION_START_TIME) = Some(Instant::now());
    }

    std::thread::spawn(move || {
        // Fast abort if this worker thread was cancelled or superseded before starting
        if SESSION_GENERATION.load(Ordering::SeqCst) != generation || CANCEL_FLAG.load(Ordering::SeqCst) {
            return;
        }

        // Parse words & identify missing slot positions
        let tokens: Vec<&str> = raw_phrase.split_whitespace().collect();
        let (lang, _) = detect_mnemonic_language(&tokens);
        let word_list = lang.word_list();

        let mut missing_word_indices = Vec::new();
        for (i, t) in tokens.iter().enumerate() {
            if crate::core::wallets::repair::is_placeholder_token(t) {
                missing_word_indices.push(i);
            }
        }

        // If user entered 11 words without placeholder, the 12th slot (index 11) is missing
        if tokens.len() == 11 && missing_word_indices.is_empty() {
            missing_word_indices.push(11);
        } else if tokens.len() == 11 && missing_word_indices.len() == 1 {
            // 10 words + 1 placeholder: both the placeholder and the omitted 12th slot (index 11) are missing
            missing_word_indices.push(11);
        }

        let is_all_66_pairs = tokens.len() == 10 && missing_word_indices.is_empty();
        let all_pairs: Vec<(usize, usize)> = if is_all_66_pairs {
            let mut pairs = Vec::with_capacity(66);
            for p in 0..11 {
                pairs.push((p, p + 1));
            }
            for p1 in 0..11 {
                for p2 in (p1 + 1)..12 {
                    if !pairs.contains(&(p1, p2)) {
                        pairs.push((p1, p2));
                    }
                }
            }
            pairs
        } else if missing_word_indices.len() == 2 {
            vec![(missing_word_indices[0], missing_word_indices[1])]
        } else if missing_word_indices.len() == 1 {
            vec![(missing_word_indices[0], 0)]
        } else {
            vec![(10, 11)]
        };

        let clean_target = target_address.as_ref().map(|s| s.trim().to_string());
        let mut found_target_match: Option<TargetAddressMatch> =
            safe_lock(&CACHED_TARGET_MATCH).clone();

        let extract_base_indices =
            |tokens: &[&str], missing: &[usize], wlist: &[&'static str]| -> [u16; 12] {
                let mut base_indices = [0u16; 12];
                if tokens.len() == 12 {
                    for (i, &t) in tokens.iter().enumerate() {
                        if !missing.contains(&i) {
                            if let Some(pos) = wlist.iter().position(|&item| item == t) {
                                base_indices[i] = pos as u16;
                            }
                        }
                    }
                } else {
                    let non_ph: Vec<&str> = tokens
                        .iter()
                        .copied()
                        .filter(|&t| !crate::core::wallets::repair::is_placeholder_token(t))
                        .collect();
                    let mut orig_idx = 0;
                    for (i, val) in base_indices.iter_mut().enumerate() {
                        if !missing.contains(&i) && orig_idx < non_ph.len() {
                            let t = non_ph[orig_idx];
                            orig_idx += 1;
                            if let Some(pos) = wlist.iter().position(|&item| item == t) {
                                *val = pos as u16;
                            }
                        }
                    }
                }
                base_indices
            };

        let assemble_phrase = |indices: &[u16; 12]| -> zeroize::Zeroizing<String> {
            let mut phrase = String::with_capacity(120);
            for (i, &idx) in indices.iter().enumerate() {
                if i > 0 {
                    phrase.push(' ');
                }
                phrase.push_str(word_list[idx as usize]);
            }
            zeroize::Zeroizing::new(phrase)
        };

        if missing_word_indices.len() == 1 {
            let p1 = missing_word_indices[0];
            let base_indices = extract_base_indices(&tokens, &missing_word_indices, word_list);

            'outer1: for w1 in 0..2048u16 {
                if (w1 as usize) < start_from_index {
                    continue;
                }

                CURRENT_INDEX.store((w1 as usize) + 1, Ordering::Relaxed);

                let mut test_indices = base_indices;
                test_indices[p1] = w1;

                if fast_validate_12_words(&test_indices) {
                    let phrase = assemble_phrase(&test_indices);

                    {
                        let mut guard = safe_lock(&CACHED_SOLUTIONS);
                        if guard.len() < 1000 {
                            guard.push(phrase.to_string());
                        }
                    }
                    SOLUTIONS_COUNT.fetch_add(1, Ordering::Relaxed);

                    if found_target_match.is_none() {
                        if let Some(ref target) = clean_target {
                            if let Some(m) =
                                check_target_match(target, &phrase, p1, word_list[w1 as usize])
                            {
                                found_target_match = Some(m.clone());
                                *safe_lock(&CACHED_TARGET_MATCH) = Some(m);
                            }
                        }
                    }
                }

                if PAUSE_FLAG.load(Ordering::Relaxed)
                    || CANCEL_FLAG.load(Ordering::Relaxed)
                    || SESSION_GENERATION.load(Ordering::Relaxed) != generation
                {
                    break 'outer1;
                }
            }
        } else {
            'outer_all_pairs: for (pair_idx, &(p1, p2)) in all_pairs.iter().enumerate() {
                let pair_offset = pair_idx * 4_194_304;
                if pair_offset + 4_194_304 <= start_from_index {
                    continue 'outer_all_pairs;
                }
                if PAUSE_FLAG.load(Ordering::Relaxed)
                    || CANCEL_FLAG.load(Ordering::Relaxed)
                    || SESSION_GENERATION.load(Ordering::Relaxed) != generation
                {
                    break 'outer_all_pairs;
                }

                let base_indices = extract_base_indices(&tokens, &[p1, p2], word_list);

                let start_w1 = if start_from_index > pair_offset {
                    ((start_from_index - pair_offset) / 2048).min(2048) as u16
                } else {
                    0
                };

                let clean_target_ref = clean_target.as_deref();

                (start_w1..2048u16).into_par_iter().for_each(|w1| {
                    if PAUSE_FLAG.load(Ordering::Relaxed)
                        || CANCEL_FLAG.load(Ordering::Relaxed)
                        || SESSION_GENERATION.load(Ordering::Relaxed) != generation
                    {
                        return;
                    }

                    let mut test_indices = base_indices;
                    test_indices[p1] = w1;

                    let start_w2 = if w1 == start_w1 && start_from_index > pair_offset {
                        ((start_from_index - pair_offset) % 2048) as u16
                    } else {
                        0
                    };

                    let mut count_tested = 0usize;

                    for w2 in start_w2..2048u16 {
                        if PAUSE_FLAG.load(Ordering::Relaxed)
                            || CANCEL_FLAG.load(Ordering::Relaxed)
                            || SESSION_GENERATION.load(Ordering::Relaxed) != generation
                        {
                            break;
                        }

                        test_indices[p2] = w2;
                        count_tested += 1;

                        if fast_validate_12_words(&test_indices) {
                            let phrase = assemble_phrase(&test_indices);

                            {
                                let mut guard = safe_lock(&CACHED_SOLUTIONS);
                                if guard.len() < 1000 {
                                    guard.push(phrase.to_string());
                                }
                            }
                            SOLUTIONS_COUNT.fetch_add(1, Ordering::Relaxed);

                            if let Some(target) = clean_target_ref {
                                let has_match = safe_lock(&CACHED_TARGET_MATCH).is_some();
                                if !has_match {
                                    if let Some(m) = check_target_match(
                                        target,
                                        &phrase,
                                        p1,
                                        word_list[w1 as usize],
                                    ) {
                                        *safe_lock(&CACHED_TARGET_MATCH) = Some(m);
                                    }
                                }
                            }
                        }
                    }

                    CURRENT_INDEX.fetch_add(count_tested, Ordering::Relaxed);
                });

                if PAUSE_FLAG.load(Ordering::Relaxed)
                    || CANCEL_FLAG.load(Ordering::Relaxed)
                    || SESSION_GENERATION.load(Ordering::Relaxed) != generation
                {
                    break 'outer_all_pairs;
                }
            }
        }

        // Deliver-then-Wipe (R1) with Generation Protection (K6/T1):
        // Only the worker matching the active generation is allowed to touch memory state
        if SESSION_GENERATION.load(Ordering::SeqCst) == generation {
            if CANCEL_FLAG.load(Ordering::SeqCst) {
                clear_session_secrets();
            } else if !PAUSE_FLAG.load(Ordering::SeqCst) {
                clear_active_phrase_secret();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn test_in_memory_recovery_session_lifecycle() {
        let _guard = safe_lock(&TEST_LOCK);
        let phrase =
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ? ?"
                .to_string();
        let res = start_in_memory_session(phrase, None).unwrap();
        assert_eq!(res.status, "running");
        assert_eq!(res.total_combinations, 4_194_304);

        // Check live status
        let status = get_live_session_status(&res.session_id).unwrap();
        assert!(status.status == "running" || status.status == "completed");

        // Test Pause
        let pause_res = request_pause_session(&res.session_id).unwrap();
        assert!(pause_res);

        // Test Resume
        let resume_res = request_resume_session(&res.session_id).unwrap();
        assert!(resume_res);

        // Test Cancel
        let cancel_res = request_cancel_session(&res.session_id).unwrap();
        assert!(cancel_res);
        let _ = clear_recovery_session(&res.session_id);
    }

    #[test]
    fn test_deliver_then_wipe_preserves_solutions_on_fast_complete() {
        let _guard = safe_lock(&TEST_LOCK);
        // 1 missing word = 2048 combinations, completes quickly
        let phrase =
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ?"
                .to_string();
        let res = start_in_memory_session(phrase, None).unwrap();

        // Deterministic polling with timeout instead of fixed sleep
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            let status = get_live_session_status(&res.session_id).unwrap();
            if status.status == "completed" {
                assert!(status.solutions_count > 0);
                assert!(!status.recent_solutions.is_empty());
                assert!(safe_lock(&ACTIVE_RAW_PHRASE).is_none());
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "Worker timeout: did not complete within 10s"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        // Now verify frontend explicit cleanup wipes everything
        let clear_res = clear_recovery_session(&res.session_id).unwrap();
        assert!(clear_res);
        assert!(safe_lock(&CACHED_SOLUTIONS).is_empty());
        assert!(safe_lock(&CACHED_TARGET_MATCH).is_none());
    }

    #[test]
    fn test_eleven_words_without_placeholder_completes_2048_combinations() {
        let _guard = safe_lock(&TEST_LOCK);
        // 11 words without placeholder -> auto-detects missing 12th word, exactly 2048 combinations
        let phrase =
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon"
                .to_string();
        let res = start_in_memory_session(phrase, None).unwrap();
        assert_eq!(res.total_combinations, 2048);

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            let status = get_live_session_status(&res.session_id).unwrap();
            if status.status == "completed" {
                assert_eq!(status.total_combinations, 2048);
                assert_eq!(status.current_index, 2048);
                assert_eq!(status.percent, 100.0);
                assert!(status.solutions_count > 0);
                assert!(!status.recent_solutions.is_empty());
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "Worker timeout: 11 words recovery did not complete in 10s"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        let clear_res = clear_recovery_session(&res.session_id).unwrap();
        assert!(clear_res);
    }
}

