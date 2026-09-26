import React from 'react';

export const MockupShowcase: React.FC = () => {
  return (
    <div className="container">
      <div className="mockup-container">
        <div className="mockup-header">
          <div className="win-window-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <rect x="2" y="2" width="9.2" height="9.2" rx="1.2" />
              <rect x="12.8" y="2" width="9.2" height="9.2" rx="1.2" />
              <rect x="2" y="12.8" width="9.2" height="9.2" rx="1.2" />
              <rect x="12.8" y="12.8" width="9.2" height="9.2" rx="1.2" />
            </svg>
            <span className="mockup-title">Plurivex Desktop Suite · Live Vault Console (v0.1.6)</span>
          </div>
          <div className="win-controls">
            <span className="win-btn win-min">─</span>
            <span className="win-btn win-max">▢</span>
            <span className="win-btn win-close">✕</span>
          </div>
        </div>
        <div className="mockup-screen">
          <div className="mockup-sidebar">
            <div className="mockup-stat-box">
              <span>Encrypted Vault</span>
              <b>7,412 Wallets</b>
            </div>
            <div className="mockup-stat-box">
              <span>Scan Throughput</span>
              <b style={{ color: 'var(--color-green)' }}>312 Addr / sec</b>
            </div>
            <div className="mockup-stat-box">
              <span>Security State</span>
              <b style={{ color: 'var(--accent-bright)' }}>Argon2id + WAL</b>
            </div>
            <div className="mockup-stat-box">
              <span>Memory Guard</span>
              <b style={{ color: 'var(--color-green)' }}>Zeroizing (Active)</b>
            </div>
          </div>

          <div className="mockup-main-panel">
            <div className="mockup-card">
              <div className="mockup-card-header">
                <div>
                  <h4 className="mockup-card-title">Live Multi Chain Scanner</h4>
                  <span className="mockup-card-sub">Executing locally in zeroized RAM · No unencrypted keys touching disk</span>
                </div>
                <span className="nav-badge-pill"><span className="dot"></span>ACTIVE SCAN</span>
              </div>
              <div className="mockup-grid-3">
                <div className="mockup-tile">
                  <small>Solana (ed25519)</small>
                  <strong>0.428 SOL · Swept</strong>
                </div>
                <div className="mockup-tile">
                  <small>Ethereum (EIP-155)</small>
                  <strong>1.842 ETH · Ready</strong>
                </div>
                <div className="mockup-tile">
                  <small>Robinhood / Arbitrum / Base</small>
                  <strong>$4,210.50 · Secured</strong>
                </div>
              </div>
            </div>

            <div className="mockup-card">
              <div className="mockup-card-header">
                <div>
                  <h4 className="mockup-card-title">Pre Flight Token Diagnostics & Honeypot Guard</h4>
                  <span className="mockup-card-sub">Simulates buy & sell transactions before commitment to isolate malicious tokens</span>
                </div>
                <span className="mockup-status-pass">✓ Isolated 1 Scam</span>
              </div>
              <div className="mockup-console-log">
                [04:02:11] BUY TEST: 100 USDT → PASS · SELL TEST: REVERT DETECTED (HONEYPOT) → BLOCKED AUTOMATICALLY
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
