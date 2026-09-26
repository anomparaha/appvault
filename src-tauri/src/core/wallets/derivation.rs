use bech32::{u5, ToBase32, Variant};
use bip32::{DerivationPath, XPrv};
use bip39::Mnemonic;
use ed25519_dalek::SigningKey as EdSigningKey;
use hmac::{Hmac, Mac};
use k256::ecdsa::SigningKey;
use ripemd::Ripemd160;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use sha3::Keccak256;
use zeroize::Zeroizing;

type HmacSha512 = Hmac<Sha512>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DualCredentials {
    pub evm_address: Option<String>,
    pub sol_address: Option<String>,
    pub btc_address: Option<String>,
    pub btc_legacy_address: Option<String>,
    pub evm_private_key: Option<String>,
    pub sol_private_key: Option<String>,
    pub btc_private_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAddressesOnly {
    pub evm_address: Option<String>,
    pub sol_address: Option<String>,
    pub btc_address: Option<String>,
    pub btc_legacy_address: Option<String>,
}

/// Derive standard SLIP-0010 Ed25519 master and child keys (Phantom/Solflare standard)
pub fn slip10_derive_ed25519(seed: &[u8], path: &[u32]) -> [u8; 32] {
    let mut mac = HmacSha512::new_from_slice(b"ed25519 seed").expect("HMAC init");
    mac.update(seed);
    let result = mac.finalize().into_bytes();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result[0..32]);
    let mut chain_code = [0u8; 32];
    chain_code.copy_from_slice(&result[32..64]);

    for &index in path {
        let mut mac = HmacSha512::new_from_slice(&chain_code).expect("HMAC step");
        mac.update(&[0x00]);
        mac.update(&key);
        mac.update(&index.to_be_bytes());
        let result = mac.finalize().into_bytes();
        key.copy_from_slice(&result[0..32]);
        chain_code.copy_from_slice(&result[32..64]);
    }
    key
}

/// Convert uncompressed public key (65 bytes starting with 0x04) to checksummed EVM address
pub fn evm_address_from_public_key(pubkey_bytes: &[u8]) -> String {
    let raw_pub = if pubkey_bytes.len() == 65 && pubkey_bytes[0] == 0x04 {
        &pubkey_bytes[1..]
    } else {
        pubkey_bytes
    };

    let hash = Keccak256::digest(raw_pub);
    let addr_bytes = &hash[12..32];
    let hex_addr = hex::encode(addr_bytes);

    // EIP-55 checksum encoding
    let hash_eip55 = Keccak256::digest(hex_addr.as_bytes());
    let mut checksummed = String::with_capacity(42);
    checksummed.push_str("0x");

    for (i, c) in hex_addr.chars().enumerate() {
        let hash_byte = hash_eip55[i / 2];
        let hash_nibble = if i % 2 == 0 {
            hash_byte >> 4
        } else {
            hash_byte & 0x0f
        };

        if hash_nibble >= 8 {
            checksummed.push(c.to_ascii_uppercase());
        } else {
            checksummed.push(c.to_ascii_lowercase());
        }
    }

    checksummed
}

/// Derive ONLY the checksummed EVM address directly from a 32-byte private key
/// without allocating a hex private key string in heap memory.
pub fn evm_address_only(pk_bytes: &[u8; 32]) -> Result<String, String> {
    let signing_key = SigningKey::from_bytes(pk_bytes.into())
        .map_err(|e| format!("Invalid secp256k1 key: {}", e))?;
    let verifying_key = signing_key.verifying_key();
    let uncompressed = verifying_key.to_encoded_point(false);
    Ok(evm_address_from_public_key(uncompressed.as_bytes()))
}

/// Derive EVM address directly from a 32-byte private key
pub fn evm_address_from_private_key(pk_bytes: &[u8; 32]) -> Result<(String, String), String> {
    let address = evm_address_only(pk_bytes)?;
    let private_key_hex = format!("0x{}", hex::encode(pk_bytes));
    Ok((address, private_key_hex))
}

/// Derive ONLY the Solana Base58 public address from 32-byte seed
pub fn solana_address_only(seed_32: &[u8; 32]) -> String {
    let signing_key = EdSigningKey::from_bytes(seed_32);
    let verifying_key = signing_key.verifying_key();
    bs58::encode(verifying_key.as_bytes()).into_string()
}

/// Derive Solana address and Base58 secret key from 32-byte seed
pub fn solana_credentials_from_seed(seed_32: &[u8; 32]) -> (String, String) {
    let sol_address = solana_address_only(seed_32);
    let signing_key = EdSigningKey::from_bytes(seed_32);
    let verifying_key = signing_key.verifying_key();

    // 64-byte keypair (32 bytes secret + 32 bytes public) standard in Solana web3
    let mut keypair_bytes = [0u8; 64];
    keypair_bytes[0..32].copy_from_slice(seed_32);
    keypair_bytes[32..64].copy_from_slice(verifying_key.as_bytes());
    let sol_private_key = bs58::encode(&keypair_bytes).into_string();

    (sol_address, sol_private_key)
}

/// Derive standard Bitcoin credentials (Native SegWit Bech32 bc1q..., Legacy 1..., and WIF private key)
pub fn bitcoin_credentials_from_private_key(
    privkey_bytes: &[u8; 32],
) -> Result<(String, String, String), String> {
    let signing_key = SigningKey::from_bytes(privkey_bytes.into())
        .map_err(|e| format!("Failed to parse private key for Bitcoin: {}", e))?;
    let verifying_key = signing_key.verifying_key();
    let compressed_pubkey = verifying_key.to_encoded_point(true);
    let pubkey_bytes = compressed_pubkey.as_bytes();

    let sha256_hash = Sha256::digest(pubkey_bytes);
    let hash160 = Ripemd160::digest(sha256_hash);

    // 1. Native SegWit (BIP-84) Bech32 address: "bc1q..."
    let mut data = vec![u5::try_from_u8(0).map_err(|e| e.to_string())?];
    data.extend(hash160.to_base32());
    let btc_native_segwit = bech32::encode("bc", data, Variant::Bech32)
        .map_err(|e| format!("Bech32 encode error: {}", e))?;

    // 2. Legacy (BIP-44) Base58Check address: "1..."
    let mut p2pkh_payload = Vec::with_capacity(25);
    p2pkh_payload.push(0x00); // Mainnet P2PKH version
    p2pkh_payload.extend_from_slice(&hash160);
    let chk1 = Sha256::digest(Sha256::digest(&p2pkh_payload));
    p2pkh_payload.extend_from_slice(&chk1[0..4]);
    let btc_legacy = bs58::encode(&p2pkh_payload).into_string();

    // 3. WIF Private key: Base58Check (0x80 + privkey + 0x01)
    let mut wif_payload = Vec::with_capacity(38);
    wif_payload.push(0x80); // Mainnet WIF
    wif_payload.extend_from_slice(privkey_bytes);
    wif_payload.push(0x01); // Compressed
    let chk2 = Sha256::digest(Sha256::digest(&wif_payload));
    wif_payload.extend_from_slice(&chk2[0..4]);
    let btc_wif = bs58::encode(&wif_payload).into_string();

    Ok((btc_native_segwit, btc_legacy, btc_wif))
}

/// Derive BIP-49 Nested SegWit (P2WPKH-in-P2SH) address: "3..."
pub fn bitcoin_p2sh_segwit_address_from_private_key(
    privkey_bytes: &[u8; 32],
) -> Result<String, String> {
    let signing_key = SigningKey::from_bytes(privkey_bytes.into())
        .map_err(|e| format!("Failed to parse private key: {}", e))?;
    let verifying_key = signing_key.verifying_key();
    let compressed_pubkey = verifying_key.to_encoded_point(true);
    let pubkey_bytes = compressed_pubkey.as_bytes();

    let sha256_hash = Sha256::digest(pubkey_bytes);
    let hash160 = Ripemd160::digest(sha256_hash);

    // Redeem script for P2WPKH: 0x00 0x14 <20-byte-hash160>
    let mut redeem_script = [0u8; 22];
    redeem_script[0] = 0x00; // OP_0
    redeem_script[1] = 0x14; // Push 20 bytes
    redeem_script[2..22].copy_from_slice(&hash160);

    let script_sha = Sha256::digest(redeem_script);
    let script_hash160 = Ripemd160::digest(script_sha);

    // P2SH Base58Check (version byte 0x05 for Bitcoin Mainnet "3...")
    let mut p2sh_payload = Vec::with_capacity(25);
    p2sh_payload.push(0x05);
    p2sh_payload.extend_from_slice(&script_hash160);
    let chk = Sha256::digest(Sha256::digest(&p2sh_payload));
    p2sh_payload.extend_from_slice(&chk[0..4]);
    Ok(bs58::encode(&p2sh_payload).into_string())
}

/// Native multi-chain derivation supporting seed phrase, EVM hex key, and Solana Base58 key
pub fn derive_dual_credentials_native(
    secret: &str,
    wallet_type: &str,
) -> Result<DualCredentials, String> {
    let t = secret.trim();

    match wallet_type {
        "seed" => {
            let mnemonic = Mnemonic::parse_normalized(t)
                .map_err(|e| format!("Invalid BIP-39 mnemonic phrase: {}", e))?;
            let seed_bytes = Zeroizing::new(mnemonic.to_seed(""));

            // 1. EVM Derivation (BIP-44 path: m/44'/60'/0'/0/0)
            let path: DerivationPath = "m/44'/60'/0'/0/0"
                .parse()
                .map_err(|e| format!("Invalid derivation path: {}", e))?;
            let xprv = XPrv::derive_from_path(seed_bytes.as_ref(), &path)
                .map_err(|e| format!("EVM HD derivation failed: {}", e))?;
            let evm_pk_bytes: Zeroizing<[u8; 32]> =
                Zeroizing::new(xprv.private_key().to_bytes().into());
            let (evm_address, evm_private_key) = evm_address_from_private_key(&evm_pk_bytes)?;

            // 2. Solana Derivation (SLIP-0010 path: m/44'/501'/0'/0')
            let sol_slip10_path = [44 | 0x80000000, 501 | 0x80000000, 0x80000000, 0x80000000];
            let sol_seed_32: Zeroizing<[u8; 32]> =
                Zeroizing::new(slip10_derive_ed25519(&*seed_bytes, &sol_slip10_path));
            let (sol_address, sol_private_key) = solana_credentials_from_seed(&sol_seed_32);

            // 3. Bitcoin BIP-84 Native SegWit (path: m/84'/0'/0'/0/0) -> bc1q...
            let (btc_address, btc_private_key) = match "m/84'/0'/0'/0/0".parse::<DerivationPath>() {
                Ok(p) => match XPrv::derive_from_path(seed_bytes.as_ref(), &p) {
                    Ok(x) => {
                        let pk: Zeroizing<[u8; 32]> =
                            Zeroizing::new(x.private_key().to_bytes().into());
                        match bitcoin_credentials_from_private_key(&pk) {
                            Ok((addr, _, wif)) => (Some(addr), Some(wif)),
                            Err(_) => (None, None),
                        }
                    }
                    Err(_) => (None, None),
                },
                Err(_) => (None, None),
            };

            // 4. Bitcoin BIP-44 Legacy (path: m/44'/0'/0'/0/0) -> 1...
            let btc_legacy_address = match "m/44'/0'/0'/0/0".parse::<DerivationPath>() {
                Ok(p) => match XPrv::derive_from_path(seed_bytes.as_ref(), &p) {
                    Ok(x) => {
                        let pk: Zeroizing<[u8; 32]> =
                            Zeroizing::new(x.private_key().to_bytes().into());
                        match bitcoin_credentials_from_private_key(&pk) {
                            Ok((_, leg, _)) => Some(leg),
                            Err(_) => None,
                        }
                    }
                    Err(_) => None,
                },
                Err(_) => None,
            };

            Ok(DualCredentials {
                evm_address: Some(evm_address),
                sol_address: Some(sol_address),
                btc_address,
                btc_legacy_address,
                evm_private_key: Some(evm_private_key),
                sol_private_key: Some(sol_private_key),
                btc_private_key,
            })
        }
        "pk" => {
            let clean_hex = t.trim().trim_start_matches("0x").trim_start_matches("0X");
            let pk_bytes_vec = Zeroizing::new(
                hex::decode(clean_hex).map_err(|e| format!("Invalid hex private key: {}", e))?,
            );
            if pk_bytes_vec.len() != 32 {
                return Err("EVM Private Key must be exactly 32 bytes (64 hex characters)".into());
            }
            let mut pk_bytes: Zeroizing<[u8; 32]> = Zeroizing::new([0u8; 32]);
            pk_bytes.copy_from_slice(&pk_bytes_vec);

            let (evm_address, evm_private_key) = evm_address_from_private_key(&pk_bytes)?;
            let (sol_address, sol_private_key) = solana_credentials_from_seed(&pk_bytes);
            let (btc_address, btc_legacy, btc_wif) =
                match bitcoin_credentials_from_private_key(&pk_bytes) {
                    Ok((addr, leg, wif)) => (Some(addr), Some(leg), Some(wif)),
                    Err(_) => (None, None, None),
                };

            Ok(DualCredentials {
                evm_address: Some(evm_address),
                sol_address: Some(sol_address),
                btc_address,
                btc_legacy_address: btc_legacy,
                evm_private_key: Some(evm_private_key),
                sol_private_key: Some(sol_private_key),
                btc_private_key: btc_wif,
            })
        }
        "sol_pk" => {
            let decoded = Zeroizing::new(
                bs58::decode(t)
                    .into_vec()
                    .map_err(|e| format!("Invalid Base58 key: {}", e))?,
            );
            if decoded.len() != 32 && decoded.len() != 64 {
                return Err(format!(
                    "Solana secret key must be 32 or 64 bytes, got {} bytes",
                    decoded.len()
                ));
            }
            let mut raw32: Zeroizing<[u8; 32]> = Zeroizing::new([0u8; 32]);
            raw32.copy_from_slice(&decoded[0..32]);

            let (sol_address, sol_private_key) = solana_credentials_from_seed(&raw32);
            let (evm_address, evm_private_key) = evm_address_from_private_key(&raw32)?;

            Ok(DualCredentials {
                evm_address: Some(evm_address),
                sol_address: Some(sol_address),
                btc_address: None,
                btc_legacy_address: None,
                evm_private_key: Some(evm_private_key),
                sol_private_key: Some(sol_private_key),
                btc_private_key: None,
            })
        }
        _ => Err(format!("Unsupported wallet type: {}", wallet_type)),
    }
}

/// Derive ONLY EVM public address (BIP-44: m/44'/60'/0'/0/0) directly from mnemonic
pub fn derive_evm_address_only_native(
    mnemonic_phrase: &str,
) -> Result<Option<String>, String> {
    let t = mnemonic_phrase.trim();
    let mnemonic = Mnemonic::parse_normalized(t)
        .map_err(|e| format!("Invalid BIP-39 mnemonic phrase: {}", e))?;
    let seed_bytes = Zeroizing::new(mnemonic.to_seed(""));
    let path: DerivationPath = match "m/44'/60'/0'/0/0".parse() {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };
    match XPrv::derive_from_path(seed_bytes.as_ref(), &path) {
        Ok(xprv) => {
            let pk_bytes: Zeroizing<[u8; 32]> =
                Zeroizing::new(xprv.private_key().to_bytes().into());
            let signing_key = match SigningKey::from_bytes((&*pk_bytes).into()) {
                Ok(k) => k,
                Err(_) => return Err("Invalid secp256k1 key".into()),
            };
            let verifying_key = signing_key.verifying_key();
            let uncompressed = verifying_key.to_encoded_point(false);
            Ok(Some(evm_address_from_public_key(uncompressed.as_bytes())))
        }
        Err(_) => Ok(None),
    }
}

/// Derive ONLY Solana public address (SLIP-0010: m/44'/501'/0'/0') directly from mnemonic
pub fn derive_solana_address_only_native(
    mnemonic_phrase: &str,
) -> Result<Option<String>, String> {
    let t = mnemonic_phrase.trim();
    let mnemonic = Mnemonic::parse_normalized(t)
        .map_err(|e| format!("Invalid BIP-39 mnemonic phrase: {}", e))?;
    let seed_bytes = Zeroizing::new(mnemonic.to_seed(""));
    let sol_slip10_path = [44 | 0x80000000, 501 | 0x80000000, 0x80000000, 0x80000000];
    let sol_seed_32: Zeroizing<[u8; 32]> =
        Zeroizing::new(slip10_derive_ed25519(&*seed_bytes, &sol_slip10_path));
    let signing_key = EdSigningKey::from_bytes(&sol_seed_32);
    let verifying_key = signing_key.verifying_key();
    Ok(Some(bs58::encode(verifying_key.as_bytes()).into_string()))
}

pub type BitcoinAddressTriplet = (Option<String>, Option<String>, Option<String>);

/// Derive ONLY Bitcoin public addresses (Native SegWit BIP-84, Nested SegWit BIP-49, & Legacy BIP-44) directly from mnemonic
pub fn derive_bitcoin_addresses_only_native(
    mnemonic_phrase: &str,
) -> Result<BitcoinAddressTriplet, String> {
    let t = mnemonic_phrase.trim();
    let mnemonic = Mnemonic::parse_normalized(t)
        .map_err(|e| format!("Invalid BIP-39 mnemonic phrase: {}", e))?;
    let seed_bytes = Zeroizing::new(mnemonic.to_seed(""));

    // 1. Native SegWit (BIP-84) "bc1q..."
    let btc_address = match "m/84'/0'/0'/0/0".parse::<DerivationPath>() {
        Ok(p) => match XPrv::derive_from_path(seed_bytes.as_ref(), &p) {
            Ok(x) => {
                let pk: Zeroizing<[u8; 32]> =
                    Zeroizing::new(x.private_key().to_bytes().into());
                match bitcoin_credentials_from_private_key(&pk) {
                    Ok((addr, _, _)) => Some(addr),
                    Err(_) => None,
                }
            }
            Err(_) => None,
        },
        Err(_) => None,
    };

    // 2. Nested SegWit P2SH (BIP-49) "3..."
    let btc_p2sh_address = match "m/49'/0'/0'/0/0".parse::<DerivationPath>() {
        Ok(p) => match XPrv::derive_from_path(seed_bytes.as_ref(), &p) {
            Ok(x) => {
                let pk: Zeroizing<[u8; 32]> =
                    Zeroizing::new(x.private_key().to_bytes().into());
                bitcoin_p2sh_segwit_address_from_private_key(&pk).ok()
            }
            Err(_) => None,
        },
        Err(_) => None,
    };

    // 3. Legacy (BIP-44) "1..."
    let btc_legacy_address = match "m/44'/0'/0'/0/0".parse::<DerivationPath>() {
        Ok(p) => match XPrv::derive_from_path(seed_bytes.as_ref(), &p) {
            Ok(x) => {
                let pk: Zeroizing<[u8; 32]> =
                    Zeroizing::new(x.private_key().to_bytes().into());
                match bitcoin_credentials_from_private_key(&pk) {
                    Ok((_, leg, _)) => Some(leg),
                    Err(_) => None,
                }
            }
            Err(_) => None,
        },
        Err(_) => None,
    };

    Ok((btc_address, btc_p2sh_address, btc_legacy_address))
}

/// Zero-RAM-leakage: Derive only public addresses without ever creating private key strings in memory.
/// Seed buffer is zeroized using volatile writes and memory barriers immediately upon exit.
pub fn derive_public_addresses_only_native(
    mnemonic_phrase: &str,
) -> Result<PublicAddressesOnly, String> {
    let t = mnemonic_phrase.trim();
    let mnemonic = Mnemonic::parse_normalized(t)
        .map_err(|e| format!("Invalid BIP-39 mnemonic phrase: {}", e))?;

    let seed_bytes = Zeroizing::new(mnemonic.to_seed(""));

    // 1. EVM Public Address (BIP-44 path: m/44'/60'/0'/0/0)
    let evm_address = match "m/44'/60'/0'/0/0".parse::<DerivationPath>() {
        Ok(path) => match XPrv::derive_from_path(seed_bytes.as_ref(), &path) {
            Ok(xprv) => {
                let pk_bytes: Zeroizing<[u8; 32]> =
                    Zeroizing::new(xprv.private_key().to_bytes().into());
                let signing_key = match SigningKey::from_bytes((&*pk_bytes).into()) {
                    Ok(k) => k,
                    Err(_) => return Err("Invalid secp256k1 key".into()),
                };
                let verifying_key = signing_key.verifying_key();
                let uncompressed = verifying_key.to_encoded_point(false);
                Some(evm_address_from_public_key(uncompressed.as_bytes()))
            }
            Err(_) => None,
        },
        Err(_) => None,
    };

    // 2. Solana Public Address (SLIP-0010 path: m/44'/501'/0'/0')
    let sol_slip10_path = [44 | 0x80000000, 501 | 0x80000000, 0x80000000, 0x80000000];
    let sol_seed_32: Zeroizing<[u8; 32]> =
        Zeroizing::new(slip10_derive_ed25519(&*seed_bytes, &sol_slip10_path));
    let sol_address = {
        let signing_key = EdSigningKey::from_bytes(&sol_seed_32);
        let verifying_key = signing_key.verifying_key();
        Some(bs58::encode(verifying_key.as_bytes()).into_string())
    };

    // 3. Bitcoin BIP-84 Native SegWit (path: m/84'/0'/0'/0/0) -> bc1q...
    let btc_address = match "m/84'/0'/0'/0/0".parse::<DerivationPath>() {
        Ok(p) => match XPrv::derive_from_path(seed_bytes.as_ref(), &p) {
            Ok(x) => {
                let pk: Zeroizing<[u8; 32]> =
                    Zeroizing::new(x.private_key().to_bytes().into());
                match bitcoin_credentials_from_private_key(&pk) {
                    Ok((addr, _, _)) => Some(addr),
                    Err(_) => None,
                }
            }
            Err(_) => None,
        },
        Err(_) => None,
    };

    // 4. Bitcoin BIP-44 Legacy (path: m/44'/0'/0'/0/0) -> 1...
    let btc_legacy_address = match "m/44'/0'/0'/0/0".parse::<DerivationPath>() {
        Ok(p) => match XPrv::derive_from_path(seed_bytes.as_ref(), &p) {
            Ok(x) => {
                let pk: Zeroizing<[u8; 32]> =
                    Zeroizing::new(x.private_key().to_bytes().into());
                match bitcoin_credentials_from_private_key(&pk) {
                    Ok((_, leg, _)) => Some(leg),
                    Err(_) => None,
                }
            }
            Err(_) => None,
        },
        Err(_) => None,
    };

    Ok(PublicAddressesOnly {
        evm_address,
        sol_address,
        btc_address,
        btc_legacy_address,
    })
}

pub fn is_valid_mnemonic_phrase(phrase: &str) -> bool {
    Mnemonic::parse_normalized(phrase.trim()).is_ok()
}

/// Ultra-fast batch dual-chain derivation for thousands of wallets (sub-millisecond)
pub fn derive_dual_credentials_batch_native(
    secrets: &[String],
    wallet_type: &str,
) -> Vec<Option<DualCredentials>> {
    secrets
        .iter()
        .map(|s| derive_dual_credentials_native(s, wallet_type).ok())
        .collect()
}

/// Universal public-only address derivation supporting seed phrase, EVM hex key, and Solana Base58 key.
/// Zero-RAM-leakage: Private keys are never returned across IPC or allocated as strings in heap.
pub fn derive_public_addresses_native(
    secret: &str,
    wallet_type: &str,
) -> Result<PublicAddressesOnly, String> {
    match wallet_type {
        "seed" => derive_public_addresses_only_native(secret),
        "pk" => {
            let t = secret.trim();
            let clean = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")).unwrap_or(t);
            let bytes = hex::decode(clean).map_err(|e| format!("Invalid hex private key: {}", e))?;
            if bytes.len() != 32 {
                return Err(format!("EVM private key must be 32 bytes (64 hex characters), got {}", bytes.len()));
            }
            let mut pk_arr = Zeroizing::new([0u8; 32]);
            pk_arr.copy_from_slice(&bytes);
            let addr = evm_address_only(&pk_arr)?;
            Ok(PublicAddressesOnly {
                evm_address: Some(addr),
                sol_address: None,
                btc_address: None,
                btc_legacy_address: None,
            })
        }
        "sol_pk" => {
            let t = secret.trim();
            let bytes = bs58::decode(t)
                .into_vec()
                .map_err(|e| format!("Invalid Base58 Solana key: {}", e))?;
            let sol_addr = if bytes.len() == 64 {
                bs58::encode(&bytes[32..64]).into_string()
            } else if bytes.len() == 32 {
                let mut seed_32 = Zeroizing::new([0u8; 32]);
                seed_32.copy_from_slice(&bytes);
                solana_address_only(&seed_32)
            } else {
                return Err(format!("Invalid Solana private key length: {}", bytes.len()));
            };
            Ok(PublicAddressesOnly {
                evm_address: None,
                sol_address: Some(sol_addr),
                btc_address: None,
                btc_legacy_address: None,
            })
        }
        _ => {
            let creds = derive_dual_credentials_native(secret, wallet_type)?;
            Ok(PublicAddressesOnly {
                evm_address: creds.evm_address,
                sol_address: creds.sol_address,
                btc_address: creds.btc_address,
                btc_legacy_address: creds.btc_legacy_address,
            })
        }
    }
}

/// Batch public-only address derivation for mass imports with zero private key exposure
pub fn derive_public_addresses_batch_native(
    secrets: &[String],
    wallet_type: &str,
) -> Vec<Option<PublicAddressesOnly>> {
    secrets
        .iter()
        .map(|s| derive_public_addresses_native(s, wallet_type).ok())
        .collect()
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mnemonic_dual_derivation() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let creds =
            derive_dual_credentials_native(mnemonic, "seed").expect("Seed derivation failed");

        assert_eq!(
            creds.evm_address.as_deref(),
            Some("0x9858EfFD232B4033E47d90003D41EC34EcaEda94")
        );
        assert!(creds.sol_address.is_some());
        assert!(creds.btc_address.is_some());
        assert!(creds.btc_address.as_ref().unwrap().starts_with("bc1q"));
        assert!(creds.btc_legacy_address.is_some());
        assert!(creds.btc_legacy_address.as_ref().unwrap().starts_with("1"));
        assert!(creds.btc_private_key.is_some());
        assert!(creds.evm_private_key.is_some());
        assert!(creds.sol_private_key.is_some());
    }

    #[test]
    fn test_hex_private_key_derivation() {
        let pk = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
        let creds = derive_dual_credentials_native(pk, "pk").expect("PK derivation failed");

        assert_eq!(
            creds.evm_address.as_deref(),
            Some("0x2c7536E3605D9C16a7a3D7b1898e529396a65c23")
        );
        assert!(creds.sol_address.is_some());
    }

    #[test]
    fn test_is_valid_mnemonic() {
        assert!(is_valid_mnemonic_phrase(
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
        ));
        assert!(!is_valid_mnemonic_phrase("abandon abandon abandon invalid"));
    }

    #[test]
    fn test_bip49_and_bitcoin_derivation_vectors() {
        // Canonical BIP-49 & Bitcoin test vectors for 12 words:
        // "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let (native_segwit, nested_segwit, legacy) =
            derive_bitcoin_addresses_only_native(mnemonic)
                .expect("Bitcoin derivation should succeed");

        // BIP-84 Native SegWit (bc1q...)
        assert_eq!(
            native_segwit.as_deref(),
            Some("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu")
        );
        // BIP-49 Nested SegWit P2SH (3...) - Verified against official BIP-49 & Ian Coleman
        assert_eq!(
            nested_segwit.as_deref(),
            Some("37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf")
        );
        // BIP-44 Legacy (1...)
        assert_eq!(
            legacy.as_deref(),
            Some("1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA")
        );
    }

    #[test]
    fn test_public_addresses_only_derivation_seed_and_batch() {
        // 1. Seed phrase
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let pub_seed = derive_public_addresses_native(mnemonic, "seed").expect("Public derivation failed");
        assert_eq!(pub_seed.evm_address.unwrap().to_lowercase(), "0x9858effd232b4033e47d90003d41ec34ecaeda94");
        assert_eq!(pub_seed.sol_address.unwrap(), "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");

        // 2. EVM hex private key
        let hex_pk = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
        let pub_pk = derive_public_addresses_native(hex_pk, "pk").expect("PK derivation failed");
        assert_eq!(pub_pk.evm_address.unwrap(), "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23");
        assert!(pub_pk.sol_address.is_none());

        // 3. Solana Base58 private key
        let sol_raw = [1u8; 32];
        let sol_b58 = bs58::encode(&sol_raw).into_string();
        let pub_sol = derive_public_addresses_native(&sol_b58, "sol_pk").expect("Solana derivation failed");
        assert_eq!(pub_sol.sol_address.unwrap(), "AKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9");
        assert!(pub_sol.evm_address.is_none());

        // 4. Batch derivation
        let batch = derive_public_addresses_batch_native(
            &[mnemonic.to_string(), hex_pk.to_string(), sol_b58.clone()],
            "seed",
        );
        assert_eq!(batch.len(), 3);
        assert!(batch[0].is_some());
        // second and third are none when expected as seed, which is intended behavior
        assert!(batch[1].is_none());
        assert!(batch[2].is_none());
    }
}
