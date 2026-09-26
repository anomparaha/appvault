use std::sync::atomic::{compiler_fence, Ordering};
pub use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

/// Secure buffer that is automatically zeroed out from RAM upon drop
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

/// Overwrite any mutable byte slice with zeroes and invoke compiler fence
/// ensuring memory is cleared even with compiler optimizations enabled.
pub fn secure_zero_slice(slice: &mut [u8]) {
    slice.zeroize();
    compiler_fence(Ordering::SeqCst);
}

/// Overwrite a mutable string buffer with zeroes in RAM and clear it
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
