import React from 'react';
import { ContractAddressBadge } from './ContractAddressBadge';

interface FooterProps {
  onOpenWhitepaper: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenWhitepaper }) => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="brand">
              <div className="brand-icon">
                <img src="/assets/logo-dark.png" alt="Plurivex" />
              </div>
              <div className="brand-text">
                <b className="brand-title">PLURIVEX</b>
                <span className="brand-sub">SECURITY VAULT</span>
              </div>
            </div>
            <p>
              The sovereign multi-chain vault and forensic recovery engine built for local digital asset protection.
            </p>
            <div className="footer-socials">
              <a 
                href="https://x.com/Plurivex" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="footer-social-link"
                aria-label="Follow Plurivex on X"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span>Follow @Plurivex</span>
              </a>
              <a 
                href="https://discord.gg/hxG2TJUnW" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="footer-social-link"
                aria-label="Join Plurivex Discord"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                <span>Discord</span>
              </a>
            </div>
          </div>

          <div className="footer-links">
            <div className="footer-col">
              <h5>Product</h5>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#architecture">Architecture</a></li>
                <li><a href="#download">Download v0.1.6</a></li>
                <li><a href="#whitepaper" onClick={(e) => { e.preventDefault(); onOpenWhitepaper(); }}>Web Whitepaper</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h5>Resources</h5>
              <ul>
                <li><a href="#download">Release Notes</a></li>
                <li><a href="#faq">FAQ</a></li>
                <li><a href="#whitepaper" onClick={(e) => { e.preventDefault(); onOpenWhitepaper(); }}>Technical Docs</a></li>
                <li><a href="https://x.com/Plurivex" target="_blank" rel="noopener noreferrer">Official X (Twitter)</a></li>
                <li><a href="https://discord.gg/hxG2TJUnW" target="_blank" rel="noopener noreferrer">Discord Community</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h5>Security</h5>
              <ul>
                <li><a href="#whitepaper" onClick={(e) => { e.preventDefault(); onOpenWhitepaper(); }}>Argon2id Model</a></li>
                <li><a href="#features">Pre Flight Guard</a></li>
                <li><a href="#security">Local-First Guarantee</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Official Verified Contract Bar in Footer */}
        <ContractAddressBadge variant="footer" />

        <div className="footer-bottom">
          <div>&copy; {new Date().getFullYear()} Plurivex Labs. All rights reserved. Zero cloud telemetry.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <a href="#whitepaper" onClick={(e) => { e.preventDefault(); onOpenWhitepaper(); }}>Whitepaper</a>
            <a 
              href="https://x.com/Plurivex" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="footer-bottom-x"
              aria-label="Plurivex on X"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span>@Plurivex</span>
            </a>
            <a 
              href="https://discord.gg/hxG2TJUnW" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="footer-bottom-x"
              aria-label="Plurivex Discord Community"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span>Discord</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
