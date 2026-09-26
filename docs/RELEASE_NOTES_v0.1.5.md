# Plurivex v0.1.5 - Performance, Concurrency & UI Patch

### ⚡ Performance, Concurrency & UI Patch
- **Zero-Downtime Asynchronous SQLite Migration**: Automated background re-encryption and chunked migration (Rayon parallel decryption, 100-item transactions, and wipe-on-lock session cancellation) of legacy unkeyed fingerprints to `hmac1:...` on vault unlock across both password and PIN paths, eliminating UI freezing while preserving memory zeroization.
- **Race-Condition Resilience**: Verified atomic deduplication preventing duplicate or constraint errors when wallets are concurrently imported during background migration.
- **Pure Reset Guard**: Extracted `validate_reset_confirmation` pure function shared between production IPC command and unit tests.
- **WebView2 Native Reveal Suppression**: Hidden Microsoft Edge / WebView2 default password reveal button (`::-ms-reveal` / `::-ms-clear`), eliminating visual double eye icon glitch.
- **Quality Assurance**: 71/71 Rust unit tests passing; 100% clean TypeScript & Vite production build.

> **Upgrade Advisory**: Users on v0.1.4 are strongly encouraged to upgrade to v0.1.5 to benefit from asynchronous chunked migration when unlocking vaults with thousands of stored credentials.
