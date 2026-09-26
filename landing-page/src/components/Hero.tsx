import React from 'react';
import { ContractAddressBadge } from './ContractAddressBadge';

interface HeroProps {
  onOpenWhitepaper: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenWhitepaper }) => {
  return (
    <section className="hero">
      <div className="container">
        {/* H1 Heading */}
        <h1 className="hero-title">
          The Sovereign Multi-Chain Vault<br className="hero-title-br" />
          &amp; Forensic Recovery Engine
        </h1>

        {/* Subtitle */}
        <p className="hero-sub">
          Consolidate, scan, and secure digital assets across Solana, EVM, and Bitcoin.<br className="hero-sub-br" />
          Local Argon2id encryption, multi-core seed repair, and automated asset sweeping.
        </p>

        {/* Symmetrical Hero Action Buttons */}
        <div className="hero-actions">
          <a 
            href="#download"
            className="btn btn-primary"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            <span>Get Plurivex</span>
          </a>

          <button onClick={onOpenWhitepaper} className="btn btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
            </svg>
            <span>Read Whitepaper</span>
          </button>
        </div>

        {/* Official Contract Address Pill */}
        <ContractAddressBadge variant="hero" />
      </div>
    </section>
  );
};
