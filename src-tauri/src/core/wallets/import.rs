use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::path::PathBuf;

#[derive(Serialize)]
pub struct NativeFileContent {
    pub path: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct NativeScanResult {
    pub folder_name: String,
    pub total_files_visited: usize,
    pub text_files_read: usize,
    pub skipped_count: usize,
    pub files: Vec<NativeFileContent>,
}

#[inline(always)]
fn is_b58_char(b: u8) -> bool {
    matches!(b, b'1'..=b'9' | b'A'..=b'H' | b'J'..=b'N' | b'P'..=b'Z' | b'a'..=b'k' | b'm'..=b'z')
}

fn has_wallet_candidate(content: &str) -> bool {
    let bytes = content.as_bytes();
    if bytes.len() < 32 {
        return false;
    }

    let has_keyword = content.lines().take(250).any(|line| {
        let sample_lower = line.to_lowercase();
        sample_lower.contains("private_key")
            || sample_lower.contains("privatekey")
            || sample_lower.contains("secret_key")
            || sample_lower.contains("secretkey")
            || sample_lower.contains("seed_phrase")
            || sample_lower.contains("seedphrase")
            || sample_lower.contains("mnemonic")
            || sample_lower.contains("bip39")
            || sample_lower.contains("wallet_key")
    });
    if has_keyword {
        return true;
    }

    let mut consecutive_hex = 0;
    for &b in bytes {
        if b.is_ascii_hexdigit() {
            consecutive_hex += 1;
            if consecutive_hex == 64 {
                return true;
            }
        } else {
            consecutive_hex = 0;
        }
    }

    let mut consecutive_b58 = 0;
    for &b in bytes {
        if is_b58_char(b) {
            consecutive_b58 += 1;
            if (44..=88).contains(&consecutive_b58) {
                return true;
            }
        } else {
            consecutive_b58 = 0;
        }
    }

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.len() >= 40 && trimmed.len() <= 600 {
            let mut alpha_words = 0;
            for token in trimmed.split(|c: char| !c.is_ascii_alphabetic()) {
                if token.len() >= 3 && token.len() <= 10 {
                    alpha_words += 1;
                }
            }
            if (12..=28).contains(&alpha_words) {
                return true;
            }
        }
    }

    false
}

pub async fn scan_directory_native(path: String) -> Result<NativeScanResult, String> {
    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&path);
        if !root.exists() || !root.is_dir() {
            return Err("Selected folder does not exist or is not a directory".to_string());
        }

        let folder_name = root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("folder")
            .to_string();

        let system_ignored_dirs: HashSet<&'static str> =
            ["$recycle.bin", "system volume information"]
                .into_iter()
                .collect();

        let ignored_binary_exts: HashSet<&'static str> = [
            "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svg", "mp4", "mp3", "wav", "avi",
            "mov", "mkv", "flac", "ogg", "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso",
            "exe", "dll", "sys", "so", "dylib", "bin", "msi", "deb", "rpm", "apk", "dmg", "ttf",
            "woff", "woff2", "eot", "otf", "o", "obj", "lib", "a", "rlib", "rmeta", "pdb", "class",
            "pyc", "sqlite3", "db", "pack", "idx", "pak", "node", "wasm",
        ]
        .into_iter()
        .collect();

        const MAX_CANDIDATES: usize = 5000;
        const MAX_FILE_SIZE: u64 = 512 * 1024;
        const MAX_SEARCH_DEPTH: usize = 35;

        let mut queue: VecDeque<(PathBuf, usize)> = VecDeque::new();
        queue.push_back((root, 0));

        let mut files: Vec<NativeFileContent> = Vec::new();
        let mut total_files_visited: usize = 0;
        let mut skipped_count: usize = 0;

        while let Some((current_dir, depth)) = queue.pop_front() {
            if files.len() >= MAX_CANDIDATES {
                break;
            }

            if depth > MAX_SEARCH_DEPTH {
                continue;
            }

            let entries = match std::fs::read_dir(&current_dir) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                if files.len() >= MAX_CANDIDATES {
                    break;
                }

                let p = entry.path();
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

                if is_dir {
                    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                        let lower = name.to_lowercase();
                        if !system_ignored_dirs.contains(lower.as_str()) {
                            queue.push_back((p, depth + 1));
                        } else {
                            skipped_count += 1;
                        }
                    }
                } else {
                    total_files_visited += 1;
                    let extension = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|s| s.to_lowercase());

                    if let Some(ref ext) = extension {
                        if ignored_binary_exts.contains(ext.as_str()) {
                            skipped_count += 1;
                            continue;
                        }
                    }

                    let meta = entry.metadata().ok();
                    let size = meta.map(|m| m.len()).unwrap_or(0);

                    if size > 0 && size <= MAX_FILE_SIZE {
                        if let Ok(content) = std::fs::read_to_string(&p) {
                            let trimmed = content.trim();
                            if !trimmed.is_empty() && !trimmed.contains('\0') {
                                if has_wallet_candidate(trimmed) {
                                    files.push(NativeFileContent {
                                        path: p.to_string_lossy().to_string(),
                                        content,
                                    });
                                } else {
                                    skipped_count += 1;
                                }
                            } else {
                                skipped_count += 1;
                            }
                        } else {
                            skipped_count += 1;
                        }
                    } else {
                        skipped_count += 1;
                    }
                }
            }
        }

        let text_files_read = files.len();

        Ok(NativeScanResult {
            folder_name,
            total_files_visited,
            text_files_read,
            skipped_count,
            files,
        })
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}
