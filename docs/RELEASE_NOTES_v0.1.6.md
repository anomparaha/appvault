# Plurivex v0.1.6 - RPC Manager, DEX Trader Controls, Directory Drawer & Localization
 
*Release Date: 2026-09-11*
*Version: v0.1.6*

---

## Highlights

Plurivex **v0.1.6** delivers an enhanced user experience with an interactive 7-chain RPC Node Manager, deactivation controls and `SOON` indicators for upcoming features, an interactive Wallets Directory side drawer, single-wallet management capabilities, hardened responsive layouts, and complete English language standardization across the application.

---

## Detailed Improvements

### 1. Multi-Chain RPC Node Manager (RpcManagerWorkspace.tsx)
- **Live Latency & Block Height Testing**: Native Rust engine command (`ping_rpc_node`) tests response times across Bitcoin, Ethereum, Solana, Arbitrum, Base, BSC, and Polygon.
- **Custom Node Storage**: Add, test, and remove custom RPC endpoints saved to persistent local storage.
- **Air-Gapped Isolation Support**: Displays active security status and halts external RPC pings during air-gapped safe mode.

### 2. Safety Controls & Coming Soon Status
- **Deactivated Unreleased Modules**: Marked DEX Trader, Allowances, and Activity with `SOON` badges and unclickable disabled buttons with informative tooltips.
- **Removed False Simulations**: Cleared misleading mock triggers in favor of transparent roadmap status until live on-chain routers are completed.

### 3. Interactive Sliding Wallets Directory Drawer (WalletsDrawer.tsx)
- **Smooth Animated Edge Pull Tab**: Replaced static modals with a side drawer accessible via a custom curved edge tab on the right screen border.
- **Dynamic Content Push**: Smoothly shifts the main workspace container on toggle to prevent awkward content overlap.
- **Virtualized High-Volume Browsing**: Easily search, filter, and select from thousands of wallets in real time with instant selection feedback.

### 2. Granular Single-Wallet Deletion Flow (DeleteWalletModal.tsx)
- **Dedicated Deletion Modal**: Allows users to safely delete individual wallets without risking bulk resets.
- **Native SQLite Command**: Backed by ault_db_delete_wallet with atomic transaction safety and instant reactive UI update.

### 3. Responsive UI & Text Overflow Hardening
- **Cryptographic Authority Truncation**: Corrected long text overflow in SolanaDiagnosticCard.tsx (e.g. Nonce Authority and Public Key badges) with interactive click-to-copy and instant tooltip feedback.
- **Flexible Grid Adapters**: Enhanced CSS layout across components.css and sweeper.css to gracefully handle narrow screens and window resizing.

### 4. Comprehensive English Localization
- **Complete Linguistic Audit**: Converted all UI labels, tooltips, drawer tabs, status messages, and developer comments from Indonesian to professional English.
- **Zero Indonesian Remnants**: Verified via automated multi-pass dictionary scans across all source files, documentation, and prototypes.

---

## Verification & Test Results
- **Rust Backend**: cargo check clean; cargo test 72/72 unit and security tests passing (100%).
- **Frontend Build**: 
pm run build completed cleanly in 2.61s with 0 errors.
