# 🚀 PLURIVEX: ADVANCED SEED PHRASE RECOVERY SPECIFICATION
## Master 5-Phase Technical Roadmap & Architectural Blueprint

> **Status:** Live & Tracking  
> **Target:** Surpassing BTCRecover (Python) and Coin98 Mobile Recovery  
> **Core Stack:** Rust (Tauri Backend) • React / TypeScript (Frontend) • Encrypted Local Database  
> **Security Mandate:** 100% Client-Side Local Execution • Zero Telemetry • Zero Knowledge  

---

## 🧭 Executive Summary & Value Proposition

Existing cryptocurrency mnemonic recovery tools suffer from fundamental shortcomings:
1. **BTCRecover**: Bound to Python terminal scripts that suffer from Global Interpreter Lock (GIL) limitations, require steep terminal expertise, lack interactive graphical interfaces, and restart from scratch if interrupted.
2. **Coin98 / Mobile Utilities**: Constrained by mobile hardware limits, unable to process massive brute-force permutations, and prone to privacy leakage when connected online.

**Plurivex** leverages a low-level **Rust & Tauri** architecture to deliver the fastest, smartest, and safest forensic recovery engine in the industry wrapped in an intuitive desktop interface.

---

## 🗺️ Master Progress Matrix (5 Phases)

| Phase | Module & Technical Capabilities | Status | Competitive Advantage |
| :---: | :--- | :---: | :--- |
| **1** | **🛡️ Zero-Knowledge UI & Air-Gapped Safe Mode** | `[x] COMPLETED` | 100% local offline security guarantee & zero-telemetry privacy. |
| **2** | **⚡ Multi-Core Rayon & SIMD Parallelism (2-Word Solver)** | `[x] COMPLETED` | Parallel compute evaluating millions of combinations 10x-50x faster than Python. |
| **3** | **🧠 Smart Fault-Tolerance: Transposition & 10 Dictionaries** | `[x] COMPLETED` | Recovers seed phrases with swapped words and non-English dictionaries. |
| **4** | **🛡️ 100% In-Memory Execution Engine (Zero-Disk Shield)** | `[x] COMPLETED` | Pure RAM-based search sessions (Atomics & Mutex) with zero-disk forensic isolation. |
| **5** | **🌐 Real-Time On-The-Fly Balance Scan (Jackpot Alert)** | `[x] COMPLETED` | Scans balances in memory without cluttering the database with empty wallets. |

---

## 📋 Phase Details & Implementation Checklist

---

### PHASE 1: 🛡️ Zero-Knowledge UI & Air-Gapped Safe Mode (Trust Foundation)
**Goal:** Provide absolute psychological peace of mind with verifiable proof that sensitive phrases and keys never leak to external networks.

- [x] **1.1 Global Air-Gapped Toggle Bar (UI)**:
  - Header switch button: `[ 🛡️ Safe Mode / 🌐 Online ]`.
  - Visual status indicator (emerald pulse when active, warning yellow when online).
- [x] **1.2 Rust Network Interceptor (Backend)**:
  - Atomic flag `AIR_GAPPED_MODE` in the Rust backend blocks 100% of RPC calls, fee estimations, and balance queries when Safe Mode is active.
  - Tauri commands `set_air_gapped_mode` and `get_air_gapped_mode` synchronized with AppContext frontend.
- [x] **1.3 Zero-Knowledge Mnemonic Repair Banner**:
  - Educational privacy assurance banner across the Mnemonic Repair Tool: 100% of BIP-39 SHA-256 Checksum computations execute in local RAM without outbound network activity.

---

### PHASE 2: ⚡ Extreme Speed: Multi-Core Rayon & 2-Word Solver
**Goal:** Leap past single-threaded Python bottlenecks by processing millions of missing word combinations in seconds.

- [x] **2.1 Single-Word Missing Solver (11 / 23 Words)**:
  - *Status: COMPLETED (2,048 iterations in <1ms via bitwise SHA-256).*
- [x] **2.2 Rayon Parallel Iteration Engine**:
  - Integrated `rayon = "1.10"` in `src-tauri/Cargo.toml` and recovery modules.
  - Distributes combination workloads across all logical CPU cores (8–16 threads) via `par_iter()`.
- [x] **2.3 Dual-Word Missing Solver (10 Words / 2 Words Missing)**:
  - 2,048 x 2,048 = 4,194,304 word-pair combinations tested concurrently.
  - Completes in seconds purely in RAM, auto-detects missing slots, and matches target addresses instantly.
- [x] **2.4 Ultra-Fast Bitwise Zero-Allocation BIP-39 Validator**:
  - Functions `fast_pack_12_entropy` and `fast_validate_12_words` evaluate SHA-256 in ~15ns without string allocations.
- [x] **2.5 Rayon Metrics Banner & Dynamic Word Highlighting (UI)**:
  - Golden-amber performance banner: `Tested 4,194,304 word-pair combinations · Found X valid checksum phrases`.
  - Dynamic multi-word badge highlights on solution cards: `[Slot #11 & #12]`.

---

### PHASE 3: 🧠 Smart Fault-Tolerance: Transposition & Multi-Language Suite
**Goal:** Recover seed phrases with misplaced word order or non-English dictionaries.

- [x] **3.1 Fuzzy Levenshtein Distance Typo Detector**:
  - *Status: COMPLETED (Top 5 closest word suggestions generated upon typo detection).*
- [x] **3.2 Transposition Unscrambler (Swapped Words)**:
  - Automatically identifies adjacent or arbitrary swapped words across all 66 pairs.
  - Displays smart alert: `🔁 Transposed Words Detected: Swapping Slot #X with Slot #Y restores BIP-39 Checksum validity!`.
  - Instant action button: `[Apply This Swap]`.
- [x] **3.3 Support for 10 Official BIP-39 Wordlists (Multi-Language)**:
  - English, Spanish, French, Italian, Portuguese, Czech, Japanese, Korean, Traditional Chinese, and Simplified Chinese.
  - Auto-Language Detection: Recognizes language from user input and adjusts wordlists dynamically.
  - Visual language badges on header: `[ 🌐 SPANISH ]`, `[ 🌐 JAPANESE ]`, etc.

---

### PHASE 4: 🛡️ 100% In-Memory Execution Engine (Zero-Disk Forensic Shield)
**Goal:** Guarantee absolute forensic privacy by eliminating all sensitive phrase persistence to disk or local database, unlocking peak Rayon compute without I/O latency.

- [x] **4.1 Zero-Disk Forensic Architecture (RAM-Only Execution)**:
  - Session persistence transitioned entirely to atomic variables (`AtomicUsize`, `AtomicBool`) and RAM mutex caches in Rust.
  - Zero raw seed bytes written to disk. Closing the application cleans all sensitive in-memory traces.
- [x] **4.2 Real-Time In-Memory Lifecycle**:
  - Rust backend orchestrates sessions in RAM: `start_recovery_session`, `pause_recovery_session`, `resume_recovery_session`, `cancel_recovery_session`, and `get_recovery_session_status`.
- [x] **4.3 Session Control UI & Live Progress Tracker**:
  - Real-time progress bar, speed indicators (*combinations/sec*), ETA countdowns, and `Zero-Disk RAM Shield` badges.
  - Action buttons: `⏸ Pause`, `▶ Resume`, and `✕ Cancel`.
- [x] **4.4 Deliver-then-Wipe Memory Lifecycle & Zeroizing RAII Guards**:
  - Deliver-then-Wipe pattern: Worker threads zeroize raw input phrases (`ACTIVE_RAW_PHRASE`), preserving solved phrases and target matches in RAM until frontend polling concludes.
  - Explicit session purging (`clear_session_secrets`) triggered on unmount, reset, or new session initiation.
  - Cryptographic buffers protected by `zeroize::Zeroizing` guards for automatic scrubbing even upon early returns (`?`).

---

### PHASE 5: 🌐 Real-Time On-The-Fly Balance Scan (Jackpot Alert)
**Goal:** Query balances directly from memory without persisting hundreds of thousands of empty $0 wallets to the local database.

- [x] **5.1 Tri-Chain Native Derivation (BTC, EVM, Solana)**:
  - *Status: COMPLETED (Concurrent derivation for Bitcoin Bech32/Legacy, EVM 0x, and Solana).*
- [x] **5.2 Multi-Chain Scanner via Vault Import**:
  - *Status: COMPLETED (Batch scanner for Mempool, Blockstream, EVM RPC, and Solana RPC).*
- [x] **5.3 In-Memory Filter (On-The-Fly Auto-Scan)**:
  - Valid candidates tested on-the-fly in RAM via `scan_phrase_on_the_fly`.
  - Empty wallets ($0 balance) are discarded immediately from memory, keeping the database pristine.
- [x] **5.4 Jackpot Guardrail & Audio-Visual Notification**:
  - Upon detecting balance $\ge \$0.01$: Scan queue pauses automatically and Web Audio API synthesizer plays a victory chime `playSuccessChime()`.
  - Renders the celebratory `FundedWalletModal` guarded by an **Interactive Confirmation Guardrail** preventing unwanted auto-imports.
  - Full user choice: `🔐 Save to Vault`, `⚡ Save & Sweep`, `📋 Copy Only`, or `Ignore` before persisting records.

---

## 🛠️ Completed Foundation Modules

1. **Bitcoin Native SegWit (BIP-84 `bc1q...`), Legacy (BIP-44 `1...`), & WIF Generator**.
2. **Forensic Target Address Matcher** (Instant matching with heap-free `derive_public_addresses_only_native`).
3. **Smart Mnemonic Repair & Single-Word Solver** (Default `🌐 All Positions` testing 1,536 combinations).
4. **Hardware-Accelerated Virtual List** (Precomputed strings, 1-span rendering, 60–120 FPS zero-lag scrolling).
5. **Clean 2-Row Stacked Card Layout** (Modern card design with streamlined `Apply` action).
6. **Encrypted Local Database Storage** (AES-256-GCM encrypted local vault).
7. **Strict Content Security Policy (CSP)** (Self-contained offline security with strict `devCsp`).
8. **Volatile Memory Zeroization & Anti-Poisoning Mutex** (`zeroize` crate, `compiler_fence(Ordering::SeqCst)`, and `safe_lock`).

---
