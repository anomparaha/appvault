use rand::RngCore;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use zeroize::Zeroizing;

/// Represents an authenticated in-memory vault session.
/// The `master_key` is wrapped in `Zeroizing` so its memory
/// is automatically wiped (zeroed) with 0x00 when dropped.
pub struct VaultSession {
    pub session_token: String,
    pub master_key: Zeroizing<String>,
    pub fingerprint_key: Zeroizing<[u8; 32]>,
    pub last_activity_sec: u64,
    pub timeout_seconds: u64,
}

/// Thread-safe in-memory session manager for Plurivex Vault
pub struct SessionManager {
    session: Mutex<Option<VaultSession>>,
    default_timeout_seconds: u64,
}

static SESSION_MANAGER: OnceLock<SessionManager> = OnceLock::new();

pub fn get_session_manager() -> &'static SessionManager {
    SESSION_MANAGER.get_or_init(|| SessionManager::new(900)) // Default 15 minutes
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new(900)
    }
}

impl SessionManager {
    pub fn new(default_timeout_seconds: u64) -> Self {
        Self {
            session: Mutex::new(None),
            default_timeout_seconds,
        }
    }

    /// Unlock the vault and establish an in-memory session.
    /// Returns an opaque 64-char hex cryptographically random session token.
    pub fn unlock(&self, password: String, timeout_seconds: Option<u64>) -> String {
        self.unlock_with_salt(password, None, timeout_seconds)
    }

    /// Unlock with optional vault-specific salt for fingerprint derivation
    pub fn unlock_with_salt(&self, password: String, salt: Option<&[u8]>, timeout_seconds: Option<u64>) -> String {
        let mut token_bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut token_bytes);
        let session_token = hex::encode(token_bytes);

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let timeout = timeout_seconds.unwrap_or(self.default_timeout_seconds);
        let fp_key = crate::core::security::crypto::derive_fingerprint_key(&password, salt);

        let new_session = VaultSession {
            session_token: session_token.clone(),
            master_key: Zeroizing::new(password),
            fingerprint_key: Zeroizing::new(fp_key),
            last_activity_sec: now,
            timeout_seconds: timeout,
        };

        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(new_session);

        session_token
    }

    /// Lock the vault immediately: drops active session (zeroizing master_key)
    /// and terminates any ongoing recovery sessions.
    pub fn lock(&self) {
        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        *guard = None;
        #[cfg(not(test))]
        let _ = crate::core::wallets::recovery_session::clear_recovery_session("");
    }

    /// Check if the vault session is currently active and matches the given session token.
    /// Does not refresh the session activity timer (read-only liveness check).
    pub fn is_session_active(&self, session_token: &str) -> bool {
        if session_token.is_empty() {
            return false;
        }
        let guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref sess) = *guard {
            sess.session_token == session_token
        } else {
            false
        }
    }

    /// Check if there is an active valid session matching the provided token
    pub fn is_authenticated(&self, session_token: &str) -> bool {
        if session_token.is_empty() {
            return false;
        }
        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());

        if let Some(ref mut sess) = *guard {
            if sess.session_token != session_token {
                return false;
            }
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            if now.saturating_sub(sess.last_activity_sec) >= sess.timeout_seconds {
                // Expired! Lock immediately
                *guard = None;
                #[cfg(not(test))]
                let _ = crate::core::wallets::recovery_session::clear_recovery_session("");
                return false;
            }
            sess.last_activity_sec = now;
            true
        } else {
            false
        }
    }

    /// Retrieve a zeroizing copy of the master password, validating the token and idle timeout.
    /// Refreshes the last activity timestamp on success.
    pub fn get_master_key(&self, session_token: &str) -> Result<Zeroizing<String>, String> {
        if session_token.is_empty() {
            return Err("Session token cannot be empty".to_string());
        }

        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());

        let sess = guard
            .as_mut()
            .ok_or_else(|| "Vault is locked. Authenticate first.".to_string())?;

        if sess.session_token != session_token {
            return Err("Invalid session token. Access denied.".to_string());
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if now.saturating_sub(sess.last_activity_sec) >= sess.timeout_seconds {
            // Auto-lock on timeout
            *guard = None;
            #[cfg(not(test))]
            let _ = crate::core::wallets::recovery_session::clear_recovery_session("");
            return Err("Session expired. Vault is locked.".to_string());
        }

        sess.last_activity_sec = now;
        Ok(Zeroizing::new(sess.master_key.as_str().to_string()))
    }

    /// Retrieve a zeroizing copy of the derived fingerprint HMAC key, validating the token and idle timeout.
    /// Refreshes the last activity timestamp on success.
    pub fn get_fingerprint_key(&self, session_token: &str) -> Result<Zeroizing<[u8; 32]>, String> {
        if session_token.is_empty() {
            return Err("Session token cannot be empty".to_string());
        }

        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());

        let sess = guard
            .as_mut()
            .ok_or_else(|| "Vault is locked. Authenticate first.".to_string())?;

        if sess.session_token != session_token {
            return Err("Invalid session token. Access denied.".to_string());
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if now.saturating_sub(sess.last_activity_sec) >= sess.timeout_seconds {
            // Auto-lock on timeout
            *guard = None;
            #[cfg(not(test))]
            let _ = crate::core::wallets::recovery_session::clear_recovery_session("");
            return Err("Session expired. Vault is locked.".to_string());
        }

        sess.last_activity_sec = now;
        Ok(Zeroizing::new(*sess.fingerprint_key))
    }

    /// Execute a closure with a borrowed reference to the master key string.
    pub fn with_master_key<F, R>(&self, session_token: &str, f: F) -> Result<R, String>
    where
        F: FnOnce(&str) -> Result<R, String>,
    {
        let key = self.get_master_key(session_token)?;
        f(&key)
    }

    /// Check if vault is locked
    pub fn is_locked(&self) -> bool {
        let guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        guard.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_unlock_and_token_validation() {
        let sm = SessionManager::new(60);
        let password = "MySecretVaultPassword123!";
        let token = sm.unlock(password.to_string(), None);

        assert_eq!(token.len(), 64);
        assert!(sm.is_authenticated(&token));

        let retrieved_key = sm.get_master_key(&token).expect("Valid token should succeed");
        assert_eq!(retrieved_key.as_str(), password);
    }

    #[test]
    fn test_session_lock_wipes_key_and_rejects_subsequent_calls() {
        let sm = SessionManager::new(60);
        let token = sm.unlock("TestPassword".to_string(), None);
        assert!(sm.is_authenticated(&token));

        sm.lock();

        assert!(!sm.is_authenticated(&token));
        assert!(sm.is_locked());
        let err = sm.get_master_key(&token).unwrap_err();
        assert!(err.contains("Vault is locked"));
    }

    #[test]
    fn test_session_idle_timeout_auto_lock() {
        // Set timeout to 1 second
        let sm = SessionManager::new(1);
        let token = sm.unlock("ExpiringPassword".to_string(), Some(1));
        assert!(sm.is_authenticated(&token));

        // Sleep 1.2 seconds to exceed timeout
        std::thread::sleep(std::time::Duration::from_millis(1200));

        // Subsequent call must trigger auto-lock and fail
        assert!(!sm.is_authenticated(&token));
        let err = sm.get_master_key(&token).unwrap_err();
        assert!(err.contains("Session expired") || err.contains("Vault is locked"));
        assert!(sm.is_locked());
    }

    #[test]
    fn test_session_wrong_token_rejected() {
        let sm = SessionManager::new(60);
        let token = sm.unlock("Password".to_string(), None);
        let bogus_token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        assert!(!sm.is_authenticated(bogus_token));
        let err = sm.get_master_key(bogus_token).unwrap_err();
        assert!(err.contains("Invalid session token"));
        // Legitimate token should still work
        assert!(sm.is_authenticated(&token));
    }

    #[test]
    fn test_session_fingerprint_key_lifecycle() {
        let sm = SessionManager::new(60);
        let password = "VaultKeyPassword123";
        let token = sm.unlock(password.to_string(), None);

        let fp_key = sm.get_fingerprint_key(&token).expect("Valid token gets fingerprint key");
        assert_ne!(*fp_key, [0u8; 32], "Fingerprint key should be non-zero");

        // Derived key must match standalone derivation
        let expected = crate::core::security::crypto::derive_fingerprint_key(password, None);
        assert_eq!(*fp_key, expected);

        sm.lock();
        assert!(sm.get_fingerprint_key(&token).is_err());
    }
}
