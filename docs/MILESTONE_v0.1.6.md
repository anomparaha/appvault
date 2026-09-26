# 🗺️ Plurivex Milestone v0.1.6: Supply Chain & Dependency Pruning

**Target Release:** v0.1.6  
**Focus:** Supply chain hardening, bundle size optimization, and dead code elimination.

---

## 🎯 Objectives & Action Items

### 1. Supply-Chain Hardening (12 Advisories Cleanup)
- **Status:** In v0.1.4, EVM transaction signing (RFC 6979 EIP-155) and Solana signing (ed25519) were completely migrated to native Rust core (k256 & ed25519-dalek).
- **Action:**
  - Deprecate and remove ethers dependency from package.json.
  - Deprecate and remove @solana/web3.js dependency from package.json.
  - Wire remaining utility functions (BIP-39 wordlist check, Solana curve check) to existing native Rust commands (`vault_validate_mnemonic`).
  - Eliminate 12 npm security advisories (including transitive elliptic vulnerabilities).
  - Reduce bundle size by ~400 KB.

### 2. Dead Module Cleanup
- **Remove src/lib/crypto.ts**:
  - The client-side Argon2 verification wrapper is now obsolete and has 0 active importers across the repository.
- **Durable-Nonce Account Sweep Hardening (B2)**:
  - Audit Solana System program nonce withdrawal instructions for two-step (advance + withdraw) compliance or mark as unsupported in UI.

### 3. Native Reset Confirmation Helper (Completed in 8132508)
- ✅ Extracted pure helper `validate_reset_confirmation(&str) -> Result<(), String>` in `src-tauri/src/db/commands.rs` shared identically between production IPC command and unit tests.

### 4. Cross-Platform Clipboard Auto-Clear (L2)
- Integrate platform-agnostic clipboard clearing via `arboard` crate for Linux and macOS environments.