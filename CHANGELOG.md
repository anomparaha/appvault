# Changelog

All notable changes to the Plurivex application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] - 2026-09-12

### 🛡️ Intelligent Address Inspector, Cross-Chain Contract Guard & UI Harmonization
- **Intelligent Recipient Address Inspector**: Implemented real-time on-chain inspection in `SendModal` to distinguish Standard Wallets (EOA), Smart Contract Wallets (Gnosis Safe Multi-Sig & ERC-4337 Smart Accounts), ERC-20 Token Contracts, and Generic Smart Contracts.
- **Cross-Chain Smart Contract Discovery**: Added parallel multi-chain bytecode probing across Ethereum, Robinhood Chain, BNB Chain, Base, and Arbitrum. If an address is a contract deployed on another network (such as Robinhood Chain), Plurivex detects the network mismatch, alerts the user to prevent catastrophic fund loss, and provides a 1-click `Switch Network` action.
- **Catastrophic Loss Prevention**: Hardened transfer safeguards that automatically block native coin transfers to ERC-20 token contracts (USDT, USDC, DAI, WETH, WBTC, PLX, and unlisted tokens) unless explicitly acknowledged via safety bypass.
- **Frosted Glass Lumina Button Architecture**: Harmonized all action buttons across the dashboard hero, sweeper controls, filter pills, and modal dialogs with sleek 29px/32px dimensions, frosted borders, and refined radius geometry.
- **Official Token Balance Widget**: Clarified the official token widget header from ambiguous "Vault Holdings" to standard "Token Balance".
- **Complete English Language Standardization**: Conducted an exhaustive codebase audit ensuring 100% pure standard English across all UI strings, alert banners, tooltips, error messages, and source code.

## [0.1.6] - 2026-09-11

### 🚀 RPC Manager, DEX Trader Controls, Directory Drawer & English Localization
- **Multi-Chain RPC Node Manager**: Built a functional 7-chain RPC management workspace (`RpcManagerWorkspace.tsx`) with native Rust latency and block height testing engine (`ping_rpc_node`), custom RPC node persistence in local storage, and Air-Gapped Safe Mode detection.
- **Safety Controls & Coming Soon Status**: Marked DEX Trader, Allowances, and Activity with `SOON` badges, disabling navigation and action buttons with informative hover tooltips, and removing confusing placeholder simulation controls until live on-chain routers are ready.
- **Animated Wallets Directory Drawer**: Built a high-performance sliding side drawer (`WalletsDrawer.tsx`) featuring a curved toggle tab on the right screen edge with smooth layout transitions, live filtering, and virtualized scrolling for thousands of wallets.
- **Dedicated Single-Wallet Deletion**: Added granular single-wallet removal with confirmation modal (`DeleteWalletModal.tsx`) and native SQLite database deletion command (`delete_wallet`), preventing accidental wallet wipes.
- **Mobile & Narrow Viewport Responsiveness**: Hardened layout CSS and flex wrapping across the dashboard, sweeper cards, and `SolanaDiagnosticCard.tsx` (overflow truncation and copy-to-clipboard for long cryptographic authorities and addresses).
- **100% English Language Standardization**: Comprehensive localization audit converting all UI strings, tooltips, comments, and prototype files to natural, professional English with zero AI clichés.
- **Quality Assurance**: Rust backend compiling cleanly, 72/72 unit tests passing; 100% clean TypeScript/Vite production build.

## [0.1.5] - 2026-09-08

### ⚡ Performance, Concurrency & UI Patch
- **Zero-Downtime Asynchronous SQLite Migration**: Automated background re-encryption and chunked migration (Rayon parallel decryption, 100-item transactions, and wipe-on-lock session cancellation) of legacy unkeyed fingerprints to `hmac1:...` on vault unlock across both password and PIN paths, eliminating UI freezing while preserving memory zeroization.
- **Race-Condition Resilience**: Verified atomic deduplication preventing duplicate or constraint errors when wallets are concurrently imported during background migration.
- **Pure Reset Guard**: Extracted `validate_reset_confirmation` pure function shared between production IPC command and unit tests.
- **WebView2 Native Reveal Suppression**: Hidden Microsoft Edge / WebView2 default password reveal button (`::-ms-reveal` / `::-ms-clear`), eliminating visual double eye icon glitch.
- **Quality Assurance**: 71/71 Rust unit tests passing; 100% clean TypeScript & Vite production build.

## [0.1.4] - 2026-09-08

### 🛡️ Security Hardening & Audit Remediation (Full P0 Closure)
- **H1 (Keyed HMAC-SHA256 Fingerprint)**: Completely replaced unkeyed SHA-256 fingerprinting with native HMAC-SHA256 (`hmac1:...`) derived from user master password with zeroizing memory lifecycle (`Zeroizing<[u8; 32]>`), permanently neutralizing offline dictionary and rainbow table oracle attacks on `plurivex.db`.
- **H2 (Elimination of Verification Token Exposure)**: Completely removed `vault_db_get_verification_token` from Tauri IPC and permissions. Implemented native `vault_db_verify_master_password` in Rust Argon2id so verification hashes never touch JavaScript or webview memory.
- **M1 (Fail-Closed Unlock Architecture)**: Hardened `vault_session_unlock` to strictly fail closed if SQLite connection or token verification encounters errors.
- **M2 (Vault Reset Protection)**: Guarded `vault_db_reset_entire_vault` at the native IPC layer with an explicit confirmation payload (`CONFIRM_RESET_ENTIRE_VAULT`) and automatic session wipe, eliminating accidental or local DoS attack vectors.
- **Strict Ingestion Fail-Closed & Type Safety**: Required `sessionToken: string` across `walletFingerprint`, `walletFingerprintsBatch`, and `processFilesStreaming` with runtime throw guards, preventing unauthenticated fallback during active sessions.

### ⚡ Performance & Usability Optimizations
- **Bulk Ingestion Batch IPC**: Integrated `vault_calculate_fingerprints_batch` into folder scanning and multi-wallet drag-and-drop processing, reducing Tauri IPC round-trips by ~99% during deep directory imports.
- **Accurate Error Reporting**: Distinctly categorized native IPC/session failures (`skippedCorruptCount` / `skippedErrors`) from true vault duplicates (`skippedDuplicate`).
- **Fixed AppContext Single-Hook Wiring (B1)**: Resolved multiple instance hook allocations in `AppContext.tsx`, restoring reliable wallet export, deletion, and reactive state synchronization.
- **Wallet Deletion UX**: Fixed wallet deletion confirmation dialog and error handling in `WalletDetail.tsx`.

## [0.1.3] - 2026-09-07
- Native EVM EIP-155 signing in Rust core (k256).
- Native Solana ed25519 signing in Rust core (ed25519-dalek).
- Scoped in-memory vault session tokens.
- SQLite PRAGMA journal_mode=WAL and PRAGMA busy_timeout=5000 concurrency guards.