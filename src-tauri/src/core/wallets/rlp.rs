//! Pure Rust RLP (Recursive Length Prefix) Encoder for Ethereum Transactions (EIP-155 / Legacy)
//! Fully self-contained, zero external dependencies.

/// Encode a byte slice according to Ethereum RLP rules.
pub fn encode_bytes(bytes: &[u8]) -> Vec<u8> {
    let len = bytes.len();
    if len == 1 && bytes[0] < 0x80 {
        vec![bytes[0]]
    } else if len <= 55 {
        let mut out = Vec::with_capacity(1 + len);
        out.push(0x80 + len as u8);
        out.extend_from_slice(bytes);
        out
    } else {
        let len_bytes = to_be_bytes_trimmed(len as u64);
        let mut out = Vec::with_capacity(1 + len_bytes.len() + len);
        out.push(0xb7 + len_bytes.len() as u8);
        out.extend_from_slice(&len_bytes);
        out.extend_from_slice(bytes);
        out
    }
}

/// Encode an unsigned integer (big-endian, no leading zeroes; 0 is encoded as empty byte string).
pub fn encode_u64(val: u64) -> Vec<u8> {
    if val == 0 {
        vec![0x80] // RLP empty byte array
    } else {
        let bytes = to_be_bytes_trimmed(val);
        encode_bytes(&bytes)
    }
}

/// Encode an arbitrary big-endian byte slice representing a positive integer
/// (strips leading zeroes; all zeroes or empty is treated as 0 -> 0x80).
pub fn encode_bigint_bytes(bytes: &[u8]) -> Vec<u8> {
    let trimmed = trim_leading_zeroes(bytes);
    if trimmed.is_empty() {
        vec![0x80]
    } else {
        encode_bytes(trimmed)
    }
}

/// Encode an RLP list containing the concatenated RLP encodings of its items.
pub fn encode_list(items_payload: &[u8]) -> Vec<u8> {
    let len = items_payload.len();
    if len <= 55 {
        let mut out = Vec::with_capacity(1 + len);
        out.push(0xc0 + len as u8);
        out.extend_from_slice(items_payload);
        out
    } else {
        let len_bytes = to_be_bytes_trimmed(len as u64);
        let mut out = Vec::with_capacity(1 + len_bytes.len() + len);
        out.push(0xf7 + len_bytes.len() as u8);
        out.extend_from_slice(&len_bytes);
        out.extend_from_slice(items_payload);
        out
    }
}

/// Helper to convert a u64 into big-endian bytes with all leading zeros stripped.
#[inline]
pub fn to_be_bytes_trimmed(val: u64) -> Vec<u8> {
    let full = val.to_be_bytes();
    let trimmed = trim_leading_zeroes(&full);
    trimmed.to_vec()
}

/// Strip leading zeros from a byte slice.
#[inline]
pub fn trim_leading_zeroes(bytes: &[u8]) -> &[u8] {
    let first_non_zero = bytes.iter().position(|&b| b != 0);
    match first_non_zero {
        Some(idx) => &bytes[idx..],
        None => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rlp_single_bytes() {
        // [0x00, 0x7f] are self-encoded
        assert_eq!(encode_bytes(&[0x00]), vec![0x00]);
        assert_eq!(encode_bytes(&[0x7f]), vec![0x7f]);
        assert_eq!(encode_bytes(&[0x0f]), vec![0x0f]);
        // >= 0x80 has prefix
        assert_eq!(encode_bytes(&[0x80]), vec![0x81, 0x80]);
    }

    #[test]
    fn test_rlp_strings() {
        // empty string -> 0x80
        assert_eq!(encode_bytes(b""), vec![0x80]);
        // "dog" -> [0x83, 'd', 'o', 'g']
        assert_eq!(encode_bytes(b"dog"), vec![0x83, b'd', b'o', b'g']);
    }

    #[test]
    fn test_rlp_integers() {
        // 0 -> [0x80]
        assert_eq!(encode_u64(0), vec![0x80]);
        // 15 -> [0x0f]
        assert_eq!(encode_u64(15), vec![0x0f]);
        // 1000 (0x03e8) -> [0x82, 0x03, 0xe8]
        assert_eq!(encode_u64(1000), vec![0x82, 0x03, 0xe8]);
    }

    #[test]
    fn test_rlp_lists() {
        // Empty list -> 0xc0
        assert_eq!(encode_list(&[]), vec![0xc0]);

        // ["cat", "dog"] -> [0xc8, 0x83, 'c', 'a', 't', 0x83, 'd', 'o', 'g']
        let mut payload = Vec::new();
        payload.extend_from_slice(&encode_bytes(b"cat"));
        payload.extend_from_slice(&encode_bytes(b"dog"));
        assert_eq!(
            encode_list(&payload),
            vec![0xc8, 0x83, b'c', b'a', b't', 0x83, b'd', b'o', b'g']
        );
    }
}
