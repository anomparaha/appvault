import React from 'react';

export const Features: React.FC = () => {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Core Capabilities</span>
          <h2 className="section-title">Engineered for Sovereign Asset Security</h2>
          <p className="section-desc">
            Plurivex combines hardened cryptographic key derivation with high speed parallel transaction execution, providing complete privacy with zero cloud dependencies.
          </p>
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </div>
            <h3>Air Gapped Vault Security</h3>
            <p>
              Zero cloud communication. Your secrets are encrypted with memory hard Argon2id (19 MB RAM, 2 iterations, single lane) and wiped from memory using Rust's zeroizing guarantees upon lock.
            </p>
            <span className="feature-highlight">Argon2id + Zeroizing</span>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3>BIP-39 Mnemonic Solver</h3>
            <p>
              Recover damaged or transposed seed phrases locally. Combines Damerau Levenshtein typo correction with Rayon multi threaded brute force, evaluating 4.19M candidate vectors in under 2 seconds.
            </p>
            <span className="feature-highlight">2,048² Combinatorial Space</span>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <h3>Multi Chain Asset Sweeper</h3>
            <p>
              Consolidate balances from dozens of legacy addresses into your primary vault in a single execution pass. Supports Solana, Ethereum, Robinhood Chain, Arbitrum, Base, BSC, and Polygon with minimal gas routing.
            </p>
            <span className="feature-highlight">Cross Chain Sweep Automation</span>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <h3>Pre Flight Honeypot Diagnostics</h3>
            <p>
              Every discovered token is simulated in real time for buy and sell viability before any transfer is committed. Unsellable scam tokens or malicious contracts are isolated automatically.
            </p>
            <span className="feature-highlight">Revert & Gas Trap Detection</span>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </div>
            <h3>Sliding Wallets Directory</h3>
            <p>
              A curved, animated side drawer allowing instant search and virtualized navigation across 7,000+ stored wallets without dropping frames or cluttering the primary workspace.
            </p>
            <span className="feature-highlight">Virtualized Smooth 60 FPS</span>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h3>Solana Nonce Account Manager</h3>
            <p>
              Handle durable transaction nonces and authority transfers deterministically. Withdraw balances and manage rent exempt authority accounts with native ed25519 cryptographic signing.
            </p>
            <span className="feature-highlight">Durable Nonce & Authority Scoping</span>
          </div>
        </div>
      </div>
    </section>
  );
};
