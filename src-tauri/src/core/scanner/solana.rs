use crate::adapters::solana::client::*;
use crate::adapters::solana::tokens::*;
use crate::core::scanner::DiscoveredToken;
use crate::core::scanner::WalletChainResult;
use futures::StreamExt;
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Default)]
struct SolanaTokenMetadata {
    symbol: String,
    name: String,
    logo_url: Option<String>,
}

#[derive(Clone)]
struct CachedSolanaTokenMetadata {
    expires_at: Instant,
    metadata: SolanaTokenMetadata,
}

static SOLANA_TOKEN_METADATA_CACHE: OnceLock<Mutex<HashMap<String, CachedSolanaTokenMetadata>>> =
    OnceLock::new();

fn format_spl_units(amount: u64, decimals: u8) -> String {
    let raw = amount.to_string();
    let scale = usize::from(decimals);
    if scale == 0 {
        return raw;
    }
    let (whole, fraction) = if raw.len() > scale {
        let split_at = raw.len() - scale;
        (raw[..split_at].to_string(), raw[split_at..].to_string())
    } else {
        ("0".to_string(), format!("{}{}", "0".repeat(scale - raw.len()), raw))
    };
    let fraction = fraction.trim_end_matches('0');
    if fraction.is_empty() {
        return whole;
    }
    const MAX_DISPLAY_DECIMALS: usize = 24;
    let shown = &fraction[..fraction.len().min(MAX_DISPLAY_DECIMALS)];
    let truncated = fraction.len() > MAX_DISPLAY_DECIMALS;
    format!("{whole}.{shown}{}", if truncated { "…" } else { "" })
}

pub async fn scan_solana_for_wallet(
    client: &reqwest::Client,
    address: &str,
    rpcs: &[&str],
    wallet_id: i64,
) -> Result<WalletChainResult, String> {
    let mut last_err = "All Solana RPCs failed".to_string();

    for rpc in rpcs {
        let native_payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": [address, {"commitment": "confirmed"}]
        });

        let post_native = client
            .post(*rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&native_payload)
            .send()
            .await;

        if let Ok(res1) = post_native {
            if res1.status().is_success() {
                if let Ok(data1) = res1.json::<serde_json::Value>().await {
                    let Some(lamports) = data1
                        .pointer("/result/value")
                        .and_then(|value| value.as_u64())
                    else {
                        last_err = format!("RPC {rpc} returned an invalid Solana getBalance response");
                        continue;
                    };
                    let (sol_amt, display_str) = format_sol_display(lamports);
                    let mut has_funds = sol_amt > 0.0;
                    let mut tokens = Vec::new();

                    let token_programs = [
                        ("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "SPL Token"),
                        ("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "Token-2022"),
                    ];

                    struct RawAccount {
                        mint: String,
                        amount_raw: String,
                        decimals: u8,
                        default_type: &'static str,
                    }

                    let mut raw_accounts = Vec::new();
                    let mut token_scan_complete = true;

                    for (prog_id, default_type) in token_programs {
                        let spl_res = client
                            .post(*rpc)
                            .header("Content-Type", "application/json")
                            .header("User-Agent", "Plurivex/1.0")
                            .json(&serde_json::json!({
                                "jsonrpc": "2.0",
                                "id": 2,
                                "method": "getTokenAccountsByOwner",
                                "params": [
                                    address,
                                    {"programId": prog_id},
                                    {"encoding": "jsonParsed"}
                                ]
                            }))
                            .send()
                            .await;

                        let Ok(spl_response) = spl_res else {
                            token_scan_complete = false;
                            continue;
                        };
                        if !spl_response.status().is_success() {
                            token_scan_complete = false;
                            continue;
                        }
                        let Ok(spl_data) = spl_response.json::<serde_json::Value>().await else {
                            token_scan_complete = false;
                            continue;
                        };
                        let Some(accounts) = spl_data
                            .get("result")
                            .and_then(|result| result.get("value"))
                            .and_then(|value| value.as_array())
                        else {
                            token_scan_complete = false;
                            continue;
                        };

                        for account in accounts {
                            let info = account
                                .get("account")
                                .and_then(|account| account.get("data"))
                                .and_then(|data| data.get("parsed"))
                                .and_then(|parsed| parsed.get("info"));
                            let Some(info) = info else {
                                token_scan_complete = false;
                                continue;
                            };
                            let Some(mint) = info.get("mint").and_then(|value| value.as_str()) else {
                                token_scan_complete = false;
                                continue;
                            };
                            let token_amount = info.get("tokenAmount");
                            let Some(amount_raw) = token_amount
                                .and_then(|amount| amount.get("amount"))
                                .and_then(|amount| amount.as_str())
                            else {
                                token_scan_complete = false;
                                continue;
                            };
                            let Ok(raw_amount_value) = amount_raw.parse::<u64>() else {
                                token_scan_complete = false;
                                continue;
                            };
                            let Some(decimals) = token_amount
                                .and_then(|amount| amount.get("decimals"))
                                .and_then(|value| value.as_u64())
                                .and_then(|value| u8::try_from(value).ok())
                            else {
                                token_scan_complete = false;
                                continue;
                            };
                            if raw_amount_value > 0 && !mint.is_empty() {
                                has_funds = true;
                                raw_accounts.push(RawAccount {
                                    mint: mint.to_string(),
                                    amount_raw: amount_raw.to_string(),
                                    decimals,
                                    default_type,
                                });
                            }
                        }
                    }

                    // Never persist an empty token list when an RPC failed to read
                    // either token program; that would erase previously detected SPL assets.
                    if !token_scan_complete {
                        last_err = format!("RPC {rpc} failed to read all Solana token programs");
                        continue;
                    }

                    // Resolve metadata for every mint, not just unknown ones, so existing tokens
                    // can also acquire logos. The metadata cache bounds repeated network cost.
                    let metadata_mints: Vec<String> = raw_accounts
                        .iter()
                        .map(|acc| acc.mint.clone())
                        .collect::<std::collections::HashSet<_>>()
                        .into_iter()
                        .collect();
                    let resolved_meta =
                        resolve_solana_token_metas(client, rpc, &metadata_mints).await;

                    for acc in raw_accounts {
                        let (known_sym, known_name) = solana_token_meta(&acc.mint);
                        let (symbol, name) = if !known_sym.is_empty() {
                            (known_sym.to_string(), known_name.to_string())
                        } else if let Some(metadata) = resolved_meta
                            .get(&acc.mint)
                            .filter(|metadata| !metadata.symbol.is_empty())
                        {
                            let n = if !metadata.name.is_empty() {
                                metadata.name.clone()
                            } else {
                                acc.default_type.to_string()
                            };
                            (metadata.symbol.clone(), n)
                        } else {
                            let start = &acc.mint[..acc.mint.len().min(4)];
                            let end = if acc.mint.len() > 4 {
                                &acc.mint[acc.mint.len() - 4..]
                            } else {
                                ""
                            };
                            (format!("{start}..{end}"), acc.default_type.to_string())
                        };

                        let raw_amount = acc.amount_raw.parse::<u64>().unwrap_or(0);
                        let formatted = format!("{} {}", format_spl_units(raw_amount, acc.decimals), symbol);

                        let logo_url = resolved_meta
                            .get(&acc.mint)
                            .and_then(|metadata| metadata.logo_url.clone());
                        tokens.push(DiscoveredToken {
                            wallet_id,
                            chain: "sol".to_string(),
                            symbol,
                            name,
                            balance: formatted,
                            raw_balance: acc.amount_raw,
                            contract_address: acc.mint,
                            decimals: acc.decimals,
                            logo_url,
                        });
                    }

                    return Ok(WalletChainResult {
                        wallet_id,
                        chain_key: "sol".to_string(),
                        native_balance: display_str,
                        has_funds,
                        tokens,
                    });
                }
            }
        }

        last_err = format!("RPC {rpc} failed on Solana check");
    }

    Err(last_err)
}

fn has_solana_metadata(metadata: &SolanaTokenMetadata) -> bool {
    !metadata.symbol.is_empty() || !metadata.name.is_empty() || metadata.logo_url.is_some()
}

fn has_complete_solana_metadata(metadata: &SolanaTokenMetadata) -> bool {
    !metadata.symbol.is_empty() && !metadata.name.is_empty() && metadata.logo_url.is_some()
}

fn merge_solana_metadata(target: &mut SolanaTokenMetadata, source: SolanaTokenMetadata) {
    if target.symbol.is_empty() {
        target.symbol = source.symbol;
    }
    if target.name.is_empty() {
        target.name = source.name;
    }
    if target.logo_url.is_none() {
        target.logo_url = source.logo_url;
    }
}

fn clean_metadata_text(value: Option<&serde_json::Value>) -> String {
    value
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .trim_matches('\0')
        .to_string()
}

fn is_local_or_private_logo_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
    {
        return true;
    }

    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => {
            let octets = ip.octets();
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.is_broadcast()
                || ip.is_multicast()
                || (octets[0] == 100 && (64..=127).contains(&octets[1]))
                || (octets[0] == 198 && (18..=19).contains(&octets[1]))
        }
        Ok(IpAddr::V6(ip)) => {
            let first = ip.segments()[0];
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || (first & 0xfe00) == 0xfc00
                || (first & 0xffc0) == 0xfe80
        }
        Err(_) => false,
    }
}

fn normalize_token_logo_url(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 2048 {
        return None;
    }

    let candidate = if let Some(path) = value.strip_prefix("ipfs://") {
        let path = path.trim_start_matches('/');
        let path = path.strip_prefix("ipfs/").unwrap_or(path);
        if path.is_empty() {
            return None;
        }
        format!("https://ipfs.io/ipfs/{path}")
    } else if let Some(path) = value.strip_prefix("ar://") {
        let path = path.trim_start_matches('/');
        if path.is_empty() {
            return None;
        }
        format!("https://arweave.net/{path}")
    } else {
        value.to_string()
    };

    let url = reqwest::Url::parse(&candidate).ok()?;
    if url.scheme() != "https"
        || url.host_str().map(is_local_or_private_logo_host).unwrap_or(true)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    Some(url.to_string())
}

fn looks_like_image_url(url: &str) -> bool {
    let path = url
        .split(['?', '#'])
        .next()
        .unwrap_or(url)
        .to_ascii_lowercase();
    [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]
        .iter()
        .any(|extension| path.ends_with(extension))
}

fn extract_das_logo(item: &serde_json::Value) -> Option<String> {
    let direct_image = [
        item.pointer("/content/links/image"),
        item.pointer("/content/metadata/image"),
        item.pointer("/content/metadata/logo")
            .or_else(|| item.pointer("/token_info/image")),
    ]
    .into_iter()
    .find_map(|value| {
        value
            .and_then(|value| value.as_str())
            .and_then(normalize_token_logo_url)
    });
    if direct_image.is_some() {
        return direct_image;
    }

    item.pointer("/content/files")
        .and_then(|files| files.as_array())
        .and_then(|files| {
            files.iter().find_map(|file| {
                let mime = file
                    .get("mime")
                    .or_else(|| file.get("mimeType"))
                    .and_then(|mime| mime.as_str())
                    .unwrap_or_default();
                let mime_is_image = mime.starts_with("image/");
                [file.get("cdn_uri"), file.get("uri"), file.get("url")]
                    .into_iter()
                    .find_map(|value| {
                        let url = value
                            .and_then(|value| value.as_str())
                            .and_then(normalize_token_logo_url)?;
                        (mime_is_image || looks_like_image_url(&url)).then_some(url)
                    })
            })
        })
}

fn extract_das_metadata(item: &serde_json::Value) -> SolanaTokenMetadata {
    let symbol = clean_metadata_text(
        item.pointer("/content/metadata/symbol")
            .or_else(|| item.pointer("/mint_extensions/metadata/symbol"))
            .or_else(|| item.pointer("/token_info/symbol")),
    );
    let name = clean_metadata_text(
        item.pointer("/content/metadata/name")
            .or_else(|| item.pointer("/mint_extensions/metadata/name"))
            .or_else(|| item.pointer("/token_info/name")),
    );

    SolanaTokenMetadata {
        symbol,
        name,
        logo_url: extract_das_logo(item),
    }
}

fn extract_dexscreener_metadata(
    mint: &str,
    data: &serde_json::Value,
) -> Option<SolanaTokenMetadata> {
    let pairs = data.get("pairs")?.as_array()?;
    let mut best_metadata = SolanaTokenMetadata::default();
    for pair in pairs {
        if pair.get("chainId").and_then(|value| value.as_str()) != Some("solana") {
            continue;
        }
        let (token, is_base_token) = if pair
            .pointer("/baseToken/address")
            .and_then(|value| value.as_str())
            == Some(mint)
        {
            (pair.get("baseToken"), true)
        } else if pair
            .pointer("/quoteToken/address")
            .and_then(|value| value.as_str())
            == Some(mint)
        {
            (pair.get("quoteToken"), false)
        } else {
            continue;
        };
        let Some(token) = token else {
            continue;
        };
        let metadata = SolanaTokenMetadata {
            symbol: clean_metadata_text(token.get("symbol")),
            name: clean_metadata_text(token.get("name")),
            logo_url: if is_base_token {
                pair.pointer("/info/imageUrl")
                    .and_then(|value| value.as_str())
                    .and_then(normalize_token_logo_url)
            } else {
                None
            },
        };
        if metadata.logo_url.is_some() {
            merge_solana_metadata(&mut best_metadata, metadata);
            return Some(best_metadata);
        }
        if has_solana_metadata(&metadata) {
            merge_solana_metadata(&mut best_metadata, metadata);
        }
    }
    has_solana_metadata(&best_metadata).then_some(best_metadata)
}

async fn resolve_solana_token_metas(
    client: &reqwest::Client,
    rpc: &str,
    mints: &[String],
) -> HashMap<String, SolanaTokenMetadata> {
    const METADATA_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
    const INCOMPLETE_METADATA_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
    const DAS_BATCH_SIZE: usize = 50;

    let mut resolved = HashMap::new();
    if mints.is_empty() {
        return resolved;
    }

    let cache = SOLANA_TOKEN_METADATA_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let now = Instant::now();
    let mut pending = Vec::new();
    let mut pending_set = std::collections::HashSet::new();
    {
        let mut cache = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        for mint in mints {
            if let Some(cached) = cache.get(mint) {
                if cached.expires_at > now {
                    if has_solana_metadata(&cached.metadata) {
                        resolved.insert(mint.clone(), cached.metadata.clone());
                    }
                    continue;
                }
            }
            if pending_set.insert(mint.clone()) {
                pending.push(mint.clone());
            }
        }
        cache.retain(|_, cached| cached.expires_at > now);
    }
    if pending.is_empty() {
        return resolved;
    }

    // Helius DAS resolves fungible metadata by mint across launchpads and token programs;
    // DexScreener and parsed Token-2022 metadata provide additional cross-platform fallbacks.
    let mut das_endpoints = vec![rpc.to_string()];
    if !rpc.to_ascii_lowercase().contains("helius") {
        das_endpoints.push(
            "https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9"
                .to_string(),
        );
    }

    for batch in pending.chunks(DAS_BATCH_SIZE) {
        for endpoint in &das_endpoints {
            if batch.iter().all(|mint| {
                resolved
                    .get(mint)
                    .map(has_complete_solana_metadata)
                    .unwrap_or(false)
            }) {
                break;
            }
            let payload = serde_json::json!({
                "jsonrpc": "2.0",
                "id": "das_meta",
                "method": "getAssetBatch",
                "params": {
                    "ids": batch,
                    "options": { "showFungible": true }
                }
            });

            let Ok(response) = client
                .post(endpoint)
                .header("Content-Type", "application/json")
                .header("User-Agent", "Plurivex/1.0")
                .json(&payload)
                .send()
                .await
            else {
                continue;
            };
            if !response.status().is_success() {
                continue;
            }
            let Ok(data) = response.json::<serde_json::Value>().await else {
                continue;
            };
            let Some(items) = data.get("result").and_then(|result| result.as_array()) else {
                continue;
            };
            for item in items {
                let Some(id) = item.get("id").and_then(|value| value.as_str()) else {
                    continue;
                };
                if !batch.iter().any(|mint| mint == id) {
                    continue;
                }
                let metadata = extract_das_metadata(item);
                if has_solana_metadata(&metadata) {
                    merge_solana_metadata(resolved.entry(id.to_string()).or_default(), metadata);
                }
            }
        }
    }

    // DexScreener indexes pools from many Solana platforms, so tokens do not need to be tied to
    // any particular launchpad. Bound concurrency to avoid stalling scans of wallets with many mints.
    let dex_mints: Vec<String> = pending
        .iter()
        .filter(|mint| {
            !resolved
                .get(mint.as_str())
                .map(has_complete_solana_metadata)
                .unwrap_or(false)
        })
        .cloned()
        .collect();

    let dex_requests = futures::stream::iter(dex_mints)
        .map(|mint| async move {
        let url = format!("https://api.dexscreener.com/latest/dex/tokens/{mint}");
        let metadata = match client
            .get(url)
            .header("User-Agent", "Plurivex/1.0")
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => response
                .json::<serde_json::Value>()
                .await
                .ok()
                .and_then(|data| extract_dexscreener_metadata(&mint, &data)),
            _ => None,
        };
        (mint, metadata)
    })
    .buffer_unordered(8)
    .collect::<Vec<_>>()
    .await;
    for (mint, metadata) in dex_requests {
        if let Some(metadata) = metadata {
            merge_solana_metadata(resolved.entry(mint).or_default(), metadata);
        }
    }

    // The standard parsed RPC response exposes Token-2022 tokenMetadata extensions, which can
    // fill gaps when third-party indexes have not seen a newly-created mint yet.
    let info_mints: Vec<String> = pending
        .iter()
        .filter(|mint| {
            resolved
                .get(mint.as_str())
                .map(|metadata| metadata.symbol.is_empty() || metadata.name.is_empty())
                .unwrap_or(true)
        })
        .cloned()
        .collect();

    let info_requests = futures::stream::iter(info_mints)
        .map(|mint| async move {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [mint, {"encoding": "jsonParsed"}]
        });
        let metadata = match client
            .post(rpc)
            .header("Content-Type", "application/json")
            .header("User-Agent", "Plurivex/1.0")
            .json(&payload)
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => response
                .json::<serde_json::Value>()
                .await
                .ok()
                .and_then(|data| {
                    let extensions = data
                        .pointer("/result/value/data/parsed/info/extensions")?
                        .as_array()?;
                    extensions.iter().find_map(|extension| {
                        if extension.get("extension").and_then(|value| value.as_str())
                            != Some("tokenMetadata")
                        {
                            return None;
                        }
                        let state = extension.get("state")?;
                        let metadata = SolanaTokenMetadata {
                            symbol: clean_metadata_text(state.get("symbol")),
                            name: clean_metadata_text(state.get("name")),
                            // Token-2022's `uri` points to a JSON metadata document, not an image.
                            // Do not persist it as an image URL; DAS/DexScreener provide image URLs.
                            logo_url: None,
                        };
                        has_solana_metadata(&metadata).then_some(metadata)
                    })
                }),
            _ => None,
        };
        (mint, metadata)
    })
    .buffer_unordered(8)
    .collect::<Vec<_>>()
    .await;
    for (mint, metadata) in info_requests {
        if let Some(metadata) = metadata {
            merge_solana_metadata(resolved.entry(mint).or_default(), metadata);
        }
    }

    let now = Instant::now();
    let mut cache = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    for mint in pending {
        let metadata = resolved.get(&mint).cloned().unwrap_or_default();
        let ttl = if has_complete_solana_metadata(&metadata) {
            METADATA_CACHE_TTL
        } else {
            INCOMPLETE_METADATA_CACHE_TTL
        };
        cache.insert(
            mint,
            CachedSolanaTokenMetadata {
                expires_at: now + ttl,
                metadata,
            },
        );
    }
    resolved
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_ipfs_and_arweave_logo_uris() {
        assert_eq!(
            normalize_token_logo_url("ipfs://ipfs/bafybeigdyrzt"),
            Some("https://ipfs.io/ipfs/bafybeigdyrzt".to_string())
        );
        assert_eq!(
            normalize_token_logo_url("ar://metadata-hash/logo.png"),
            Some("https://arweave.net/metadata-hash/logo.png".to_string())
        );
        assert_eq!(normalize_token_logo_url("http://example.com/logo.png"), None);
        assert_eq!(normalize_token_logo_url("https://localhost/logo.png"), None);
        assert_eq!(normalize_token_logo_url("https://10.0.0.1/logo.png"), None);
        assert_eq!(normalize_token_logo_url("javascript:alert(1)"), None);
    }

    #[test]
    fn extracts_logo_from_helius_das_metadata_and_files() {
        let item = serde_json::json!({
            "id": "mint-address",
            "content": {
                "metadata": { "name": "Stonk Token", "symbol": "STONK" },
                "files": [
                    { "uri": "https://example.com/token.json", "mime": "application/json" },
                    { "cdn_uri": "ipfs://bafybeigdyrzt/logo", "mime": "image/png" }
                ]
            }
        });
        let metadata = extract_das_metadata(&item);
        assert_eq!(metadata.symbol, "STONK");
        assert_eq!(metadata.name, "Stonk Token");
        assert_eq!(
            metadata.logo_url.as_deref(),
            Some("https://ipfs.io/ipfs/bafybeigdyrzt/logo")
        );
    }

    #[test]
    fn extracts_logo_and_token_identity_from_any_solana_dex_pair() {
        let mint = "mint-address";
        let data = serde_json::json!({
            "pairs": [{
                "chainId": "solana",
                "baseToken": { "address": mint, "name": "Launch Token", "symbol": "LCH" },
                "quoteToken": { "address": "quote-address", "name": "USD Coin", "symbol": "USDC" },
                "info": { "imageUrl": "https://cdn.example.com/token.png" }
            }]
        });
        let metadata = extract_dexscreener_metadata(mint, &data).unwrap();
        assert_eq!(metadata.symbol, "LCH");
        assert_eq!(metadata.name, "Launch Token");
        assert_eq!(
            metadata.logo_url.as_deref(),
            Some("https://cdn.example.com/token.png")
        );
    }

    #[test]
    fn does_not_use_a_base_token_image_for_a_quote_token() {
        let mint = "quote-address";
        let data = serde_json::json!({
            "pairs": [{
                "chainId": "solana",
                "baseToken": { "address": "pool-token", "name": "Pool Token", "symbol": "POOL" },
                "quoteToken": { "address": mint, "name": "Quote Token", "symbol": "QUOTE" },
                "info": { "imageUrl": "https://cdn.example.com/pool-token.png" }
            }]
        });
        let metadata = extract_dexscreener_metadata(mint, &data).unwrap();
        assert_eq!(metadata.symbol, "QUOTE");
        assert_eq!(metadata.logo_url, None);
    }

    #[tokio::test]
    #[ignore = "requires internet access and the configured Helius RPC"]
    async fn test_solana_token_metadata_resolution_live() {
        let client = reqwest::Client::new();
        let rpc = "https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9";
        let mints = vec!["BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs".to_string()];
        let metas = resolve_solana_token_metas(&client, rpc, &mints).await;
        if let Some(metadata) = metas.get("BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs") {
            assert_eq!(metadata.symbol, "BTc");
            assert_eq!(metadata.name, "Bobby The Cat");
        }
    }

    #[tokio::test]
    #[ignore = "requires internet access and a live Solana wallet/RPC"]
    async fn test_scan_solana_for_wallet_live() {
        let client = reqwest::Client::new();
        let rpcs = ["https://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9"];
        let addr = "BguMMNRsrG1QzPDYtTRYku8SyVfuSe2edoVv6jCFbt3j";
        if let Ok(res) = scan_solana_for_wallet(&client, addr, &rpcs, 1434).await {
            assert_eq!(res.wallet_id, 1434);
            assert_eq!(res.chain_key, "sol");
        }
    }
}
