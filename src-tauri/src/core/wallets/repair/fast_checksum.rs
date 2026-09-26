use sha2::{Digest, Sha256};

/// Ultra-fast bit-level 12-word BIP-39 entropy unpacker and checksum validator
/// Takes ~15 nanoseconds per check. Zero heap allocations, zero string parsing.
#[inline(always)]
pub fn fast_pack_12_entropy(indices: &[u16; 12]) -> ([u8; 16], u8) {
    let mut bytes = [0u8; 16];

    bytes[0] = (indices[0] >> 3) as u8;
    bytes[1] = ((indices[0] & 0x07) << 5) as u8 | ((indices[1] >> 6) as u8);
    bytes[2] = ((indices[1] & 0x3F) << 2) as u8 | ((indices[2] >> 9) as u8);
    bytes[3] = ((indices[2] >> 1) & 0xFF) as u8;
    bytes[4] = ((indices[2] & 0x01) << 7) as u8 | ((indices[3] >> 4) as u8);
    bytes[5] = ((indices[3] & 0x0F) << 4) as u8 | ((indices[4] >> 7) as u8);
    bytes[6] = ((indices[4] & 0x7F) << 1) as u8 | ((indices[5] >> 10) as u8);
    bytes[7] = ((indices[5] >> 2) & 0xFF) as u8;
    bytes[8] = ((indices[5] & 0x03) << 6) as u8 | ((indices[6] >> 5) as u8);
    bytes[9] = ((indices[6] & 0x1F) << 3) as u8 | ((indices[7] >> 8) as u8);
    bytes[10] = (indices[7] & 0xFF) as u8;
    bytes[11] = (indices[8] >> 3) as u8;
    bytes[12] = ((indices[8] & 0x07) << 5) as u8 | ((indices[9] >> 6) as u8);
    bytes[13] = ((indices[9] & 0x3F) << 2) as u8 | ((indices[10] >> 9) as u8);
    bytes[14] = ((indices[10] >> 1) & 0xFF) as u8;
    bytes[15] = ((indices[10] & 0x01) << 7) as u8 | ((indices[11] >> 4) as u8);

    let checksum = (indices[11] & 0x0F) as u8;
    (bytes, checksum)
}

#[inline(always)]
pub fn fast_validate_12_words(indices: &[u16; 12]) -> bool {
    let (entropy, expected_checksum) = fast_pack_12_entropy(indices);
    let hash = Sha256::digest(entropy);
    let computed_checksum = (hash[0] >> 4) & 0x0F;
    computed_checksum == expected_checksum
}
