import React from 'react';

export const FAQ: React.FC = () => {
  return (
    <section className="section" id="faq" style={{ background: 'var(--bg-darkest)' }}>
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Frequently Asked Questions</span>
          <h2 className="section-title">Clear Answers on Architecture & Privacy</h2>
        </div>

        <div className="faq-grid">
          <div className="faq-item">
            <h4>Does Plurivex send my private keys to any cloud server?</h4>
            <p>
              No. Plurivex is strictly local-first with zero telemetry. All key derivation, parsing, decryption, and database operations happen exclusively on your local machine. No remote analytics or secrets are ever transmitted.
            </p>
          </div>

          <div className="faq-item">
            <h4>How does the Mnemonic Recovery engine work?</h4>
            <p>
              When a word is misspelled or missing, Plurivex applies Damerau Levenshtein distance against the official BIP-39 English dictionary. For missing words, it spawns multi threaded Rayon workers evaluating up to 4.19 million candidate seed vectors in under 2 seconds.
            </p>
          </div>

          <div className="faq-item">
            <h4>What blockchains are currently supported?</h4>
            <p>
              Plurivex supports Solana (ed25519 & durable nonces), Bitcoin (BIP-44, BIP-49, BIP-84 vectors), and all EVM compatible chains including Ethereum, Robinhood Chain, Arbitrum, Base, Binance Smart Chain (BSC), and Polygon.
            </p>
          </div>

          <div className="faq-item">
            <h4>How is application security verified?</h4>
            <p>
              Plurivex enforces strict mathematical security models. All cryptographic primitives utilize battle tested, peer reviewed implementations (Argon2id, ed25519-dalek, k256). Every production release passes 72 automated regression and cryptographic test suites, and desktop release binaries carry verifiable Minisign digital signatures for integrity verification.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
