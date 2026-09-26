# Plurivex — Master Product Specification & Engineering Blueprint
> **Official Master Specification of 60 Features, Domain Architecture, and Engineering Blueprint ("The Diamond 60")**  
> *Document Version: 8.3 (The Definitive Production Freeze Baseline - Final Locked)*  
> *Target Platform v1: Windows 10/11 (macOS & Linux Parity on Roadmap v2)*  
> *File Location: `docs/PLURIVEX_MASTER_FEATURE_SPEC.md` (Securely stored locally on developer machine)*

---

## 🧭 1. Product Vision & System Boundaries

**Plurivex** is a high-performance desktop application powered by **Rust (Tauri Core) + React/TypeScript**, functioning as **The Ultimate Multi-Chain Desktop Security Vault, Portfolio Auditor, and Batch Execution Suite**.

### 🏛️ Product Architectural Paradigms:
* **Local-First & Non-Custodial:** All vault credentials, seed phrases, and private keys are stored locally in an encrypted database on the user machine.
* **No Mandatory Proprietary Backend:** Plurivex does not depend on centralized vendor cloud servers for wallet storage or asset custody (*Zero Vendor Cloud for Vault Storage*).
* **Blockchain Infrastructure Dependency:** Network-dependent features (balance scanning, market valuation, transaction simulation, broadcasting, webhooks) communicate directly with public/private RPC nodes (Alchemy, QuickNode, Helius, or custom RPCs) and third-party market aggregator APIs.

Plurivex unifies **4 operational console paradigms into a single desktop application**:
1. **🔐 Secure Local Vault:** Manage, encrypt, import, and export thousands of wallets (EVM & Solana) with offline encryption.
2. **📊 Multi-Chain Auditor:** Scan balances, detect secondary tokens, audit smart contract allowances, validate Solana account structures (Rent & Nonce), and calculate multi-currency portfolio valuations.
3. **⚡ High-Assurance Execution Engine:** Execute batch sweeps, fund dispersion, parallel DEX swaps, gasless permit rescues, and NFT collection transfers with pre-flight dry-run simulations.
4. **🌐 Operations & Automation Console:** Monitor multi-RPC latency, manage proxy rotation, automate scheduled warm-ups, broadcast webhook alerts (Discord/Slack), and mitigate Sybil clustering risks.

---

### 🛡️ 1.1 Product Operating Modes

To guarantee operational safety and minimize human error when managing thousands of wallets, Plurivex is divided into **3 Isolated Operating Modes** switchable via the Global Header:

| Operating Mode | Description & Access Rights | Active Features | Transaction Control Level |
| :--- | :--- | :--- | :---: |
| 🟢 **Read-Only Audit Mode** *(Default)* | Safe browsing mode. Users can leave the app open to monitor balances. All transaction broadcasting and sweeping functions are strictly disabled. | Mass balance scanning, USD/IDR valuation, secondary token discovery, Solana account analysis, explorer hub, phishing token detection, PnL tracker. | **Read-Only (No Broadcast Rights)** |
| 🔐 **Secure Vault Mode** | Cryptographic key identity management mode. Master Password confirmation required before revealing sensitive credentials. | Vault import/export, batch wallet generator, seed phrase typo repair, HD path scanning, tag/folder management, `.plurivex` archive migration. | **Encrypted Credential Access** |
| ⚡ **Execution Mode** | High-assurance on-chain execution mode. Prominent action buttons with password authorization required before transactions are broadcast. | Batch Sweeper, DEX Batch Trader, Batch Disperser, Solana Rent Reclaimer, Gasless Permit Sweeper, Mass Airdrop Claimer. | **Privileged Transaction Execution** |

---

## 📋 2. Taxonomy of 60 Master Features (The Diamond 60)

All 60 functional capabilities of Plurivex are categorized into **7 Strategic Pillars**, complete with Governance Badges:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  60 PLURIVEX MASTER FEATURES (THE DIAMOND 60)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🌐 PILLAR 1: On-Chain & Cross-Chain Smart Contract Engine (Features 1 - 5)     │
│ 🔐 PILLAR 2: Key Management, Vault & Forensic Tools (Features 6 - 17)   │
│ 📊 PILLAR 3: Balance Inspection, On-Chain Intelligence & Anti-Scam (Features 18 - 28)  │
│ ⚡ PILLAR 4: Transaction Execution Engine, Sweeper & NFTs (Features 29 - 41)        │
│ 🛡️ PILLAR 5: Airdrop Automation, Points & Anti-Sybil (Features 42 - 49)          │
│ 🌐 PILLAR 6: Network Privacy, Multi-Proxy & Node Manager (Features 50 - 53)    │
│ 📁 PILLAR 7: Data Organization, Valuation & Portability (Features 54 - 60)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 🌐 PILLAR 1: ON-CHAIN & CROSS-CHAIN SMART CONTRACT ENGINE (5 FEATURES)

#### 1. Plurivex Smart Contract Protocol (`PlurivexSweeper.sol` - EVM)
* **Description:** Specialized Solidity smart contract deployed via deterministic `CREATE2` deployment, maintaining identical contract addresses across all supported EVM blockchains (Ethereum, BNB Chain, Base, Arbitrum, Polygon, Optimism).
* **Technical Functionality:**
  * **Atomic Native Sweeping (`sweepNative`):** Sweeps native gas balances (ETH/BNB/POL) and atomically splits funds within a single transaction: 99.30% to user destination wallet and 0.70% protocol fee to Developer Treasury.
  * **Multi-Token Batch Sweeping (`batchSweepTokens`):** Sweeps multiple ERC-20 tokens simultaneously (e.g., USDT + USDC + PEPE) in a **single atomic transaction**, saving up to 70% in gas fees compared to separate transfers.
  * **Immutable Treasury Protection:** Protocol treasury address is marked `immutable` on-chain, ensuring absolute transparency with zero risk of redirect or tampering.

#### 2. Solana Native Multi-Instruction Atomic Engine
* **Description:** High-performance atomic transaction execution engine on Solana without requiring custom program deployment overhead.
* **Technical Functionality:** Leverages native Solana Multi-Instruction Transaction architecture to bundle transfer instructions (99.30% SOL/SPL token balance to user destination wallet and 0.70% protocol fee to Treasury) in a single unified atomic transaction at the validator level.

#### 3. MEV / Flashbots Private Mempool Protection (Compromised Wallet Rescue)
* **Description:** High-assurance asset rescue protocol for compromised or leaked private keys to escape sweeper bot frontrunning.
* **Technical Functionality:** Relays transactions directly to block builders via Flashbots Private Relay (EVM) or Jito Block Engine Bundles (Solana), bypassing public mempools entirely so malicious sweeper bots cannot detect or frontrun the rescue transaction.

#### 4. Cross-Chain Bridge & Single-Asset Consolidation Engine (Solana ↔ EVM)
* **Description:** Native cross-chain bridge liquidity protocol integration (deBridge DLN / Mayan Finance SDK) to consolidate fragmented multi-chain portfolios.
* **Technical Functionality:**
  * **Universal Consolidation:** Unifies fragmented balances across disparate networks (e.g., 0.5 SOL on Solana + 0.05 ETH on Arbitrum + 0.2 BNB on BSC) and automatically swaps and bridges them into a single target token at one destination address (e.g., all consolidated to USDT on Arbitrum).
  * **Integrator Revenue Share:** Accrues automated partner fee share (0.25% - 0.50%) from bridge liquidity providers on each user bridge operation.

#### 5. Smart Contract Cryptographic Gatekeeper (Anti-Bypass Protection)
* **Description:** Cryptographic verification layer ensuring protocol contracts cannot be abused by unauthorized third-party tooling without routed fees.
* **Technical Functionality:** Smart contract validates local native Rust binary cryptographic signatures (`ecrecover`) prior to executing sweeps, ensuring transactions originate exclusively from authenticated Plurivex clients.

---

### 🔐 PILLAR 2: KEY MANAGEMENT, VAULT & FORENSIC SUITE (12 FEATURES)

#### 6. True Dual-Chain Key Derivation (EVM + Solana from 1 Entropy)
* **Description:** Automated derivation engine that deterministically computes active dual-chain addresses from a single Seed Phrase (BIP-39) or 32-byte Private Key (EVM format `0x...` and Solana format `Base58`).

#### 7. Smart Universal Parser & Recursive Directory Extractor `[Authorized Use Only - User-Owned Assets]`
* **Description:** High-speed intelligent text parsing engine equipped with advanced regex patterns to extract thousands of user-owned private keys or seed phrases from unstructured data.
* **Technical Functionality:** Ingests 12/24-word Mnemonics, Hex Private Keys, Solana Base58 Secret Keys, and Raw Byte Arrays `[1,2,3...]` from raw text clipboards, `.txt`, `.csv`, `.json`, `.log` files, and recursive local folder scans across thousands of files.

#### 8. Anti-Duplicate Guard (Cryptographic Deduplication)
* **Description:** Real-time deduplication engine that computes a unique canonical SHA-256 fingerprint for every credential before storage, guaranteeing vault database integrity free of duplicate entries.

#### 9. Zero-Cloud SQLite Encrypted Vault
* **Description:** Bank-grade local encrypted vault powered by embedded SQLite, hardened with Argon2id Key Derivation and AES-256-GCM encryption. Completely zero-cloud, securely stored on the user's physical machine.

#### 10. Mnemonic Typo Repair Tool (Damaged Seed Phrase Recovery)
* **Description:** Forensic seed phrase recovery engine for mistyped words or single/dual missing words, mathematically matching candidates against the 2,048 BIP-39 wordlist and computing valid cryptographic checksums in real time.

#### 11. Deep Sub-Account Derivation Scan (HD Path Explorer)
* **Description:** Scans hierarchical derivation paths (e.g., `m/44'/60'/0'/0/x`) across child indices `#0` through `#50` to discover active balances across derived sub-accounts from a single master seed phrase.

#### 12. Batch Wallet Generator
* **Description:** Instant key generator powered by native Rust cryptography capable of provisioning 10 to 1,000 fresh dual-chain wallet pairs (EVM + Solana) with corresponding private keys in seconds.

#### 13. Multi-Core Vanity Address Generator (EVM + Solana)
* **Description:** High-speed vanity address generator (e.g., `0x8888...` or `Moon...SOL`) computed directly on the local machine across all available CPU cores via native Rust Rayon threading, eliminating key exposure risks.

#### 14. Keystore & Password Mutation Recovery Engine `[Forensic Recovery - Authorized Use Only]`
* **Description:** Offline local forensic recovery tool to unlock legacy JSON Keystore files (`UTC--...`) when passwords are partially forgotten, leveraging rule-based mutation dictionaries executed fully offline.

#### 15. Offline Air-Gapped Transaction Signer
* **Description:** High-security transaction signing workflow (Cold Storage Security). Users assemble unsigned transaction payloads on an online device, transfer them to an isolated offline machine via QR codes or JSON files to sign in zero-network conditions, and return signatures for broadcast.

#### 16. Animated QR Air-Gap Hardware Vault Coordinator (Keystone / SeedSigner / Tangem)
* **Description:** BC-UR (Blockchain Commons Uniform Resources) dynamic animated QR code protocol coordinator for seamless interoperability with air-gapped hardware vaults without USB connections, providing institutional-grade custody.

#### 17. Vitalik's ERC-5564 Stealth Address Privacy Shield (One-Time Stealth Addresses)
* **Description:** Implementation of the standard stealth address protocol. Users publish a single public meta-address; each inbound transfer automatically derives an ephemeral non-linkable address on-chain. Only the recipient's vault key can view and sweep funds, safeguarding balance privacy.

---

### 📊 PILLAR 3: BALANCE INSPECTION, ON-CHAIN INTELLIGENCE & ANTI-SCAM (11 FEATURES)

#### 18. Multi-Threaded Concurrent RPC Balance Scanner
* **Description:** Ultra-fast balance inspection engine querying thousands of wallets across distributed RPC endpoints in parallel via Rust asynchronous Tokio runtime.

#### 19. Native Gas Priority Tracker & Secondary Token Discovery
* **Description:** Balance detection system prioritizing primary gas assets (ETH, BNB, SOL, POL) for transaction readiness, combined with automatic discovery of secondary ERC-20 and SPL tokens and metadata.

#### 20. Solana Account Type, Owner Program & Rent Analysis
* **Description:** Deep technical audit of Solana account states: validates whether an address is a standard System Program EOA, Custom Program Account, Durable Nonce Authority (with locked rent reserves), or Associated Token Account (ATA).

#### 21. Solana Empty Token Account Rent Reclaimer (Reclaim Locked SOL Rent)
* **Description:** Automated empty token account cleanup engine on Solana. Identifies all zero-balance SPL token accounts, executes `closeAccount` instructions, and reclaims locked rent reserves (~0.002039 SOL per account) back to the treasury wallet with one click.

#### 22. Staking & Delegated Rent Deactivator (Solana / EVM LST)
* **Description:** Detects dormant staked SOL in Stake Delegated accounts or Validator Vote accounts on Solana, deactivates delegations, and reclaims locked rent and reward balances to liquid accounts.

#### 23. Token Revoke Guard (Anti-Drainer)
* **Description:** Scans active token spending allowances across smart contracts approved by stored wallets, providing immediate execution to revoke permissions from suspicious or obsolete protocols.

#### 24. Honeypot & Malicious Tax Pre-Flight Guard
* **Description:** Performs pre-flight simulation before batch DEX swaps: tests micro buy and sell execution paths. If a token cannot be sold or levies an exorbitant tax (>10%), execution is automatically blocked with a HONEYPOT DETECTED warning.

#### 25. Scam Token & Phishing Dust Cleaner (Zero-Value Purge)
* **Description:** Intelligent filter detecting scam tokens and phishing dust lacking legitimate liquidity pools. Provides 1-click controls to hide or burn worthless tokens to dead addresses (`0x...dEaD`), keeping portfolios pristine.

#### 26. Multi-Chain Pre-Flight Simulation Engine (EVM: `eth_call` & Solana: `simulateTransaction`)
* **Description:** Multi-chain pre-flight simulation engine executing dry-runs via `eth_call` and `eth_estimateGas` on EVM networks alongside `simulateTransaction` RPC on Solana to verify whether transfers, swaps, or sweeps will succeed or revert, checking gas limits and rent requirements before on-chain funds are spent.

#### 27. ERC-4337 Smart Account & Paymaster Gas Sponsor Detector
* **Description:** Detects Account Abstraction smart accounts (Safe, Biconomy, ZeroDev) associated with stored EOA keys, auditing EntryPoint versions and identifying available Paymaster gas sponsorship subsidies.

#### 28. On-Chain Intelligence & Explorer Hub
* **Description:** 1-click intelligence hub directly linking active wallets to leading on-chain analytics platforms: DeBank, Arkham Intelligence, Etherscan, BscScan, BaseScan, Arbiscan, Solscan, and SolanaFM.

---

### ⚡ PILLAR 4: TRANSACTION EXECUTION ENGINE, SWEEPER & NFTS (13 FEATURES)

#### 29. Batch Sweeper Core (Automated Balance Sweeper)
* **Description:** High-speed balance consolidation engine routing funds from hundreds of source wallets into a central destination, featuring automated gas deduction, gas tier selection (Standard, Fast, Turbo, Custom Gwei), dust threshold alerts, and direct transaction explorer receipts.

#### 30. DEX Batch Trader (Concurrent Multi-Wallet Swapper)
* **Description:** Concurrent token swap execution engine (Batch Buy / Batch Sell) across Uniswap (ETH/Base/Arb), PancakeSwap (BSC), and Raydium (Solana) with customizable slippage limits and per-wallet capital allocations.

#### 31. Batch Disperser (Mass Gas & Token Distributor)
* **Description:** Distributes native gas (ETH/BNB/SOL) or ERC-20/SPL tokens from a primary funder wallet across dozens or hundreds of derived sub-wallets in a single coordinated pipeline (essential for airdrop provisioning).

#### 32. Auto-Refuel Gas Tank (Automated Gas Refuel for Sweeper)
* **Description:** Central Gas Tank wallet that detects sub-wallets holding tokens but lacking gas, dispatches exact gas allocations, triggers the token sweep, and immediately sweeps remaining gas change back to the treasury.

#### 33. Gasless "Permit" Token Sweeper (EIP-2612 / EIP-3009 Zero-ETH Rescue)
* **Description:** Rescues tokens (USDC, DAI, UNI) from wallets with 0 ETH using off-chain permit signatures. The relayer/funder pays the gas fees externally and extracts tokens without requiring gas funding into the target address.

#### 34. Custom Smart Contract ABI Interactor (Universal Batch Caller)
* **Description:** Universal smart contract caller. Users supply any target contract address and ABI, select functions (e.g., `stake()`, `vote()`, `deposit()`, `mint()`), and broadcast across hundreds of wallets simultaneously.

#### 35. NFT Batch Sweeper & Vault Transfer (ERC-721 / 1155 & Metaplex Solana)
* **Description:** Discovers NFT holdings across burner wallets and coordinates bulk transfers to designated cold storage vaults within a single batch pipeline.

#### 36. Mass Airdrop Claimer
* **Description:** Automated smart contract method invocation engine to execute token reward claims or minting across hundreds of eligible wallets simultaneously.

#### 37. Tax-Loss Harvesting & Dead Token Burner
* **Description:** Burns worthless rugpulled tokens to dead addresses (`0x...dEaD`) across stored portfolios and exports standardized capital loss CSV records compatible with crypto tax accounting platforms (Koinly, CoinTracker).

#### 38. Automated Testnet Faucet & Gas Drip Dispenser
* **Description:** Testnet faucet management hub (Sepolia, Holesky, Berachain bArtio, Monad) monitoring faucet quotas and distributing testnet gas drips evenly across active testnet farming wallets.

#### 39. Radar Gas & Auto-Schedule
* **Description:** Automated execution scheduler holding pending transaction queues until network base gas prices (Gwei) drop below user-configured target thresholds.

#### 40. QR Code Generator & Mobile Deposit Hub
* **Description:** Instant high-resolution QR code generator for all active wallet addresses, streamlining deposit funding from exchange mobile apps (Binance, OKX, Bitget, Phantom Mobile).

#### 41. Emergency Vault Purge (Reset All Data)
* **Description:** Emergency sanitization procedure executing best-effort cryptographic erasure and complete destruction of the local SQLite database (including `.db`, `-wal`, and `-shm` files) behind Master Password authorization.

---

### 🛡️ PILLAR 5: AIRDROP AUTOMATION, POINTS & ANTI-SYBIL (8 FEATURES)

#### 42. Anti-Sybil Cluster & On-Chain Taint Graph Visualizer `[Privacy & Anti-Clustering]`
* **Description:** Locally inspects transaction graphs among stored wallets to detect direct internal transfers that could cluster addresses together, preventing airdrop disqualification by Sybil surveillance algorithms.

#### 43. CEX Deposit Address Guard & Anti-Contamination Matrix `[Operational Privacy]`
* **Description:** Deposit routing protection for consolidating assets into centralized exchanges (Binance, OKX, Bybit) under two operational modes:
  * **Airdrop Sybil-Shield Mode:** Maps wallets to dedicated exchange sub-account addresses (e.g., OKX 20-100 unique addresses / Bybit sub-accounts) or non-custodial privacy swap routers (ChangeNOW/FixedFloat) to sever on-chain clustering.
  * **Standard Direct Consolidation Mode (For Non-Airdrop Wallets):** For non-farming wallets (personal treasury, recovery), permits sweeping directly into a **single consolidated Binance deposit address** safely and transparently.

#### 44. Multi-Chain Airdrop Eligibility Radar (Merkle Proof Auto-Checker)
* **Description:** Fetches public snapshot data and Merkle trees from emerging airdrop protocols to evaluate hundreds of wallets in seconds, reporting eligible allocations and proof branches.

#### 45. Multi-Protocol Airdrop Points & XP Radar
* **Description:** Audits off-chain points and XP metrics across 20+ protocols (EigenLayer, Scroll Marks, Linea XP, Hyperliquid, Symbiotic) across all stored wallets, presenting an aggregated portfolio leaderboard.

#### 46. Scheduled Activity Warm-Up Engine `[Automated Wallet Maintenance]`
* **Description:** Automated activity scheduler triggering low-cost micro-interactions (e.g., WETH wrap/unwrap, verified contract pings) with randomized weekly intervals to maintain organic on-chain activity scores.

#### 47. Anti-Sybil Randomizer Engine `[Timing Jitter & Behavioral Privacy]`
* **Description:** Transaction randomization engine injecting dynamic time delays (5–60s) and randomized transfer amounts to eliminate deterministic timing patterns and mitigate robotic fingerprinting.

#### 48. Solana Dynamic Priority Fee & Jito Bundle Tip Optimizer
* **Description:** Dynamic priority fee optimizer computing Compute Units (CU) and sizing Jito validator bundle tips to maximize first-block inclusion certainty and eliminate dropouts during severe network congestion.

#### 49. User-Configurable Auto-Lock Security Timer
* **Description:** Configurable inactivity timer (`Off`, `30s`, `1m`, `5m`, `15m`, `30m`, `1h`) that zeroes in-memory credentials and locks the UI, requiring Master Password re-authentication.

---

### 🌐 PILLAR 6: NETWORK PRIVACY, MULTI-PROXY & NODE MANAGER (4 FEATURES)

#### 50. Multi-Proxy & IP Rotator Manager `[Network Privacy & Rate-Limit Shield]`
* **Description:** Proxy management layer (HTTP/SOCKS5) rotating IP addresses across RPC queries and airdrop claim requests to shield against IP-clustering blacklists and rate limiting.

#### 51. Custom RPC Node Manager & Auto-Fallback
* **Description:** Private node management system (Alchemy, QuickNode, Helius, Infura) featuring automated latency benchmarking and zero-downtime failover to backup endpoints during node disruptions.

#### 52. Multi-Endpoint RPC Hedging Race Engine
* **Description:** Dispatches concurrent balance and transaction queries across 3 independent RPC providers simultaneously, adopting the fastest response and discarding laggards for optimal responsiveness.

#### 53. Live Multi-RPC Latency Watcher
* **Description:** Continuously benchmarks response latencies (in milliseconds) across EVM, BSC, and Solana RPC endpoints, displayed live in the global application status bar.

---

### 📁 PILLAR 7: DATA ORGANIZATION, VALUATION & PORTABILITY (7 FEATURES)

#### 54. High-Speed Virtualized Engine (10,000+ Wallets @ 60 FPS)
* **Description:** High-performance virtualized table component capable of rendering and filtering 10,000+ wallets seamlessly at a steady 60 FPS without DOM memory degradation.

#### 55. Tag, Folder & Smart Filter Taxonomy
* **Description:** Multi-level wallet categorization (e.g., Main, Airdrop Linea, Whales, Burner, Project X) paired with instant filtering by funding status (Funded vs Empty) and blockchain ecosystem (EVM vs SOL).

#### 56. Flexible Vault Exporter (Multi-Format)
* **Description:** Secure vault export engine with tiered safety filters (Full Encrypted, Public Addresses Only Safe Mode, Funded Only) exporting to `.CSV` spreadsheets or `.TXT` documents.

#### 57. Realtime Multi-Currency Portfolio Valuation (USD & IDR)
* **Description:** Computes aggregate portfolio net worth across all stored balances in US Dollars ($ USD) and Indonesian Rupiah (Rp IDR) using real-time CoinGecko market pricing with offline caching.

#### 58. Local Vault Net Worth Snapshot & Historical PnL Tracker
* **Description:** Periodically captures net worth snapshots into the local SQLite database upon scan completion, plotting portfolio equity curves and PnL metrics without third-party tracking services.

#### 59. Multi-Channel Webhook Notifier (Discord, Slack, & Custom Webhook)
* **Description:** Automatically dispatches formatted alert embeds to Discord channels, Slack incoming webhooks, or custom HTTP endpoints upon fund arrival or sweeper batch completion.

#### 60. Encrypted Portable Vault Archive (`.plurivex` One-Click Backup & Migration)
* **Description:** Packages a standalone `.plurivex` encrypted archive bundle protected by an Argon2id recovery passphrase, archiving all wallet databases, tags, history, and RPC settings for 1-click device migration.

---

## 📊 3. Status Matrix of 60 Master Features

Status Classification Standards:
* 🟢 **Complete & Live:** Fully implemented, verified in test suites, and live in the desktop application.
* 🟡 **Partial / UI Complete:** Visual UI complete; on-chain backend integration queued on roadmap.
* ⚪ **Architecture Stub / Scaffolding Ready:** Backend domain module scaffold in place; business logic queued on roadmap.
* ⏳ **Planned (Phase X):** Scheduled according to engineering dependency order.

| No | Feature Name | Pillar Category | Development Status | Governance / Regulatory Badge |
| :---: | :--- | :--- | :---: | :---: |
| **1** | Smart Contract Protocol (`PlurivexSweeper.sol`) | Pillar 1: Smart Contracts | ⚪ Architecture Stub / Scaffolding Ready | Standard Protocol |
| **2** | Solana Native Multi-Instruction Engine | Pillar 1: Smart Contracts | ⚪ Architecture Stub / Scaffolding Ready | Standard Protocol |
| **3** | MEV / Flashbots Private Mempool Protection | Pillar 1: Smart Contracts | ⚪ Architecture Stub / Scaffolding Ready | Whitehat Recovery |
| **4** | Cross-Chain Bridge & Consolidation (Solana ↔ EVM) | Pillar 1: Smart Contracts | ⚪ Architecture Stub / Scaffolding Ready | Liquidity Integration |
| **5** | Smart Contract Cryptographic Gatekeeper | Pillar 1: Smart Contracts | ⚪ Architecture Stub / Scaffolding Ready | Proprietary Protection |
| **6** | True Dual-Chain Key Derivation (EVM + Solana) | Pillar 2: Key Management | 🟢 **Complete & Live** | Core Key Management |
| **7** | Smart Universal Parser & File Extractor | Pillar 2: Key Management | 🟢 **Complete & Live** | `[Authorized Use Only]` |
| **8** | Anti-Duplicate Guard (Hash Deduplication) | Pillar 2: Key Management | 🟢 **Complete & Live** | Integrity Verification |
| **9** | Zero-Cloud SQLite Encrypted Vault | Pillar 2: Key Management | 🟢 **Complete & Live** | Data at Rest Security |
| **10** | Mnemonic Typo Repair Tool (Rayon Zero-Disk) | Pillar 2: Key Management | 🟢 **Complete & Live** (Phase 1) | Key Recovery |
| **11** | Deep Sub-Account Derivation Scan | Pillar 2: Key Management | ⏳ Planned (Phase 1) | HD Account Discovery |
| **12** | Batch Wallet Generator | Pillar 2: Key Management | ⏳ Planned (Phase 1) | Key Generation |
| **13** | Multi-Core Vanity Address Generator | Pillar 2: Key Management | ⏳ Planned (Phase 5) | Vanity Address |
| **14** | Keystore & Password Mutation Recovery Engine | Pillar 2: Key Management | ⏳ Planned (Phase 5) | `[Forensic Recovery]` |
| **15** | Offline Air-Gapped Network Interceptor | Pillar 2: Key Management | 🟢 **Complete & Live** (Phase 0) | Cold Storage Guard |
| **16** | Animated QR Air-Gap Hardware Vault Coordinator | Pillar 2: Key Management | ⏳ Planned (Phase 5) | BC-UR Protocol |
| **17** | Vitalik's ERC-5564 Stealth Address Shield | Pillar 2: Key Management | ⏳ Planned (Phase 5) | Privacy Standard |
| **18** | Multi-Threaded Concurrent Balance Scanner | Pillar 3: Inspection & Audit | 🟢 **Complete & Live** | Read-Only Audit |
| **19** | Native Gas Tracker & Secondary Token Discovery | Pillar 3: Inspection & Audit | 🟢 **Complete & Live** | Read-Only Audit |
| **20** | Solana Account Type & Rent Analysis | Pillar 3: Inspection & Audit | 🟢 **Complete & Live** | Read-Only Audit |
| **21** | Solana Empty Token Rent Reclaimer | Pillar 3: Inspection & Audit | ⏳ Planned (Phase 3) | Asset Recovery |
| **22** | Staking & Delegated Rent Deactivator | Pillar 3: Inspection & Audit | ⏳ Planned (Phase 3) | Asset Recovery |
| **23** | Token Revoke Guard (Anti-Drainer) | Pillar 3: Inspection & Audit | ⏳ Planned (Phase 2) | Security Inspection |
| **24** | Honeypot & Malicious Tax Pre-Flight Guard | Pillar 3: Inspection & Audit | ⏳ Planned (Phase 2) | Pre-Flight Security |
| **25** | Scam Token & Phishing Dust Cleaner | Pillar 3: Inspection & Audit | ⏳ Planned (Phase 2) | Portfolio Hygiene |
| **26** | Multi-Chain Pre-Flight Simulation (EVM & Solana) | Pillar 3: Inspection & Audit | ⏳ Planned (Phase 2) | Pre-Flight Security |
| **27** | ERC-4337 Smart Account & Paymaster Detector | Pillar 3: Inspection & Audit | ⏳ Planned (Phase 5) | Account Abstraction |
| **28** | On-Chain Intelligence & Explorer Hub | Pillar 3: Inspection & Audit | 🟢 **Complete & Live** | Public Analytics |
| **29** | Batch Sweeper Execution Engine | Pillar 4: Transaction Execution | 🟢 **Complete & Live** | Batch Execution |
| **30** | DEX Batch Trader (Multi-Wallet Swap) | Pillar 4: Transaction Execution | 🟡 **Partial / UI Complete** | DEX Router Integration |
| **31** | Batch Disperser (Distributor Gas & Token) | Pillar 4: Transaction Execution | ⏳ Planned (Phase 3) | Batch Execution |
| **32** | Auto-Refuel Gas Tank | Pillar 4: Transaction Execution | ⏳ Planned (Phase 3) | Gas Automation |
| **33** | Gasless "Permit" Token Sweeper (Zero-ETH Rescue) | Pillar 4: Transaction Execution | ⏳ Planned (Phase 3) | Whitehat Rescue |
| **34** | Custom Smart Contract ABI Interactor | Pillar 4: Transaction Execution | ⏳ Planned (Phase 5) | Universal Caller |
| **35** | NFT Batch Sweeper & Vault Transfer | Pillar 4: Transaction Execution | ⏳ Planned (Phase 3) | Batch NFT |
| **36** | Mass Airdrop Claimer | Pillar 4: Transaction Execution | ⏳ Planned (Phase 4) | Airdrop Automation |
| **37** | Tax-Loss Harvesting & Dead Token Burner | Pillar 4: Transaction Execution | ⏳ Planned (Phase 5) | Accounting / Tax |
| **38** | Automated Testnet Faucet & Gas Drip Dispenser | Pillar 4: Transaction Execution | ⏳ Planned (Phase 4) | Testnet Operations |
| **39** | Radar Gas & Auto-Schedule | Pillar 4: Transaction Execution | ⏳ Planned (Phase 2) | Gas Optimization |
| **40** | QR Code Generator & Mobile Deposit Hub | Pillar 4: Transaction Execution | ⏳ Planned (Phase 1) | Mobile Interop |
| **41** | Emergency Vault Purge (Reset All Data) | Pillar 4: Transaction Execution | 🟢 **Complete & Live** | Cryptographic Erasure |
| **42** | Anti-Sybil Cluster & Taint Graph Visualizer | Pillar 5: Airdrop Automation | ⏳ Planned (Phase 4) | `[Anti-Clustering]` |
| **43** | CEX Deposit Guard & Anti-Contamination Matrix | Pillar 5: Airdrop Automation | ⏳ Planned (Phase 4) | `[Asset Segregation]` |
| **44** | Multi-Chain Airdrop Eligibility Radar | Pillar 5: Airdrop Automation | ⏳ Planned (Phase 4) | Eligibility Radar |
| **45** | Multi-Protocol Airdrop Points & XP Radar | Pillar 5: Airdrop Automation | ⏳ Planned (Phase 4) | Analytics |
| **46** | Scheduled Activity Warm-Up Engine | Pillar 5: Airdrop Automation | ⏳ Planned (Phase 4) | `[Wallet Maintenance]` |
| **47** | Anti-Sybil Randomizer Engine | Pillar 5: Airdrop Automation | ⏳ Planned (Phase 4) | `[Behavioral Privacy]` |
| **48** | Solana Priority Fee & Jito Tip Optimizer | Pillar 5: Airdrop Automation | ⏳ Planned (Phase 4) | Execution Assurance |
| **49** | User-Configurable Auto-Lock Security Timer | Pillar 5: Airdrop Automation | 🟢 **Complete & Live** | Session Security |
| **50** | Multi-Proxy & IP Rotator Manager | Pillar 6: Network Privacy | ⏳ Planned (Phase 2) | `[Network Privacy]` |
| **51** | Custom RPC Node Manager & Auto-Fallback | Pillar 6: Network Privacy | 🟢 **Complete & Live** | Network Reliability |
| **52** | Multi-Endpoint RPC Hedging Race Engine | Pillar 6: Network Privacy | ⏳ Planned (Phase 2) | Latency Hedging |
| **53** | Live Multi-RPC Latency Watcher | Pillar 6: Network Privacy | 🟢 **Complete & Live** | Network Monitoring |
| **54** | High-Speed Virtualized Engine (10.000+ Wallets) | Pillar 7: Data & Portability | 🟢 **Complete & Live** | 60 FPS Virtualization |
| **55** | Tag, Folder & Smart Filter Taxonomy | Pillar 7: Data & Portability | 🟢 **Complete & Live** | Organization |
| **56** | Flexible Vault Exporter (CSV/TXT) | Pillar 7: Data & Portability | 🟢 **Complete & Live** | Backup / Export |
| **57** | Realtime Multi-Currency Valuation (USD/IDR) | Pillar 7: Data & Portability | 🟢 **Complete & Live** | Realtime Pricing |
| **58** | Local Vault Net Worth Snapshot & PnL History | Pillar 7: Data & Portability | ⏳ Planned (Phase 5) | Local Analytics |
| **59** | Multi-Channel Webhook Notifier (Discord / Slack / Custom Webhook) | Pillar 7: Data & Portability | ⏳ Planned (Phase 5) | Broadcast Alerts |
| **60** | Encrypted Portable Vault Archive (`.plurivex`) | Pillar 7: Data & Portability | ⏳ Planned (Phase 5) | Encrypted Migration |

---

## 🚀 4. Phased Dependency Roadmap (Anti-Rewrite Architecture)

The roadmap below is structured to guarantee **Zero Architectural Rewrites**, where each milestone acts as an unshakeable foundation for subsequent phases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              6-PHASE PLURIVEX DEVELOPMENT ROADMAP (60 FEATURES)               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🟢 PHASE 0: CORE FOUNDATION COMPLETE & LIVE (17 Complete + 1 Partial)  │
│ 🧱 PHASE 1: KEY FOUNDATION, EXTRACTION & RECOVERY (4 Features)              │
│ 🛡️ PHASE 2: NETWORK INFRASTRUCTURE, SIMULATION & ANTI-SCAM (7 Features)           │
│ ⚡ PHASE 3: SMART CONTRACT, SWEEPER & TRANSACTION EXECUTION (9 Features)      │
│ 🎯 PHASE 4: AIRDROP AUTOMATION, POINTS RADAR & ANTI-SYBIL (9 Features)       │
│ 👑 PHASE 5: ELITE FORENSICS, HARDWARE AIR-GAP & ECOSYSTEM (13 Features) │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 🟢 PHASE 0: Core Foundation Complete & Live (17 Complete + 1 Partial)
> *Status: Fully verified in native binaries and tracked in Git repository (`3f95668` & `6e6b20f`).*

1. **Feature #6:** True Dual-Chain Key Derivation (`core/wallets/derivation.rs` as Source of Truth; `src/lib/wallet.ts` as thin IPC wrapper)
2. **Feature #7:** Smart Universal Parser & File Extractor (`core/wallets/import.rs` as Source of Truth; `src/lib/extract.ts` as thin IPC wrapper)
3. **Feature #8:** Cryptographic Anti-Duplicate Guard (`core/wallets/fingerprint.rs` as Source of Truth; `src/lib/fingerprint.ts` as thin IPC wrapper)
4. **Feature #9:** Zero-Cloud SQLite Encrypted Vault (`core/security/crypto.rs` Argon2id as Source of Truth; `db/schema.rs`, `db/migrations.rs`, backed by `src/lib/crypto.ts` as thin IPC wrapper)
5. **Feature #18:** Multi-Threaded Concurrent Balance Scanner (`core/scanner/mod.rs`)
6. **Feature #19:** Native Gas Tracker & Secondary Token Discovery (`adapters/evm/tokens.rs`, `adapters/solana/tokens.rs`)
7. **Feature #20:** Solana Account Type & Rent Analysis (`adapters/solana/client.rs`)
8. **Feature #28:** On-Chain Intelligence & Explorer Hub (`src/components/WalletActivityExplorer.tsx`)
9. **Feature #29:** Batch Sweeper Core (`adapters/evm/client.rs` & `adapters/solana/client.rs` as RPC Broadcaster; `src/lib/sweeper.ts` as Execution UI bridge)
10. **Feature #30:** DEX Batch Trader *(Status: 🟡 Partial / UI Complete in `src/components/DexBatchTrader.tsx`, on-chain router integration scheduled)*
11. **Feature #41:** Emergency Vault Purge / Reset All (`src/components/ResetAllWalletsModal.tsx`)
12. **Feature #49:** User-Configurable Auto-Lock Security Timer & 4 Core Security Shields (`src/context/AppContext.tsx`, `src/lib/security.ts`, `src-tauri/src/core/security/`)
13. **Feature #51:** Custom RPC Node Manager (`src/lib/chains.ts`)
14. **Feature #53:** Live Multi-RPC Latency Watcher (Header/Footer Status)
15. **Feature #54:** High-Speed Virtualized Engine 10,000 Wallets (`src/components/Sidebar.tsx`)
16. **Feature #55:** Tag, Folder & Smart Filter Taxonomy (`src/context/AppContext.tsx`)
17. **Feature #56:** Flexible Vault Exporter (`src/components/ExportModal.tsx`)
18. **Feature #57:** Realtime Multi-Currency Valuation USD/IDR (`WalletDetail.tsx`)

---

### 🧱 PHASE 1: Key Foundation, Extraction & Data Recovery (4 Features)
> *Objective: Ensure the local data vault reliably manages, repairs, and expands wallets before transactions are dispatched on-chain.*

* **Sequence 1 (Feature #10): Mnemonic Typo Repair Tool** — Recovers mistyped or single-word missing seed phrases prior to vault persistence.
* **Sequence 2 (Feature #11): Deep Sub-Account Derivation Scan** — Discovers active child derived accounts (`#1` through `#50`) holding balances from a master seed phrase.
* **Sequence 3 (Feature #12): Batch Wallet Generator** — Mass generator to instantiate 100-1,000 fresh dual-chain wallets directly in the vault.
* **Sequence 4 (Feature #40): QR Code Generator & Mobile Deposit Hub** — Streamlines initial gas deposits via mobile camera QR scanning.

*(Architectural Note: Feature #49 Auto-Lock Timer was prioritized and activated early as an foundational security shield).*

---

### 🛡️ PHASE 2: Network Infrastructure, Simulation & Anti-Scam (7 Features)
> *Objective: Establish a secure, high-speed, and verified network pipeline before any gas funds are transmitted on-chain.*

* **Sequence 1 (Feature #50): Multi-Proxy & IP Rotator Manager** — Proxy routing to prevent IP blacklisting during intensive scanning.
* **Sequence 2 (Feature #52): Multi-Endpoint RPC Hedging Race Engine** — Queries 3 RPC providers concurrently, adopting the fastest response to minimize latency.
* **Sequence 3 (Feature #24): Honeypot & Malicious Tax Pre-Flight Guard** — Detects malicious tax traps and unsellable tokens prior to execution.
* **Sequence 4 (Feature #25): Scam Token & Phishing Dust Cleaner** — Purges dangerous scam tokens and phishing dust from the portfolio.
* **Sequence 5 (Feature #26): Multi-Chain Pre-Flight Simulation Engine (EVM: `eth_call` & Solana: `simulateTransaction`)** — Pre-flight dry-run engine checking reverts and gas limits before incurring real network fees.
* **Sequence 6 (Feature #23): Token Revoke Guard** — Revokes allowances from high-risk or obsolete smart contracts.
* **Sequence 7 (Feature #39): Radar Gas & Auto-Schedule** — Monitors network Gwei to trigger transactions during fee troughs.

---

### ⚡ PHASE 3: Smart Contracts, Balance Sweeping & Transaction Execution (9 Features)
> *Objective: Activate atomic balance consolidation, gas optimization, and protocol treasury routing.*

* **Sequence 1 (Feature #1): Deploy & Integrate Protocol Smart Contract (`PlurivexSweeper.sol`)** — Multi-token sweeping in a single transaction (up to 70% gas savings) and 0.70% fee routing to Treasury.
* **Sequence 2 (Feature #2): Solana Native Multi-Instruction Atomic Engine** — Atomic multi-instruction sweeping executed at the Solana validator level.
* **Sequence 3 (Feature #21): Solana Empty Token Account Rent Reclaimer** — Closes empty SPL accounts and reclaims ~0.002039 SOL rent per account back to treasury.
* **Sequence 4 (Feature #22): Staking & Delegated Rent Deactivator** — Deactivates staking delegations and reclaims locked rent reserves.
* **Sequence 5 (Feature #33): Gasless "Permit" Token Sweeper (EIP-2612 / EIP-3009)** — Rescues tokens from zero-ETH wallets without prior gas funding.
* **Sequence 6 (Feature #3): MEV / Flashbots Private Mempool Protection** — Private builder pipeline protecting compromised wallets from public mempool frontrunners.
* **Sequence 7 (Feature #31): Batch Disperser** — Distributes gas or tokens from a funder wallet across hundreds of sub-wallets.
* **Sequence 8 (Feature #32): Auto-Refuel Gas Tank** — Automatically fuels gas-deficient wallets during sweeping and reclaims change.
* **Sequence 9 (Feature #35): NFT Batch Sweeper & Vault Transfer** — Bulk-transfers NFT collections into secure cold storage vaults.

---

### 🎯 PHASE 4: Airdrop Automation, Points Radar & Anti-Sybil Defense (9 Features)
> *Objective: Automate advanced airdrop farming workflows and safeguard accounts against anti-Sybil clustering.*

* **Sequence 1 (Feature #42): Anti-Sybil Cluster & On-Chain Taint Graph Visualizer** — Detects internal fund transfers among local wallets to prevent clustering.
* **Sequence 2 (Feature #43): CEX Deposit Address Guard (Airdrop Shield vs Standard Mode)** — Safe deposit routing into Binance/OKX/Bybit.
* **Sequence 3 (Feature #44): Multi-Chain Airdrop Eligibility Radar (Merkle Proof)** — Instantly checks airdrop eligibility across hundreds of wallets.
* **Sequence 4 (Feature #45): Multi-Protocol Airdrop Points & XP Radar** — Audits off-chain points (EigenLayer, Scroll, Hyperliquid).
* **Sequence 5 (Feature #46): Scheduled Activity Warm-Up Engine** — Automated periodic micro-transactions to maintain organic activity scores.
* **Sequence 6 (Feature #47): Anti-Sybil Randomizer Engine** — 5–60s randomized delays and jittered transfer values.
* **Sequence 7 (Feature #48): Solana Priority Fee & Jito Tip Optimizer** — Sizes Jito tips for guaranteed first-block inclusion.
* **Sequence 8 (Feature #36): Mass Airdrop Claimer** — Bulk-claims tokens and NFTs across qualified accounts simultaneously.
* **Sequence 9 (Feature #38): Automated Testnet Faucet & Gas Drip Dispenser** — Distributes testnet gas (Sepolia, Berachain, Monad) evenly.

---

### 👑 PHASE 5: Elite Forensic Suite, Hardware Air-Gap & Ecosystem (13 Features)
> *Objective: Establish Plurivex as the premier desktop command console for Whales, Auditors, and Treasury Teams.*

* **Sequence 1 (Feature #4): Cross-Chain Bridge & Consolidation (Solana ↔ EVM)** — Consolidates multi-chain balances into a single asset (deBridge/Mayan).
* **Sequence 2 (Feature #5): Smart Contract Cryptographic Gatekeeper** — Rust binary cryptographic gatekeeper protecting fee routing.
* **Sequence 3 (Feature #13): Multi-Core Vanity Address Generator** — Rayon-powered vanity address generation (`0x8888...` / `Moon...SOL`).
* **Sequence 4 (Feature #14): Keystore & Password Mutation Recovery Engine** — Forensic rule-based recovery for encrypted JSON keystores.
* **Sequence 5 (Feature #15): Offline Air-Gapped Transaction Signer** — Fully air-gapped zero-network transaction signer.
* **Sequence 6 (Feature #16): Animated QR Air-Gap Hardware Vault Coordinator** — BC-UR animated QR integration for Keystone/Tangem/SeedSigner.
* **Sequence 7 (Feature #17): Vitalik's ERC-5564 Stealth Address Privacy Shield** — Ephemeral stealth address generator for transaction privacy.
* **Sequence 8 (Feature #27): ERC-4337 Smart Account & Paymaster Gas Sponsor Detector** — Detects Account Abstraction contracts and Paymaster subsidies.
* **Sequence 9 (Feature #34): Custom Smart Contract ABI Interactor** — Universal batch ABI method executor.
* **Sequence 10 (Feature #37): Tax-Loss Harvesting & Dead Token Burner** — Burns rugpulled tokens to `0x...dEaD` and generates tax-loss CSV reports.
* **Sequence 11 (Feature #58): Local Vault Net Worth Snapshot & Historical PnL Tracker** — Historical portfolio equity curve in local SQLite.
* **Sequence 12 (Feature #59): Multi-Channel Webhook Notifier (Discord / Slack / Custom Webhook)** — Automated transaction alerts dispatched to communication channels.
* **Sequence 13 (Feature #60): Encrypted Portable Vault Archive (`.plurivex`):** 1-click encrypted portable backup and migration archive.

---

## 🏛️ 5. Rust Backend Domain Architecture (Hexagonal / Ports & Adapters)

The Rust backend (`src-tauri/src/`) has been completely refactored from a legacy monolith into a clean **Hexagonal / Ports & Adapters Domain Architecture** in commits `3f95668` & `6e6b20f`:

```text
src-tauri/src/
├── app/
│   ├── commands.rs            # Thin Tauri controller (Input validation & command dispatching)
│   ├── state.rs               # Application global runtime state management
│   └── mod.rs
├── adapters/
│   ├── evm/
│   │   ├── client.rs          # EVM RPC client, gas fee estimation, nonce, tx broadcast
│   │   ├── tokens.rs          # ERC-20 token metadata & contracts (ETH, BSC, Base, Arb)
│   │   ├── account_abstraction.rs # ERC-4337 smart account & paymaster discovery (#27)
│   │   └── mod.rs
│   ├── solana/
│   │   ├── client.rs          # Solana RPC client, durable nonce, rent analysis, tx broadcast
│   │   ├── tokens.rs          # Solana SPL token metadata & ATA inspection
│   │   ├── jito.rs            # Dynamic Compute Unit calculation & Jito validator tip engine (#48)
│   │   └── mod.rs
│   ├── bridge/
│   │   └── mod.rs             # deBridge DLN / Mayan Finance / Li.Fi cross-chain integration scaffold
│   ├── explorers/
│   │   └── mod.rs             # Block explorer URL generator & receipt verification (Etherscan, Solscan)
│   └── mod.rs
├── core/
│   ├── vault/
│   │   ├── models.rs          # Database entity models (WalletRecord, BalanceRecord)
│   │   ├── repository.rs      # Local SQLite access layer and path management
│   │   ├── service.rs         # Core vault business service
│   │   └── mod.rs
│   ├── security/
│   │   ├── crypto.rs          # Argon2id crypto, hashing, and signature verification (Live)
│   │   ├── memory.rs          # RAM security (SecureBuffer / volatile zeroize) (Live)
│   │   ├── session.rs         # Inactivity auto-lock session manager (Live)
│   │   ├── gatekeeper.rs      # Rust binary cryptographic gatekeeper protection (#5)
│   │   ├── airgap.rs          # Air-gapped offline transaction signing (#15)
│   │   ├── bcur.rs            # BC-UR 2.0 animated QR hardware vault coordinator (#16)
│   │   └── mod.rs
│   ├── wallets/
│   │   ├── import.rs          # Ultra-fast recursive directory extraction engine (Live)
│   │   ├── derivation.rs      # Native BIP-39 & SLIP-0010 dual-chain derivation engine (Live)
│   │   ├── fingerprint.rs     # SHA-256 key deduplication algorithm (Live)
│   │   ├── repair.rs          # BIP-39 typo recovery and checksum engine (#10)
│   │   ├── subaccounts.rs     # HD sub-account derivation scanner index 0-50 (#11)
│   │   ├── generator.rs       # Multi-core batch wallet generator (#12)
│   │   ├── vanity.rs          # Multi-core CPU vanity address generator (#13)
│   │   ├── keystore_recovery.rs # Rule-based mutation JSON keystore recovery (#14)
│   │   ├── stealth.rs         # ERC-5564 stealth address privacy shield (#17)
│   │   ├── qr.rs              # High-res QR code generator & mobile deposit hub (#40)
│   │   ├── export.rs          # Multi-tier vault export & backup engine (#56)
│   │   └── mod.rs
│   ├── scanner/
│   │   ├── evm.rs             # EVM batch query orchestrator (Live)
│   │   ├── solana.rs          # Solana batch query orchestrator (Live)
│   │   ├── pricing.rs         # Real-time market pricing conversion service (Live)
│   │   ├── allowances.rs      # Anti-drainer token approval scanner (#23)
│   │   ├── scam_filter.rs     # Scam token & phishing dust filter (#25)
│   │   └── mod.rs             # Bulk balance inspection executor (Live)
│   ├── execution/
│   │   ├── queue.rs           # Bulk transaction queue manager (Live)
│   │   ├── simulator.rs       # Multi-chain pre-flight simulation engine EVM & Solana (#26)
│   │   ├── honeypot.rs        # Honeypot & malicious token tax pre-flight guard (#24)
│   │   ├── sweeper.rs         # Bulk sweeper execution service (Live)
│   │   ├── trader.rs          # DEX batch trading execution service (#30)
│   │   ├── solana_batch.rs    # Solana atomic multi-instruction engine (#2)
│   │   ├── solana_rent.rs     # Solana empty token account rent reclaimer (#21)
│   │   ├── solana_stake.rs    # Staking & validator rent deactivator (#22)
│   │   ├── disperser.rs       # Mass gas & token distributor (#31)
│   │   ├── refuel.rs          # Automated sweeper gas refuel tank (#32)
│   │   ├── permit.rs          # Gasless permit token sweeper EIP-2612 (#33)
│   │   ├── abi_caller.rs      # Dynamic smart contract ABI method caller (#34)
│   │   ├── nft_sweep.rs       # Bulk NFT sweeper ERC-721/1155 & Metaplex (#35)
│   │   ├── claimer.rs         # Automated mass airdrop claimer (#36)
│   │   ├── burner.rs          # Rugpulled token dead address burner (#37)
│   │   ├── scheduler.rs       # Gas radar transaction scheduler (#39)
│   │   ├── warmup.rs          # Periodic wallet warm-up interaction engine (#46)
│   │   ├── randomizer.rs      # Anti-Sybil delay & amount jitter randomizer (#47)
│   │   ├── bridge.rs          # deBridge/Mayan cross-chain consolidation bridge (#4)
│   │   └── mod.rs
│   ├── network/
│   │   ├── rpc_manager.rs     # Custom RPC endpoint manager & auto-fallback (Live)
│   │   ├── proxy.rs           # Proxy IP rotator (HTTP / SOCKS5) (#50)
│   │   ├── hedging.rs         # Multi-node RPC latency race engine (#52)
│   │   ├── flashbots.rs       # Anti-MEV private mempool relay (#3)
│   │   ├── faucets.rs         # Automated testnet faucet dispenser hub (#38)
│   │   └── mod.rs
│   ├── notifications/
│   │   ├── webhook.rs         # Automated broadcast notification dispatcher (Discord / Slack / Webhook) (#59)
│   │   └── mod.rs
│   ├── analytics/
│   │   ├── taint_graph.rs     # Anti-Sybil cluster analysis & on-chain taint graph (#42)
│   │   ├── cex_guard.rs       # CEX multi-wallet deposit route guard (#43)
│   │   ├── eligibility.rs     # Multi-chain Merkle proof airdrop eligibility radar (#44)
│   │   ├── points_radar.rs    # Off-chain protocol XP & points auditor (#45)
│   │   ├── pnl.rs             # Vault net worth snapshot & historical PnL tracker (#58)
│   │   └── mod.rs
│   ├── archive/
│   │   ├── plurivex.rs        # Portable `.plurivex` archive encryption & migration (#60)
│   │   └── mod.rs
│   └── mod.rs
├── db/
│   ├── schema.rs              # Database table name constants and definitions
│   ├── migrations.rs          # Official SQLite schema migrations (v1 through v7)
│   └── mod.rs
├── utils/
│   ├── errors.rs              # Standard unified error enumeration (AppError)
│   ├── time.rs                # Timestamp and clock utilities
│   └── mod.rs
├── lib.rs                     # Tauri v2 library module entry point
└── main.rs                    # Binary execution entry point
```

### 🧩 Core Ports / Trait Interfaces & Dependency Rules:
To strictly enforce the Hexagonal Architecture (Inversion of Control) pattern:
1. **Absolute Dependency Rule:**
   * `core/` **MUST NEVER IMPORT** `adapters/`.
   * `adapters/` implements *traits / ports* declared inside `core/`.
   * `app/commands.rs` serves strictly as a *thin controller / dispatcher*, containing zero direct domain business logic.
2. **Formal Core Port / Trait Definitions:**
   * `VaultRepository`: Abstraction for local SQLite vault CRUD operations.
   * `RpcProvider`: Abstraction for balance reading, nonces, gas limits, and fee estimation (EVM & Solana).
   * `TransactionBroadcaster`: Abstraction for broadcasting signed transactions to mempools and validator relays.
   * `PriceOracle`: Abstraction for real-time market currency conversion.
   * `ClipboardService`: Abstraction for OS-level clipboard sanitization.
   * `ArchiveStore`: Abstraction for encrypted `.plurivex` bundle export and import.

---

## 🎨 6. React Frontend Architecture & Security Boundaries

### 📂 Frontend Directory Structure (`src/`):

```text
src/
├── app/
│   ├── layout/                # Desktop shell (Top Header Mode Switcher, Status Bar)
│   ├── providers/             # Theme & Modal Portals
│   └── routes/                # Main tab navigation
├── features/
│   ├── vault/                 # Wallet management, import/export, typo repair
│   ├── scanner/               # Balance inspection table, secondary tokens, filters
│   ├── execution/             # Batch sweeper, disperser, queue manager
│   ├── dex/                   # DEX batch trader (Uniswap, Pancake, Raydium)
│   ├── analytics/             # PnL tracker, USD/IDR valuation, explorer hub
│   └── settings/              # Custom RPCs, proxy rotator, security timer
├── components/
│   ├── ui/                    # Buttons, badges, inputs, modal dialogs
│   ├── table/                 # Virtualized Table 10,000 Wallets
│   └── modals/                # ExportModal, ResetModal, SimulationModal
├── stores/
│   ├── walletStore.ts         # Zustand: Wallet list & metadata (Selector Subscriptions)
│   ├── scanStore.ts           # Zustand: Live balances & token balances
│   ├── executionStore.ts      # Zustand: Batch execution queue
│   └── appStore.ts            # Zustand: Operating mode (Audit / Vault / Execution)
└── lib/
    ├── tauri.ts               # Tauri invoke communication bridge
    ├── format.ts              # Balance & currency formatting utilities
    ├── validation.ts          # Address, private key, seed phrase validation
    └── security.ts            # Clipboard auto-clear bridge
```

---

### 🚀 Cryptographic Migration Execution Status to Rust Core (Zero Secret Persistence Model):
*(Frontend Transition Note: Secret credentials transit only ephemerally in input field memory while entered by the user, and are promptly dispatched to the Rust Core via IPC. Sensitive data is never persisted to web storage, frontend caches, long-term state, or logging pipelines (Zero Secret Persistence Model).*
The migration of secret-bearing cryptographic logic from TypeScript to the Rust Core is **formally complete, 100% verified, and committed locally**:

1. **100% Native Rust Vault Encryption & Decryption (`core/security/crypto.rs`):**
   * Browser-based Web Crypto PBKDF2 in React has been **completely removed** and replaced by gold-standard **Argon2id + AES-256-GCM** in native Rust.
   * **100% Backward-Compatible:** The Rust engine automatically detects and decrypts legacy PBKDF2 database formats (120,000 iterations), guaranteeing existing SQLite wallet databases unlock seamlessly without data loss.
   * Active IPC commands: `vault_encrypt`, `vault_decrypt`, `vault_create_token`, `vault_verify_token`.

2. **100% Native Rust Dual-Chain Key Derivation (`core/wallets/derivation.rs`):**
   * **BIP-39 Mnemonics:** 12/24-word parsing, normalization, and validation executed natively by the Rust `bip39` crate.
   * **EVM Key Derivation (BIP-44 `m/44'/60'/0'/0/0`):** Derived using `k256` (Secp256k1) and `sha3` (Keccak256 EIP-55 Checksum).
   * **Solana Key Derivation (SLIP-0010 `m/44'/501'/0'/0`):** Derived using Phantom/Ledger-compliant HMAC-SHA512 SLIP-0010, `ed25519-dalek`, and `bs58`.
   * Active IPC commands: `vault_derive_credentials`, `vault_validate_mnemonic`.

3. **React Frontend Operates as a Thin IPC Bridge (Zero Secret Persistence):**
   * `src/lib/crypto.ts` and `src/lib/wallet.ts` strictly delegate all cryptographic operations to native Rust commands.
   * Secret credentials are handled in isolated Rust memory (`SecureBuffer` with volatile RAM zeroize on drop).

* **Official Rust Unit Test Suite (`cargo test --lib`):** 100% passing across all tests (0 failures).

---

### 🛡️ Cryptographic Security Boundaries:

1. **Zero Secrets in Storage:**  
   Private keys and seed phrases **MUST NEVER** be stored in browser webview `localStorage`, `sessionStorage`, or `IndexedDB`.  
   *(Scope Clarification: `localStorage` is restricted exclusively to non-sensitive UI preferences, such as auto-lock timer durations or interface themes).*
2. **RAM Memory Zeroize:**  
   Every memory buffer holding sensitive credentials in Rust is encapsulated in a `SecureBuffer` and immediately overwritten with zeroes (`std::ptr::write_volatile(0)`) upon `Drop`.
3. **OS-Level Native Clipboard Auto-Clear (Windows 30s):**  
   Leverages native Windows kernel `user32.dll` (`EmptyClipboard`) in an asynchronous background thread that executes reliably even when the application window loses focus.
4. **Cryptographic Erasure & Database Cleanup:**  
   The emergency reset procedure (`Emergency Vault Purge`) executes coordinated deletion of the primary `.db` database file along with `-wal` and `-shm` transaction journal files.

---

## 📑 7. Engineering Appendices

---

### 📊 APPENDIX A: DATA CLASSIFICATION MATRIX

| Data Class | Scope of Credentials & Information | Designated Storage Location | Retention & Memory Sanitization Policy |
| :--- | :--- | :--- | :--- |
| **Class A: Plaintext Secret Material** | Plaintext Mnemonic Seed Phrases, Plaintext Hex Private Keys, Plaintext Solana Base58 Secrets, In-Memory Signing Keys, Plaintext Master Passwords. | **Rust Secure RAM Only** (`SecureBuffer` construct). **Strictly prohibited** from persistence in SQLite database or webview storage. | Strictly ephemeral. Must be eradicated via volatile binary zeroize immediately upon completion of derivation or signing routines. |
| **Class B: Encrypted Secret-at-Rest & Sensitive Metadata** | Encrypted Secret Blobs (`PLX1` Argon2id + AES-256-GCM ciphertext), Custom Wallet Labels/Tags, Transaction Balance History, Custom RPC Endpoint Configurations, Webhook URLs. *(Privacy Note: If custom RPC endpoints contain credentials or provider API keys such as Alchemy/QuickNode/Helius, they are classified as encrypted-at-rest metadata and masked in the UI).* | **Local Encrypted SQLite Database** (`plurivex_vault.db` in local OS AppData). | **Stored encrypted-at-rest at all times**, and only ephemerally decrypted inside Rust `SecureBuffer` when Master Password authentication succeeds. Fully purged upon Emergency Vault Purge. |
| **Class C: Non-Sensitive UI Preferences** | Auto-Lock Duration (Off/30s/1m/5m), Display Themes (Dark/Light), Virtual Table Column Visibility Settings, Currency Valuation Preferences (USD/IDR). | **LocalStorage / SQLite Settings Table**. | Non-sensitive user preferences. Managed freely by the UI layer with zero exposure to private keys, balances, or passwords. |

---

### 🔌 APPENDIX B: FORMAL TAURI IPC COMMAND CONTRACT

> **🔒 Sensitive Command Boundary & Return Contract Principles:**  
> 1. **Non-Leaking Ingestion & Derivation:** The `vault_derive_credentials` command during standard registration or import workflows exposes only public addresses (`evmAddress`, `solAddress`) and canonical fingerprints for UI rendering. The `DerivedWalletPreview` contract strictly encapsulates public data and is protected against exposing or persisting plaintext private keys to long-term state or browser storage.  
> 2. **Gated Plaintext Reveal Command (`vault_decrypt`):** Plaintext secret revelation is **strictly restricted** to explicit interactive user actions (*Reveal Secret*) in `WalletDetail.tsx`. This command is guarded by multi-layered gates: Master Password re-authentication, 15-second visual auto-masking, and 30-second Windows OS kernel clipboard auto-purging. This command is strictly banned from batch operations.  
> 3. **Just-in-Time Batch Sweeper Execution (Phase 3):** Bulk transaction execution processes private keys entirely within Rust Core `SecureBuffer` memory without ever leaking plaintext keys to the React/webview layer (frontend receives only `SessionHandle`, queue status, and `TxHash` receipts).

| IPC Command Name | Input Parameters | Return Type (Result) | Capability Identifier | Domain Function |
| :--- | :--- | :--- | :--- | :--- |
| `rpc_get_balance` | `address: String, rpc: String` | `Result<String, String>` | `allow-rpc-get-balance` | Query native EVM balance |
| `rpc_get_sol_balance` | `address: String, rpc: String` | `Result<String, String>` | `allow-rpc-get-balance` | Query native SOL balance |
| `scan_balances` | `wallet_id: Option<i64>, wallet_ids: Option<Vec<i64>>` | `Result<ScanSummary, String>` | `allow-scan-balances` | Parallel batch scanning orchestrator |
| `get_chain_fee_data` | `chain_key: String` | `Result<ChainFeeResponse, String>` | `allow-fee-estimate` | EVM gas price & base fee estimate |
| `get_account_nonce_and_balance` | `address: String, rpc: String` | `Result<NonceBalanceResponse, String>` | `allow-fee-estimate` | Validates nonce and spending balance |
| `get_solana_recent_blockhash` | `rpc: String` | `Result<String, String>` | `allow-fee-estimate` | Query latest Solana blockhash |
| `get_solana_account_details` | `address: String` | `Result<SolanaAccountDetails, String>` | `allow-fee-estimate` | Audit Solana account type & rent reserves |
| `broadcast_raw_tx` | `raw_tx_hex: String, rpc: String` | `Result<String, String>` | `allow-tx-broadcast` | Broadcast signed EVM raw transaction |
| `broadcast_solana_tx` | `raw_tx_base64: String, rpc: String` | `Result<String, String>` | `allow-tx-broadcast` | Broadcast signed Solana transaction to validators |
| `scan_directory_native` | `dir_path: String` | `Result<NativeScanResult, String>` | `allow-directory-scan` | Recursive local directory credential extraction |
| `schedule_clipboard_clear` | `timeout_secs: u64` | `Result<(), String>` | `allow-clipboard-clear` | Windows native OS clipboard auto-clear |
| `window_minimize` | *(None)* | `Result<(), String>` | `allow-window-controls` | Desktop window controls (Minimize) |
| `window_toggle_maximize` | *(None)* | `Result<(), String>` | `allow-window-controls` | Desktop window controls (Maximize/Restore) |
| `window_close` | *(None)* | `Result<(), String>` | `allow-window-controls` | Desktop window controls (Close) |
| `vault_encrypt` | `plaintext: String, password: String` | `Result<String, String>` | `allow-vault-crypto` | Argon2id + AES-256-GCM vault encryption |
| `vault_decrypt` | `blob: String, password: String` | `Result<String, String>` | `allow-vault-crypto` | Vault decryption (Argon2id & PBKDF2 fallback) |
| `vault_create_token` | `password: String` | `Result<String, String>` | `allow-vault-crypto` | Master password verification token creation |
| `vault_verify_token` | `token: String, password: String` | `Result<bool, String>` | `allow-vault-crypto` | Vault master password authentication |
| `vault_derive_credentials` | `secret: String, wallet_type: String` | `Result<DerivedWalletPreview, String>` | `allow-vault-derivation` | Native dual-chain EVM & Solana public credential derivation |
| `vault_validate_mnemonic` | `phrase: String` | `Result<bool, String>` | `allow-vault-derivation` | BIP-39 wordlist and checksum validation |
| `vault_unlock` | `password: String` | `Result<SessionHandle, String>` | `allow-vault-crypto` | Secure memory session authentication & handle issuance |
| `vault_lock` | *(None)* | `Result<(), String>` | `allow-vault-crypto` | Vault locking & RAM binary key zeroization |
| `vault_get_session_status` | *(None)* | `Result<SessionState, String>` | `allow-vault-crypto` | Query vault session status (Locked / Unlocked) |

---

### ⚙️ APPENDIX C: EXECUTION QUEUE STATE MACHINE

To ensure multi-chain bulk execution reliability without fund loss or stuck nonces:

```text
┌─────────┐     Schema Validation      ┌───────────┐   Simulation eth_call / simulateTx   ┌───────────┐
│  Draft  │ ──────────────────────> │ Validated │ ─────────────────────────────────> │ Simulated │
└─────────┘                         └───────────┘                                    └───────────┘
                                                                                           │
                                            ┌──────────────────────────────────────────────┘
                                            ▼
                                ┌───────────────────────┐
                                │ Awaiting Password /   │ (Master Password Authorization in Execution Mode)
                                │ User Authorization    │
                                └───────────────────────┘
                                            │
                                            │ Master Password Confirmed
                                            ▼
                                ┌───────────────────────┐
                                │        Queued         │
                                └───────────────────────┘
                                            │
                                            │ Fetch Nonce, Fees & Just-in-Time Sign
                                            ▼
                                ┌───────────────────────┐
                                │     Broadcasting      │ (JIT Signing in Rust RAM & RPC Broadcast)
                                └───────────────────────┘
                                            │
                      ┌─────────────────────┼─────────────────────┐
                      │ Success Receipt      │ Gas Surge / Nonce Collision  │ Revert / RPC Reject
                      ▼                     ▼                     ▼
              ┌───────────────┐     ┌───────────────┐     ┌─────────────────────────────────────┐
               │   Confirmed   │     │   Retrying    │     │               Failed                │
               │  (Tx Success)  │     │  (Auto-Bump)  │     │ (Pre-Broadcast / Reverted / Expired)│
               └───────────────┘     └───────┬───────┘     └─────────────────────────────────────┘
                                             │
                                             └─────── (Auto Re-Sign & Bump Fee) ───────┐
                                                                                       │
                                                                                       ▼
                                                                           ┌───────────────────────┐
                                                                           │ Return to Broadcast  │
                                                                           └───────────────────────┘
```

* **Draft:** User configures bulk transfer parameters (destination addresses, tokens, gas limits).
* **Validated:** Address formats, token decimals, and balance allocations successfully pass local multi-chain schema validation.
* **Simulated:** Transactions pass multi-chain pre-flight dry-runs (EVM `eth_call` & Solana `simulateTransaction`) without reverts, verifying gas/rent sufficiency.
* **Awaiting Authorization:** The system requests Master Password authorization in **Execution Mode** to unlock signing keys inside Rust secure memory.
* **Queued:** Transactions enter the FIFO execution queue as authorized Transaction Intents, scheduled with randomized anti-Sybil timing jitter. Payloads are not signed yet to avoid stale nonces or fee surges.
* **Broadcasting (Just-in-Time Signing & Broadcast):** Immediately prior to dispatch, the executor retrieves the latest nonce and base fee, compiles the final payload, signs Just-in-Time inside Rust `SecureBuffer`, broadcasts to the RPC node or validator relay, and immediately zeroizes in-memory secrets.
* **Confirmed:** Transaction is finalized on the target blockchain, validated by chain-specific indicators (`status: 1` on EVM receipts, `meta.err == null` on Solana).
* **Retrying:** Nonce collision or sudden base fee surge occurs (up to 3 retries with exponential backoff and fee auto-bumping).
* **Failed:** Transaction fails. The system logs comprehensive diagnostic details.
  * **Gas Cost Analysis on Failed States:**
    1. *Failed Pre-Broadcast:* Gas cost = 0 (cancelled prior to dispatch).
    2. *Rejected by RPC Node:* Gas cost = 0 (insufficient balance or mempool rejection prior to block inclusion).
    3. *Reverted On-Chain:* **Gas fees are consumed and paid to network validators** according to compute units consumed prior to revert.
    4. *Dropped / Expired:* Gas liability depends on replacement transaction status (speed-up or nonce cancellation).

---

### 🛡️ APPENDIX D: THREAT MODEL & SECURITY ASSUMPTIONS

This section explicitly defines security boundaries protected by Plurivex versus vectors outside the realm of software engineering:

#### 1. In-Scope Protections:
* **Clipboard Key Theft:** Mitigated by 30-second native OS kernel-level auto-clearing.
* **Shoulder-Surfing:** Mitigated by 15-second visual auto-masking on revealed secrets.
* **Unattended Physical Device Access:** Mitigated by configurable idle auto-lock timers zeroing memory keys and locking the interface.
* **Offline Database File Theft:** Mitigated by authenticated AES-256-GCM encryption requiring the user's Master Password to derive keys via Argon2id.
* **Scam Tokens & Phishing Dust:** Mitigated by real-value heuristics and malicious contract detection filters.
* **Failed Gas Waste:** Mitigated by pre-flight dry-run simulation engines preventing revert transactions from broadcasting.

#### 2. Out-of-Scope / Non-Guaranteed Boundaries:
* **Active Host OS Malware Infection:** If the host machine is compromised by kernel-level keyloggers or screen recording trojans, malware can capture keystrokes during password entry.
* **Physical Hardware Tampering:** Hardware extraction attacks (e.g., cryogenic RAM cold boot attacks) are beyond the mitigation capabilities of user-space desktop applications.
* **Malicious Public RPC Nodes:** Connecting to compromised third-party RPC nodes can result in spoofed balance data. Users remain responsible for selecting reputable RPC providers.

---

> **Storage Note:** This master 60-feature technical specification, phased roadmap, backend domain architecture, frontend architecture, and engineering appendices are stored at:  
> 📁 `docs/PLURIVEX_MASTER_FEATURE_SPEC.md`  
> This document is managed in the project repository for architectural reference.


---

## 🏛️ 8. Operational Frameworks & Execution Discipline

As part of the **Specification Document Freeze (Official Baseline)**, the following four operational frameworks govern all development execution:

---

### 📋 8.1 Definition of Done (DoD) per Development Phase

> *Benchmark Environment Note: All performance benchmarks are evaluated on standard reference hardware (Intel Core i5 / AMD Ryzen 5, 16GB RAM, NVMe SSD) under broadband connections and non-congested blockchain conditions.*

Every feature across the roadmap is deemed **Done** strictly when satisfying the following quality and security gates:

| Roadmap Phase | Acceptance Criteria | Performance Benchmark | Security Gate | Rollback Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1: Key Foundations & Forensics** | Mnemonic validation passes official BIP-39 vectors, HD path index 0-50 scanning verified, instant batch wallet generation. | Generation of 1,000 wallets < 2.5s in Rust. | Private keys prohibited from webview storage. Memory zeroized upon completion. | Parsing failures display targeted error toasts without terminating the vault session. |
| **Phase 2: Infrastructure & Anti-Scam** | Multi-RPC race engine selects lowest latency; simulation detects reverts prior to broadcast. | RPC switching latency < 150ms. | Proxy IP routing with mandatory DNS leak protection. | If all RPCs timeout, transactions halt at `Validated` state and never broadcast without simulation. |
| **Phase 3: Smart Contracts & Sweeper** | Multi-token atomic sweeping on EVM & Solana routes 0.70% protocol fee to Treasury accurately. | Broadcast 100 transactions < 30s. | Just-in-Time signing in Rust `SecureBuffer`. Zero plaintext leakage to webview. | On-chain reverts trigger auto-pause on queue to prevent draining gas reserves. |
| **Phase 4: Airdrop Automation & Anti-Sybil** | Randomized 5–60s delays active; taint graph validates no local cross-wallet clustering. | 1,000 nodes taint graph renders at 60 FPS. | CEX deposit routing minimizes cross-contamination based on local rules. | Sybil hazard warnings block execution pending explicit manual user confirmation. |
| **Phase 5: Elite Forensics & Ecosystem** | Rule-based JSON keystore recovery unlocks valid seeds; `.plurivex` dual-encrypted archive restores on fresh devices. | Archive decryption < 5s. | Archive recovery passphrases verified via Argon2id. | Corrupted archives abort extraction safely, preserving local database integrity. |

---

### 💳 8.2 Architecture Debt Register (Technical Debt Paydown Schedule)

> *Engineering Governance Note: Entries in this debt register do not invalidate the Complete & Live status of production features. Feature statuses reflect live functional capability, while debt records denote engineering hardening, modularization, and pure native Rust consolidation scheduled ahead of target phases.*

List of transitional components slated for migration from TypeScript wrappers into pure Rust implementations:

| Debt ID | Current Frontend File | Final Target Rust Component | Target Deadline | Rationale |
| :---: | :--- | :--- | :---: | :--- |
| **DEBT-01** | `src/lib/sweeper.ts` (Tx Payload Assembly) | `src-tauri/src/core/execution/sweeper.rs` | **Before Phase 3** | Guarantees private keys are never decrypted in JavaScript memory during batch sweeping. |
| **DEBT-02** | `src/components/DexBatchTrader.tsx` | `src-tauri/src/core/execution/trader.rs` | **Before Phase 3** | Eliminates browser Web3 library dependencies during Uniswap/Raydium router interactions. |
| **DEBT-03** | `src/lib/extract.ts` (Partial Regex Parser) | `src-tauri/src/core/wallets/import.rs` | **Phase 1 (Completed)** | Migrates 100% of text and log credential scanning to native Rust memory for maximum performance. |
| **DEBT-04** | `src/lib/chains.ts` (RPC State) | `src-tauri/src/core/network/rpc_manager.rs` | **Phase 2** | RPC API credential management and automatic failover managed entirely inside Rust backend. |

---

### 🛡️ 8.3 Test & Security Gate Matrix

Prior to merging changes to the `main` branch, all of the following quality gates must pass:

1. **Unit Test Coverage Mandate:**
   * Cryptographic Module (`core/security/`): **Mandatory 100% Unit Test Pass** (Argon2id, PBKDF2 backward compatibility, AES-GCM, Zeroize).
   * Derivation Module (`core/wallets/derivation.rs`): **Mandatory Official BIP-39 / BIP-44 Test Vector Pass** (Ethereum Foundation & Solana vectors).
2. **Capability Access Control List (ACL) Audit:**
   * Every new Rust IPC command must be explicitly declared in permission files (`src-tauri/permissions/*.toml`). Wildcard permissions (`*`) are strictly prohibited.
3. **Memory Sanitization Verification:**
   * All heap buffers holding secret material must be wrapped in `SecureBuffer` structures implementing `Drop` with `std::ptr::write_volatile(0)`.
4. **CI/CD Build Cleanliness:**
   * `cargo check` and `cargo test --lib` must yield **0 Errors and 0 Warnings**.
   * `npm run build` must pass TypeScript type checking with **0 Type Errors**.

---

### ⚖️ 8.4 Release Risk Register & Compliance Gate

Compliance and operational risk protocols prior to public version release:

| Risk Category | Impacted Features | Potential Hazard / Impact | Mitigation Protocol & Governance Gate |
| :--- | :--- | :--- | :--- |
| **Operations & Privacy** | #42 Taint Graph, #43 CEX Deposit Guard, #50 Proxy Rotator | Address clustering by on-chain analytics (Nansen, Chainalysis) causing airdrop disqualification. | Mode-based policies: In *Airdrop Sybil-Shield Mode*, the system blocks transfers to identical CEX deposit addresses from local wallets. In *Standard Direct Consolidation Mode*, address reuse is permitted following an explicit opt-in hazard acknowledgment. |
| **Execution Reliability** | #29 Batch Sweeper, #30 DEX Batch Trader, #31 Disperser | Mass reverts exhausting user gas funds without confirmed receipts. | **Mandatory Pre-Flight Dry-Runs:** Execution is aborted automatically if `eth_call` or `simulateTransaction` dry-runs fail. |
| **Forensics & Ethics** | #7 Smart Universal Parser & Recursive Directory Extractor, #14 Keystore Recovery | Misuse of extraction utilities on credentials not owned by the user. | Mandatory governance badge: `[Authorized Use Only - User-Owned Assets]`. Audit logs are strictly stored locally on the user's workstation. |
| **Offline Key Custody** | #15 Offline Air-Gap Signer, #16 Animated QR Coordinator | Payload corruption during offline transaction signing. | Adoption of the BC-UR (Blockchain Commons Uniform Resources) specification for visual hash verification prior to QR transmission. |
