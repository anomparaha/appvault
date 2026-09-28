# 🛡️ Plurivex

> **The Ultimate Multi-Chain Desktop Security Vault, Forensic Seed Phrase Recovery Suite, and Batch Execution Console.**  
> *Built with Rust (Tauri v2 Core) • React 19 • TypeScript • Vite • Rayon Parallel Computing • Encrypted Local Database*

---

## 🧭 Project Overview

**Plurivex** is a local-first, non-custodial desktop application powered by **Rust (Tauri v2 Core) + React 19 + TypeScript** for digital-asset inspection, key management, and wallet recovery. Vault data is handled locally, while explicitly enabled balance, metadata, market-data, and transaction features contact configured third-party providers in Online Mode. Safe Mode is an app-level request gate, not OS-level network isolation.

The application unifies multi-chain key identity management (EVM, Solana, and Bitcoin), a high-speed seed phrase recovery engine powered by Rayon multi-threading, concurrent multi-network balance scanning, and batch fund sweeping into a single cohesive desktop command center.

---

## ⚡ Core Capabilities

### 1. 🔐 Multi-Chain Cryptographic Key Derivation
- **EVM (BIP-44 `m/44'/60'/0'/0/0`)**: Comprehensive support for Ethereum, BNB Chain (BSC), Base, Arbitrum, Polygon, and all EVM-compatible networks.
- **Solana (SLIP-0010 `m/44'/501'/0'/0'`)**: Native Ed25519 derivation complete with SPL token detection and Solana program account diagnostics.
- **Bitcoin (Tri-Address Format)**:
  - **Native SegWit (BIP-84 `m/84'/0'/0'/0/0`)**: Bech32 format (`bc1q...`) for optimal transaction fee efficiency.
  - **Legacy (BIP-44 `m/44'/0'/0'/0/0`)**: Base58Check format (`1...`) for legacy wallet compatibility.
  - **WIF (Wallet Import Format)**: Compressed Base58 private keys for swift cold-wallet importing.

### 2. 🧠 Seed Phrase Recovery Engine (Process-Memory Session)
- **In-Process Search State**: The recovery worker keeps its active phrase and search state in Rust process memory and does not intentionally persist candidate phrases. This does not prevent operating-system paging, crash dumps, or copies in the runtime and other processes; it is not a forensic-erasure guarantee.
- **Single-Word Solver**: Resolves 1 missing word (11 words into 12 words) in < 1 millisecond (2,048 tested combinations).
- **Dual-Word Solver**: Evaluates $2,048 \times 2,048 = 4,194,304$ word-pair combinations in **1–3 seconds** leveraging multi-core CPU parallelization (Rayon). Capable of evaluating all 66 possible slot position pairs (~276M phrases) in minimal time.
- **10 Official BIP-39 Wordlists**: Supports English, Spanish, French, Italian, Portuguese, Czech, Japanese, Korean, Traditional Chinese, and Simplified Chinese with Auto-Language Detection.
- **Transposition Unscrambler**: Automatically detects and restores transposed words (*swapped adjacent or arbitrary words*).
- **Forensic Target Address Matcher**: Instantly isolates the winning seed phrase when a target public address (EVM, Solana, or Bitcoin) is supplied.
- **Live On-The-Fly Balance Scanner & Jackpot Guardrail**: Scans on-chain balances directly in RAM during computation without cluttering the local database with empty wallets. Features a *Jackpot Celebration Chime* (Web Audio API) when funded assets are discovered, backed by an **Interactive Confirmation Guardrail** to prevent silent auto-imports—users can choose *"Save to Vault"*, *"Save & Sweep"*, or *"Copy Only"* before records are persisted.
- **Real-Time Session Controls**: Full operational control to **Start**, **Pause**, **Resume**, and **Cancel** recovery sessions with live ETA countdowns and speed indicators (*combinations/second*).

### 3. 🛡️ Enterprise-Grade Security & Privacy
- **Modern Vault Encryption**: Powered by **Argon2id (PLX1) + AES-256-GCM** with a unique 16-byte salt and 12-byte nonce, featuring automated backward compatibility for legacy PBKDF2 vaults.
- **Dual Authentication**: Master Password authentication alongside an optional Quick 6-Digit PIN for seamless daily navigation.
- **Safe Mode (app-level network gate)**: Starts enabled on first launch and is synchronized with the Rust command layer. Gated Tauri requests and application WebSocket clients require an authenticated vault session and Online Mode. This is not a kernel/OS firewall, does not block unrelated system traffic, and cannot guarantee cancellation of requests already accepted by a remote server.
- **Optional RPC provider configuration**: No provider key is baked into the app. Helius DAS metadata lookup is optional via the native runtime environment variable `PLURIVEX_HELIUS_API_KEY` (Helius currently requires the key as a query parameter; native request errors redact URLs). Authenticated Robinhood WebSocket endpoints are not configured in the renderer because credential-bearing URLs would expose provider keys; the app uses gated public HTTP RPC polling for Robinhood updates instead.
- **Plaintext Export Protection (Guardrail)**: Interactive security confirmation dialog prior to exporting seed phrases or private keys to disk, complete with automatic Bitcoin WIF private key derivation.
- **Database Concurrency Protection**: Configured with `PRAGMA busy_timeout = 5000;` and `PRAGMA journal_mode = WAL;` across Rust (`rusqlite`) and TypeScript (`@tauri-apps/plugin-sql`) to prevent database lock contention.
- **Native OS Clipboard Auto-Clear**: Native Windows User32 timer that automatically purges the clipboard after 30 seconds, even when the application window is minimized or unfocused.
- **Content Security Policy (CSP)**: The webview restricts script sources to the app origin and blocks object embedding; outbound HTTPS/WSS remains allowed for app features that pass their own network gates. CSP is a defense-in-depth control, not a guarantee against every XSS or network threat.
- **Best-Effort Secret Buffer Clearing (`zeroize` Crate)**: Uses `zeroize` for selected managed buffers and a compiler fence in explicit clearing helpers. This does not guarantee physical RAM overwriting or removal of every copy held by libraries, the runtime, the OS, swap, or crash dumps.
- **Concurrency & Poisoning-Resistant Mutex**: Resilient memory lock system (`safe_lock`) and Atomic Generation Counters for race-condition-free Pause/Resume control.

### 4. 📊 Multi-Chain Balance Scanner & Real-Time Valuation
- **Concurrent Balance Scanning**: Multi-threaded Tokio RPC for EVM, Solana, and Bitcoin networks.
- **Secondary Token Detection**: Automated balance detection for ERC-20 & BEP-20 tokens (USDT, USDC, DAI, WBTC, LINK, UNI, CAKE, etc.) and Solana SPL tokens (USDC, USDT, BONK, JUP, RAY, WIF, etc.).
- **Real-Time Multi-Currency Valuation**: Market price aggregation supporting 13 fiat/crypto currencies (USD, IDR, EUR, GBP, JPY, CAD, AUD, CHF, SGD, CNY, INR, KRW, BRL), with centralized fallback handling and clean visual status indicators (`● Offline`) when rates are cached.
- **High-Precision Bitcoin Parsing**: Native Bitcoin parser dissecting Mempool and Blockstream RPC responses accurately.

### 5. ⚡ Batch Sweeper & Smart Universal File Extractor
- **Batch Sweeper**: Consolidates balances from multiple wallets to a designated destination with automated EIP-1559 gas optimization and offline transaction signing.
- **Smart Universal File Extractor**: Scans computer folders natively in Rust to parse and isolate private keys and seed phrases from unstructured log dumps or text files.

---

## 🏗️ Project Architecture

```
plurivex/
├── src/                                  # Frontend React 19 + TypeScript + Vite
│   ├── components/                       # UI grouped by feature/domain
│   │   ├── analytics/                    # Win-rate and trade-history views
│   │   ├── auth/                         # PIN & master-password screens
│   │   ├── layout/                       # Main shell, navigation, global UI
│   │   ├── modals/                       # Wallet, transaction, and security dialogs
│   │   ├── repair-workspace/             # Mnemonic forensic repair feature
│   │   │   ├── components/               # Repair workspace panels
│   │   │   ├── hooks/                    # Analysis and on-the-fly scan hooks
│   │   │   └── types.ts                  # Repair-session contracts
│   │   ├── sidebar/                      # Navigation & wallet catalog components
│   │   ├── trade/                        # Multi-wallet DEX batch trading
│   │   ├── wallet/                       # Wallet views and wallet/detail cards
│   │   └── workspaces/                   # Import, scanning, RPC, and sweep screens
│   ├── context/                          # Global app state and domain hooks
│   ├── icons/                            # Typed React icon components
│   ├── assets/icons/chains/              # Raw SVG assets used by chain icon wrappers
│   ├── lib/                              # Frontend domain logic, grouped by concern
│   │   ├── chains/                       # Chain configuration and token types
│   │   ├── crypto/                       # Native vault, clipboard, and fingerprint IPC
│   │   ├── db/                           # Local database IPC client
│   │   ├── services/                     # Scanning, activity, and transaction helpers
│   │   ├── types/                        # Per-domain type re-exports
│   │   ├── utils/                        # Formatting, QR, and audio helpers
│   │   └── wallets/                      # Wallet derivation, import, and BIP-39 helpers
│   └── styles/                           # Modular CSS design system

├── src-tauri/                            # Native Rust Core (Tauri v2)
│   ├── src/
│   │   ├── adapters/                     # Blockchain & Oracle Network Adapters
│   │   │   ├── evm/                      # [Live] EVM RPC client & ERC-20 definitions
│   │   │   ├── solana/                   # [Live] Solana RPC client & SPL token metadata
│   │   │   ├── pricing/                  # [Live] Price oracle aggregator (CoinGecko provider)
│   │   │   ├── bridge/                   # [Roadmap Stub] Cross-chain bridge adapter
│   │   │   └── explorers/                # [Roadmap Stub] Explorer URL router hub
│   │   ├── app/                          # IPC Application Layer
│   │   │   ├── commands.rs               # [Live] Tauri IPC command handlers & Air-Gapped flag
│   │   │   ├── registrar.rs              # [Live] App-domain command registration
│   │   │   └── state.rs                  # [Roadmap Stub] Application runtime state
│   │   ├── core/                         # Core Domain Logic
│   │   │   ├── scanner/                  # [Live] Multi-threaded concurrent balance scanner
│   │   │   │   ├── bitcoin.rs            # [Live] Bitcoin Mempool / Blockstream scanner & parser
│   │   │   │   ├── evm.rs                # [Live] EVM concurrent scanner
│   │   │   │   ├── solana.rs             # [Live] Solana balance scanner
│   │   │   │   └── pricing.rs            # [Live] Pricing feed service & baseline fallback
│   │   │   ├── security/                 # [Live] Argon2id, PBKDF2, AES-GCM, & memory zeroize
│   │   │   ├── vault/                    # [Live] Local Database directory & repository
│   │   │   │   ├── repository.rs         # [Live] Local Database repository & vault path
│   │   │   │   ├── models.rs             # [Roadmap Stub] Vault domain models
│   │   │   │   └── service.rs            # [Roadmap Stub] Vault high-level service
│   │   │   ├── wallets/                  # [Live] Wallet cryptography & seed recovery
│   │   │   │   ├── derivation.rs         # [Live] EVM, Solana, & Bitcoin Native SegWit derivation
│   │   │   │   ├── extractor.rs          # [Live] Log parser & credential extractor
│   │   │   │   ├── fingerprint.rs        # [Live] Keyed HMAC-SHA256 cryptographic deduplication engine
│   │   │   │   ├── import.rs             # [Live] Ultra-fast native folder scanner
│   │   │   │   ├── recovery_session.rs   # [Live] In-Memory Recovery Engine (Atomics, Zeroize & RAM cache)
│   │   │   │   └── repair/               # [Live] Rayon Multi-Core Mnemonic Repair Module
│   │   │   │       ├── fast_checksum.rs  # [Live] Bit-level validator 15ns per word
│   │   │   │       ├── single_missing.rs # [Live] 1-word missing solver
│   │   │   │       ├── dual_missing.rs   # [Live] 2-word missing Rayon parallel solver
│   │   │   │       ├── target_match.rs   # [Live] Forensic target address matcher
│   │   │   │       └── typos.rs          # [Live] Levenshtein distance & 10 BIP-39 dictionaries
│   │   │   ├── execution/                # [Roadmap Stub] Transaction queue & dry-run simulation
│   │   │   ├── network/                  # [Roadmap Stub] Proxy rotator & RPC latency hedging
│   │   │   ├── notifications/            # [Roadmap Stub] Webhook alerts (Discord/Slack)
│   │   │   └── archive/                  # [Roadmap Stub] Portable encrypted .plurivex archive
│   │   ├── db/                           # Local Database Commands & Migrations
│   │   │   ├── commands.rs               # [Live] SQLite vault IPC handlers
│   │   │   ├── migrations.rs             # [Live] Local database schema migrations
│   │   │   ├── registrar.rs              # [Live] Database command registration
│   │   │   └── schema.rs                 # [Live] Table name constants
│   │   ├── utils/                        # [Roadmap Stub] Error handling & time utilities
│   │   └── lib.rs                        # Tauri application runtime entrypoint
│   ├── permissions/                      # IPC capability access control (ACL)
│   ├── tauri.conf.json                   # Tauri v2 configuration & window metadata
│   └── Cargo.toml                        # Rust dependencies & build optimizations
│
└── docs/                                 # Architecture & Specification Documents
    ├── PLURIVEX_MASTER_FEATURE_SPEC.md   # Master 60-feature specification ("The Diamond 60")
    ├── PLURIVEX_IMPLEMENTATION_MATRIX.md # 1:1 Module implementation matrix
    ├── MODULARIZATION_AND_REFACTORING_PLAN.md # Modularization blueprint & execution status
    ├── PLURIVEX_FINAL_APPROVAL_NOTE.md   # Governance sign-off & baseline approval
    └── SMART_CONTRACT_PLAN.md            # Multi-chain smart contract specifications
```

---

## 🚀 Getting Started & Build Guide

### Prerequisites:
- **Node.js** v18+ & **npm**
- **Rust** v1.75+ (install via [rustup.rs](https://rustup.rs/))
- **Visual Studio C++ Build Tools** (on Windows)

### 1. Development Mode (Hot-Reload):
```bash
# Install frontend dependencies
npm install

# Run in desktop development mode
npm run tauri dev
```

### 2. Running Rust Unit Tests:
```bash
cd src-tauri
cargo test --lib
```
*The Rust test suite contains tests for cryptography, address derivation, pricing fallback, memory helpers, recovery lifecycle, and transaction signing. Run the command above in an environment with the Rust toolchain to verify the current checkout; test count and status are not asserted here.*

### 3. Building Release Installer (.exe / .msi):
```bash
npm run tauri build
```
The compiled binary installers (`.msi` and `.exe`) will be generated under:
`src-tauri/target/release/bundle/`

---

## 🔒 Security Assurance & Operational Guidelines

1. **Master Password Confidentiality**: Your Master Password is used directly to derive your Argon2id encryption key. Never share your local database file (`plurivex.db`).
2. **Recovery Session Handling**: Recovery candidates are processed in application memory and are not intentionally saved as a candidate list. This is not a forensic-erasure guarantee: operating-system paging, crash dumps, backups, or other processes may retain data outside the app's control.
3. **Safe Mode**: When inspecting or recovering sensitive phrases, enable **`🛡️ Safe Mode`** to disable new network requests made through the app's gated RPC, metadata, and market-data paths. It is an app-level control, not an OS-level network isolation feature; already-started requests may finish.
4. **Trusted Hardware**: Always operate the application on a dedicated, secure machine free from unauthorized software or keyloggers.
