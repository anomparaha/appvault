# 📁 Plurivex — Document Index

Architecture and specification catalog. **All files in this folder are tracked in Git** (see policy in `.gitignore`).

> ⚠️ **DOCUMENTATION STATUS NOTE.** The documents below provide architectural contracts and implementation maps.
> The structure and framework are maintained here as the canonical source of truth for the project.

---

## Document Directory

| Document | Purpose | Status |
|---|---|---|
| [`PLURIVEX_MASTER_FEATURE_SPEC.md`](PLURIVEX_MASTER_FEATURE_SPEC.md) | Feature contract — required functionality per module | 🟡 Framework |
| [`PLURIVEX_IMPLEMENTATION_MATRIX.md`](PLURIVEX_IMPLEMENTATION_MATRIX.md) | Module map: `[Live]` / `[Scaffold]` / `[JS-only]` | 🟢 **Verified Data** |
| [`MODULARIZATION_AND_REFACTORING_PLAN.md`](MODULARIZATION_AND_REFACTORING_PLAN.md) | Tree-first rules & code migration criteria (JS → Rust) | 🟡 Framework |
| [`PLURIVEX_RECOVERY_5PHASE_ROADMAP.md`](PLURIVEX_RECOVERY_5PHASE_ROADMAP.md) | 5-Phase recovery execution blueprint | 🟡 Framework |
| [`SMART_CONTRACT_PLAN.md`](SMART_CONTRACT_PLAN.md) | Multi-chain on-chain contracts plan | 🟡 Framework |
| [`PLURIVEX_FINAL_APPROVAL_NOTE.md`](PLURIVEX_FINAL_APPROVAL_NOTE.md) | Governance & baseline sign-off note | 🟢 **Verified** |
| [`../AUDIT-PLURIVEX.md`](../AUDIT-PLURIVEX.md) | Technical audit & implementation reference | 🟢 Complete |

## Architectural Conventions

**1. Tree-first is a contract, not just a directory tree.**
Every planned scaffold struct must contain a machine-searchable marker:
```rust
/// TODO(plurivex): Planned scaffold module for Phase N (tree-first architecture).
pub struct FooService;
```

**2. `[Live]` vs `[Scaffold]` labels in README must match reality.**
The README legends maintain absolute clarity on implemented features versus planned roadmap stubs.

**3. Single source of truth for data models.**
Local database schema = `db/migrations.rs`.
Record types = `core/vault/models.rs`.

---
