use crate::core::wallets::rlp::*;
use k256::ecdsa::SigningKey;
use sha3::{Digest, Keccak256};
use zeroize::Zeroizing;

#[derive(Debug, Clone)]
pub struct EvmTxParams<'a> {
    pub nonce: u64,
    pub gas_price_wei: &'a [u8],
    pub gas_limit: u64,
    pub to: &'a [u8], // 20 bytes
    pub value_wei: &'a [u8],
    pub data: &'a [u8],
    pub chain_id: u64,
}

/// Sign an EVM Legacy (Type 0 / EIP-155) transaction using a 32-byte private key.
/// Returns standard raw transaction hex string ("0x...").
/// The private key buffer is guaranteed zeroized on function return.
pub fn sign_evm_transaction(
    private_key: &Zeroizing<[u8; 32]>,
    params: &EvmTxParams<'_>,
) -> Result<String, String> {
    if params.to.len() != 20 {
        return Err(format!(
            "Invalid recipient address length: expected 20 bytes, got {}",
            params.to.len()
        ));
    }
    if params.to == [0u8; 20] {
        return Err("Recipient address cannot be the zero address (0x000...000)".to_string());
    }

    // 1. Construct EIP-155 unsigned payload:
    // [nonce, gasPrice, gasLimit, to, value, data, chain_id, 0, 0]
    let mut unsigned_payload = Vec::with_capacity(256);
    unsigned_payload.extend_from_slice(&encode_u64(params.nonce));
    unsigned_payload.extend_from_slice(&encode_bigint_bytes(params.gas_price_wei));
    unsigned_payload.extend_from_slice(&encode_u64(params.gas_limit));
    unsigned_payload.extend_from_slice(&encode_bytes(params.to));
    unsigned_payload.extend_from_slice(&encode_bigint_bytes(params.value_wei));
    unsigned_payload.extend_from_slice(&encode_bytes(params.data));
    unsigned_payload.extend_from_slice(&encode_u64(params.chain_id));
    unsigned_payload.extend_from_slice(&encode_u64(0));
    unsigned_payload.extend_from_slice(&encode_u64(0));

    let unsigned_rlp = encode_list(&unsigned_payload);

    // 2. Compute Keccak256 hash
    let tx_hash = Keccak256::digest(&unsigned_rlp);

    // 3. Sign using secp256k1 recoverable signature
    let signing_key = SigningKey::from_bytes((&**private_key).into())
        .map_err(|e| format!("Invalid secp256k1 private key: {}", e))?;

    let (signature, recid) = signing_key
        .sign_prehash_recoverable(&tx_hash)
        .map_err(|e| format!("ECDSA signing failed: {}", e))?;

    // 4. Calculate EIP-155 v: v = chain_id * 2 + 35 + recid
    let v = params
        .chain_id
        .checked_mul(2)
        .and_then(|val| val.checked_add(35))
        .and_then(|val| val.checked_add(recid.to_byte() as u64))
        .ok_or_else(|| "Overflow calculating EIP-155 v value".to_string())?;

    let r_bytes = signature.r().to_bytes();
    let s_bytes = signature.s().to_bytes();

    // 5. Construct signed transaction payload:
    // [nonce, gasPrice, gasLimit, to, value, data, v, r, s]
    let mut signed_payload = Vec::with_capacity(unsigned_payload.len() + 80);
    signed_payload.extend_from_slice(&encode_u64(params.nonce));
    signed_payload.extend_from_slice(&encode_bigint_bytes(params.gas_price_wei));
    signed_payload.extend_from_slice(&encode_u64(params.gas_limit));
    signed_payload.extend_from_slice(&encode_bytes(params.to));
    signed_payload.extend_from_slice(&encode_bigint_bytes(params.value_wei));
    signed_payload.extend_from_slice(&encode_bytes(params.data));
    signed_payload.extend_from_slice(&encode_u64(v));
    signed_payload.extend_from_slice(&encode_bigint_bytes(&r_bytes));
    signed_payload.extend_from_slice(&encode_bigint_bytes(&s_bytes));

    let signed_rlp = encode_list(&signed_payload);

    Ok(format!("0x{}", hex::encode(signed_rlp)))
}

/// Helper to parse a hex string or decimal string into big-endian bytes
pub fn parse_hex_or_dec_bytes(s: &str) -> Result<Vec<u8>, String> {
    let t = s.trim();
    if let Some(hex_part) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
        let clean = if hex_part.len() % 2 != 0 {
            format!("0{}", hex_part)
        } else {
            hex_part.to_string()
        };
        hex::decode(&clean).map_err(|e| format!("Invalid hex string: {}", e))
    } else {
        // Decimal string (e.g. 1000000000 or 20000000000000000000)
        let val: u128 = t
            .parse()
            .map_err(|e| format!("Failed to parse decimal number: {}", e))?;
        let full = val.to_be_bytes();
        let trimmed = trim_leading_zeroes(&full);
        Ok(trimmed.to_vec())
    }
}

/// Derive checksummed EVM address directly from secret (seed phrase or raw hex private key).
/// The private key buffer is held in Zeroizing and wiped immediately.
pub fn derive_evm_address_from_secret(secret: &str, wallet_type: &str) -> Result<String, String> {
    let pk = extract_evm_private_key(secret, wallet_type)?;
    crate::core::wallets::derivation::evm_address_only(&pk)
}

/// Helper to parse a 20-byte Ethereum address from a hex string
pub fn parse_address_20_bytes(address_str: &str) -> Result<[u8; 20], String> {
    let clean = address_str
        .trim()
        .strip_prefix("0x")
        .or_else(|| address_str.trim().strip_prefix("0X"))
        .unwrap_or_else(|| address_str.trim());
    if clean.len() != 40 {
        return Err(format!(
            "Address must be 40 hex characters (20 bytes), got length {}",
            clean.len()
        ));
    }
    let mut out = [0u8; 20];
    hex::decode_to_slice(clean, &mut out).map_err(|e| format!("Invalid address hex: {}", e))?;
    Ok(out)
}

/// Extract a secp256k1 EVM private key from secret (seed phrase or raw hex private key).
/// The private key is held exclusively in a Zeroizing wrapper.
pub fn extract_evm_private_key(
    secret: &str,
    wallet_type: &str,
) -> Result<Zeroizing<[u8; 32]>, String> {
    let t = secret.trim();
    match wallet_type {
        "seed" => {
            let mnemonic = bip39::Mnemonic::parse_normalized(t)
                .map_err(|e| format!("Invalid BIP-39 mnemonic phrase: {}", e))?;
            let seed_bytes = Zeroizing::new(mnemonic.to_seed(""));
            let path: bip32::DerivationPath = "m/44'/60'/0'/0/0"
                .parse()
                .map_err(|e| format!("Invalid derivation path: {}", e))?;
            let xprv = bip32::XPrv::derive_from_path(seed_bytes.as_ref(), &path)
                .map_err(|e| format!("EVM HD derivation failed: {}", e))?;
            Ok(Zeroizing::new(xprv.private_key().to_bytes().into()))
        }
        "pk" => {
            let clean = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")).unwrap_or(t);
            if clean.len() != 64 {
                return Err(format!(
                    "EVM private key must be 64 hex characters (32 bytes), got {}",
                    clean.len()
                ));
            }
            let mut raw = [0u8; 32];
            hex::decode_to_slice(clean, &mut raw)
                .map_err(|e| format!("Invalid EVM hex key: {}", e))?;
            Ok(Zeroizing::new(raw))
        }
        other => Err(format!(
            "Unsupported wallet type '{}' for EVM signing (expected 'seed' or 'pk')",
            other
        )),
    }
}

#[derive(Debug, Clone)]
pub struct EvmTransferParams<'a> {
    pub chain_id: u64,
    pub to_address: &'a str,
    pub value_wei_hex: &'a str,
    pub gas_price_wei_hex: &'a str,
    pub gas_limit: u64,
    pub nonce: u64,
}

/// High-level function to sign an EVM transfer with secret.
/// Secret is parsed, key derived in Zeroizing buffer, transaction signed, and key wiped immediately.
pub fn sign_evm_transfer_with_secret(
    secret: &str,
    wallet_type: &str,
    params: &EvmTransferParams<'_>,
) -> Result<String, String> {
    let pk = extract_evm_private_key(secret, wallet_type)?;
    let to_bytes = parse_address_20_bytes(params.to_address)?;
    let gas_price = parse_hex_or_dec_bytes(params.gas_price_wei_hex)?;
    let value = parse_hex_or_dec_bytes(params.value_wei_hex)?;

    let tx_params = EvmTxParams {
        nonce: params.nonce,
        gas_price_wei: &gas_price,
        gas_limit: params.gas_limit,
        to: &to_bytes,
        value_wei: &value,
        data: &[],
        chain_id: params.chain_id,
    };

    sign_evm_transaction(&pk, &tx_params)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_official_eip155_vector() {
        // Canonical test vector from EIP-155 specification (Vitalik Buterin)
        // Private Key: 0x4646464646464646464646464646464646464646464646464646464646464646
        // Nonce: 9
        // GasPrice: 20000000000 (0x04a817c800)
        // GasLimit: 21000 (0x5208)
        // To: 0x3535353535353535353535353535353535353535
        // Value: 1000000000000000000 (1 ETH = 0x0de0b6b3a7640000)
        // Data: empty
        // Chain ID: 1
        // Expected Raw Tx (canonical RFC 6979 deterministic signature):
        // 0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83

        let pk_bytes: [u8; 32] = [0x46; 32];
        let private_key = Zeroizing::new(pk_bytes);
        let to_addr = [0x35; 20];
        let gas_price = hex::decode("04a817c800").unwrap();
        let value = hex::decode("0de0b6b3a7640000").unwrap();

        let params = EvmTxParams {
            nonce: 9,
            gas_price_wei: &gas_price,
            gas_limit: 21000,
            to: &to_addr,
            value_wei: &value,
            data: &[],
            chain_id: 1,
        };

        let raw_tx = sign_evm_transaction(&private_key, &params).expect("Signing failed");
        // Matches ethers.js / web3.js standard RFC 6979 deterministic signature bit-for-bit
        let expected = "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83";

        assert_eq!(raw_tx, expected);
    }

    #[test]
    fn test_sign_evm_transfer_with_secret_seed_and_pk() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let seed_params = EvmTransferParams {
            chain_id: 1,
            to_address: "0x3535353535353535353535353535353535353535",
            value_wei_hex: "0x0de0b6b3a7640000",
            gas_price_wei_hex: "0x04a817c800",
            gas_limit: 21000,
            nonce: 0,
        };
        let raw_tx = sign_evm_transfer_with_secret(mnemonic, "seed", &seed_params)
            .expect("Signing from seed should succeed");
        assert!(raw_tx.starts_with("0x"));

        // Test with canonical EIP-155 private key
        let pk = "0x4646464646464646464646464646464646464646464646464646464646464646";
        let pk_params = EvmTransferParams {
            chain_id: 1,
            to_address: "0x3535353535353535353535353535353535353535",
            value_wei_hex: "0x0de0b6b3a7640000",
            gas_price_wei_hex: "0x04a817c800",
            gas_limit: 21000,
            nonce: 9,
        };
        let raw_tx_pk = sign_evm_transfer_with_secret(pk, "pk", &pk_params)
            .expect("Signing from pk should succeed");
        assert_eq!(
            raw_tx_pk,
            "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83"
        );
    }

    #[test]
    fn test_parse_hex_or_dec_bytes_large_decimal_u128() {
        // 20 ETH in wei = 20000000000000000000 > u64::MAX (18446744073709551615)
        let parsed = parse_hex_or_dec_bytes("20000000000000000000").expect("Should parse 20 ETH decimal");
        // 20 ETH = 0x01158e460913d00000 (9 bytes)
        assert_eq!(parsed.len(), 9);
        assert_eq!(parsed, hex::decode("01158e460913d00000").unwrap());

        // Zero decimal
        let zero = parse_hex_or_dec_bytes("0").expect("Should parse 0");
        assert!(zero.is_empty());
    }

    #[test]
    fn test_sign_evm_rejects_zero_and_invalid_address() {
        let pk_bytes: [u8; 32] = [0x46; 32];
        let private_key = Zeroizing::new(pk_bytes);
        let gas_price = hex::decode("04a817c800").unwrap();
        let value = hex::decode("0de0b6b3a7640000").unwrap();

        // 1. Zero address [0u8; 20] must be rejected
        let zero_addr = [0u8; 20];
        let params_zero = EvmTxParams {
            nonce: 0,
            gas_price_wei: &gas_price,
            gas_limit: 21000,
            to: &zero_addr,
            value_wei: &value,
            data: &[],
            chain_id: 1,
        };
        let res_zero = sign_evm_transaction(&private_key, &params_zero);
        assert!(res_zero.is_err());
        assert!(res_zero.unwrap_err().contains("zero address"));

        // 2. Invalid length address must be rejected
        let invalid_len = [0x35; 19];
        let params_invalid = EvmTxParams {
            nonce: 0,
            gas_price_wei: &gas_price,
            gas_limit: 21000,
            to: &invalid_len,
            value_wei: &value,
            data: &[],
            chain_id: 1,
        };
        let res_invalid = sign_evm_transaction(&private_key, &params_invalid);
        assert!(res_invalid.is_err());
    }

    #[test]
    fn test_derive_evm_address_from_secret() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let addr_seed = derive_evm_address_from_secret(mnemonic, "seed").expect("Derive from seed");
        assert_eq!(addr_seed, "0x9858EfFD232B4033E47d90003D41EC34EcaEda94");

        let pk = "0x4646464646464646464646464646464646464646464646464646464646464646";
        let addr_pk = derive_evm_address_from_secret(pk, "pk").expect("Derive from pk");
        assert_eq!(addr_pk, "0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F");
    }
}
