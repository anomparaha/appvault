import React from 'react';

export const Architecture: React.FC = () => {
  return (
    <section className="section" id="architecture" style={{ background: 'var(--bg-darkest)' }}>
      <div className="container">
        <div className="section-header">
          <span className="section-tag">System Design</span>
          <h2 className="section-title">Local-First Security Pipeline</h2>
          <p className="section-desc">
            Data flows exclusively within your local machine. Private keys never touch hard disk unencrypted, and RPC queries are latency raced with automatic fallback.
          </p>
        </div>

        <div className="arch-grid">
          <div className="arch-step">
            <div className="arch-num">STEP 01</div>
            <h4>Ingestion & Parsing</h4>
            <p>Local parser ingests raw text, CSV, or keystores. Extracts credentials without writing any unencrypted data to temporary files.</p>
          </div>

          <div className="arch-step">
            <div className="arch-num">STEP 02</div>
            <h4>Memory Derivation</h4>
            <p>Master PIN/Password derives ephemeral encryption keys via Argon2id. Keys are stored in heap allocated zeroizing buffers.</p>
          </div>

          <div className="arch-step">
            <div className="arch-num">STEP 03</div>
            <h4>Parallel RPC Race</h4>
            <p>Dispatches non-blocking queries across multiple redundant RPC lanes. Simulates token approvals and honeypots before execution.</p>
          </div>

          <div className="arch-step">
            <div className="arch-num">STEP 04</div>
            <h4>Encrypted Storage</h4>
            <p>Credentials stored into local SQLite in WAL mode with keyed HMAC-SHA256 fingerprints, neutralizing rainbow table attacks.</p>
          </div>
        </div>
      </div>
    </section>
  );
};
