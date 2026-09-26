# 📋 Plurivex Onchain Execution Layer — Whitepaper v1.0 Execution & Alignment Plan

**Document Version:** 1.0.0  
**Date:** September 10, 2026  
**Status:** Active Strategic Backlog & Audit Alignment Matrix  
**Corresponds to:** `Whitepaper v1.0: Plurivex — The Onchain Execution Layer`

---

## 🧭 Executive Overview

This document establishes the official development backlog, audit alignment matrix, and feature prioritization for **Plurivex Whitepaper v1.0 ("The Onchain Execution Layer")**.

The Whitepaper establishes a unified lifecycle model:
$$\text{INTENT} \longrightarrow \text{SIMULATE} \longrightarrow \text{PROTECT} \longrightarrow \text{EXECUTE} \longrightarrow \text{VERIFY} \longrightarrow \text{RECOVER}$$

To guarantee 100% technical honesty and prevent overclaiming in public releases, this matrix maps all **25 chapters** of the Whitepaper to the actual codebase, clearly demarcating what is **LIVE & VERIFIED**, what is **IN DEVELOPMENT**, and what requires **IMMEDIATE RECONCILIATION**.

---

## 🎯 Feature Alignment Matrix & Status

| Chapter | Topic | Real Codebase Status | Audit Verification | Execution Priority |
|---|---|---|---|:---:|
| **Ch. 1–4** | Foundations &amp; Lifecycle Thesis | Introduction, Problem, Mnemonic Math &amp; What Is Plurivex | ✅ Aligned with Product Vision | **P0** (Editorial) |
| **Ch. 5** | Execution Lifecycle &amp; Dual-Pillar Recovery | 6-Stage Pipeline (Intent, Simulate, Protect, Execute, Verify, Recover) | ✅ Pillar 1 LIVE (72/72 tests) / ⏳ Pillar 2 in dev | **P0** (Live Core) |
| **Ch. 6** | Multi-Wallet Orchestration | Batch sweep &amp; local wallet indexing | ✅ LIVE (`useWalletOperations`, `sweeper.ts`) | **P0** (Live) |
| **Ch. 7** | Policy-Based Atomicity | Sequential batch execution with error abort | ✅ LIVE in Sweeper engine | **P0** (Live) |
| **Ch. 8** | Multi-Chain Execution | EVM + Solana + Bitcoin native support | ✅ LIVE (EVM BIP-44, Solana, BTC Bech32/WIF) | **P0** (Live) |
| **Ch. 9** | Phrasser (Universal Calldata Parser) | Scheduled for Phase II; Live credential parsing in `extractor.rs` | ✅ Reclassified to Phase II Roadmap | **P0** (Reconciled) / **P1** (Core Dev) |
| **Ch. 10** | Sweeper Engine | Multi-wallet fund consolidation | ✅ LIVE in `SweeperWorkspace.tsx` &amp; `sweeper.ts` | **P0** (Live) |
| **Ch. 11** | DEX Batch Execution | UI Simulator preview in `DexBatchTrader.tsx` | ⏳ On-chain DEX routing in development | **P2** (DeFi Routing) |
| **Ch. 12–13**| Security &amp; Local-First Philosophy | Argon2id KDF, Zeroize memory, Keyed HMAC, WAL | ✅ LIVE &amp; AUDITED (`crypto.rs`, `session.rs`) | **P0** (Crypto Details) |
| **Ch. 14** | Core Architecture | Tauri v2 Core + Rust + React 19 Client Shell | ✅ LIVE in `src-tauri` and `src` | **P0** (Live) |
| **Ch. 15** | Policies &amp; Automation | Programmable execution guardrails &amp; automated rebalancing | ✅ Static LIVE / ⏳ Automated loop Roadmap | **P2** (Automation Engine) |
| **Ch. 16** | Competitive Landscape &amp; Differentiation | Market positioning analysis &amp; systemic integration | ✅ Theoretical Strategy | **P0** (Editorial) |
| **Ch. 17** | Product Development Status | Table aligns: Extractor LIVE, Phrasser IN DEV, Recovery LIVE | ✅ Reconciled in Table | **P0** (Aligned) |
| **Ch. 18–20**| $PLUR Economics &amp; Core Stewardship | Closed economic loop, technical utility &amp; deterministic engineering | ⏳ Roadmap Phase IV (Post-smart contract) | **P3** (Token Design) |
| **Ch. 21** | Strategic Roadmap (Phases I–IV) | 4-Phase strategic progression track | ✅ Aligned with `SMART_CONTRACT_PLAN.md` | **P0** (Roadmap) |
| **Ch. 22–25**| Principles, Risks, AI Era &amp; Conclusion | Security assurances, AI agent thesis, concluding synthesis &amp; appendices | ✅ Aligned with security memorandum | **P0** (Living Document) |

---

## 🚀 Prioritized Engineering Roadmap

### Phase P0 — Immediate Audit & Whitepaper Alignment (Current Sprint)
1. **Interactive Whitepaper Reader Update**:
   - Update `WhitepaperReader.tsx` on the web portal to display the complete 25-chapter v1.0 draft.
   - Attach interactive status badges:
     - `[LIVE IN CORE]` (Green ✅) for verified features.
     - `[ROADMAP / IN DEV]` (Gold ⏳) for active development items.
     - `[AUDIT NOTE / REVISION]` (Amber ⚠️) for discrepancy reconciliations.
2. **Reconcile "Phrasser"**:
   - Status updated across Chapter 11, 23, 29, and Appendix B to position Phrasser as **"IN DEVELOPMENT — Phase II Execution Parser"**, eliminating false "LIVE" claims.
   - Emphasized existing `Universal Key & Credential Extractor` (`extractor.rs`) as the current live Phase I parsing utility.
   - Preserved Phrasser's flagship value proposition: anti-blind signing, 4-byte selector resolution (`0xa9059cbb`, `0x095ea7b3`), and pre-flight malicious approval detection.
3. **Restore Forensic Seed Recovery to Chapter 6.6 & 7**:
   - Status: ✅ **Reconciled & Implemented in Web Specification**.
   - Formally established the **Dual-Pillar Recovery Model**:
     - **Pillar 1 (Live Core · Audited):** Forensic Key & Mnemonic Recovery (Rayon 4.19M pairs, 10 BIP-39 dictionaries, Damerau-Levenshtein distance, zero-disk RAM privacy via `Zeroizing`).
     - **Pillar 2 (Roadmap · Phase III):** On-chain transaction execution failure recovery (EIP-1559 gas escalation, fallback RPC route switching, nonce collision resolution).
4. **Re-Integrate Cryptographic Vault Specifications into Chapter 14 & 15**:
   - Status: ✅ **Reconciled & Implemented in Web Specification**.
   - Added exact Argon2id KDF parameters (`m = 19,456 KiB` / 19 MiB RAM, `t = 2`, `p = 1`), volatile memory zeroization with `Zeroizing` & memory barrier fences, and keyed HMAC-SHA256 (`hmac1:`). Corrected diagram in Chapter 16 to 19MB.
5. **Add Bitcoin to Chapter 10 (Multi-Chain)**:
   - Status: ✅ **Reconciled & Implemented in Web Specification**.
   - Explicitly integrated Bitcoin Tri-Address derivation (Native SegWit Bech32 `bc1q...`, Legacy BIP-44, WIF) alongside EVM and Solana SLIP-0010.
6. **Delineate Client Desktop Phase vs Protocol Expansion & $PLUR**:
   - Status: ✅ **Reconciled & Implemented in Web Specification (Chapters 5 & 24–26)**.
   - Grounded current operations in the sovereign, zero-cloud desktop application, positioning $PLUR technical utility and core engineering stewardship as the Phase V protocol expansion.

---

### Phase P1 — Core Execution & Simulation Engine (Next Sprint)
1. **Pre-Trade Transaction Simulation Engine**:
   - Implement native `eth_call` gas and state preview in Rust backend before sweeper or batch broadcast.
   - Implement Solana transaction simulation (`simulateTransaction` RPC) to inspect balance deltas and error logs prior to signature broadcast.
2. **Phrasser Universal Decoder Prototype**:
   - Create `src-tauri/src/core/execution/phrasser.rs` to decode standard ERC-20 (`transfer`, `approve`, `permit`) and Uniswap V2/V3 calldata into structured human-readable JSON.
   - Display visual transaction decoding in the UI before user confirms broadcast.
3. **Private RPC & MEV Protection Routing**:
   - Add toggleable Flashbots Protect / MEV-Blocker RPC endpoints for EVM chains to shield transactions from public mempool frontrunning bots.

---

### Phase P2 — DeFi Batch Execution & Policy Engine
1. **On-Chain DEX Batch Trader**:
   - Connect `DexBatchTrader.tsx` to live Uniswap V2/V3 and PancakeSwap router contracts.
   - Implement slippage protection and multi-wallet parallel order broadcasting.
2. **Programmable Execution Policies**:
   - Configurable transaction limits, primary/secondary RPC fallback hedging, and automatic retry up to $N$ attempts on network congestion.

---

### Phase P3 — Protocol Layer, SDK & $PLUR Economics
1. **TypeScript Client SDK (`@plurivex/sdk`)**:
   - Expose Plurivex execution orchestration primitives for third-party bots, trading terminals, and portfolio managers.
2. **Smart Contract Deployment (`PlurivexSweeper.sol`)**:
   - Audit and deploy deterministic `CREATE2` sweeper contracts across EVM mainnets per `docs/SMART_CONTRACT_PLAN.md`.
3. **$PLUR Tokenomics & Fee Sharing Protocol**:
   - Implement 1% developer success fee routing and protocol revenue distribution architecture.

---

## 📌 Implementation Safety Protocol
- All whitepaper editorial revisions and status pill updates remain **100% LOCAL** until reviewed and approved.
- Zero premature git pushes to remote `origin/main`.
- Technical honesty and audit alignment remain non-negotiable.
