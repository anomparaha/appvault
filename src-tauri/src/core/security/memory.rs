use std::sync::atomic::{compiler_fence, Ordering};
pub use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

/// Buffer whose managed bytes are overwritten with `zeroize` when dropped. This is a best-effort process-memory measure, not a guarantee of physical RAM erasure or clearing every copy.
pub struct SecureBuffer {
    data: Vec<u8>,
}

impl Zeroize for SecureBuffer {
    fn zeroize(&mut self) {
        self.data.zeroize();
    }
}

impl ZeroizeOnDrop for SecureBuffer {}

impl Drop for SecureBuffer {
    fn drop(&mut self) {
        self.zeroize();
    }
}

impl SecureBuffer {
    pub fn new(data: Vec<u8>) -> Self {
        Self { data }
    }

    pub fn as_slice(&self) -> &[u8] {
        &self.data
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
}

/// Overwrite a mutable byte slice with zeroes and issue a compiler fence to
/// discourage removal/reordering of the explicit clearing operation. This does
/// not guarantee physical RAM erasure or clearing copies held elsewhere.
pub fn secure_zero_slice(slice: &mut [u8]) {
    slice.zeroize();
    compiler_fence(Ordering::SeqCst);
}

/// Overwrite the current mutable string buffer with zeroes and clear its length.
/// This is best-effort and does not clear copies held elsewhere.
pub fn secure_zero_string(s: &mut String) {
    unsafe {
        s.as_bytes_mut().zeroize();
    }
    s.clear();
    compiler_fence(Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secure_zero_slice() {
        let mut secret = vec![1, 2, 3, 4, 5];
        secure_zero_slice(&mut secret);
        assert_eq!(secret, vec![0, 0, 0, 0, 0]);
    }

    #[test]
    fn test_secure_buffer_drop() {
        let buf = SecureBuffer::new(vec![42, 42, 42]);
        assert_eq!(buf.len(), 3);
        drop(buf);
    }
}
