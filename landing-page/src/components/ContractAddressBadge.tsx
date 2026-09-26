import React, { useState } from 'react';
import { TOKEN_CONFIG } from '../config/token';

interface ContractAddressBadgeProps {
  variant?: 'hero' | 'footer';
}

const RobinhoodChainIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <img 
    src="/assets/chains/rh.svg" 
    alt="Robinhood" 
    width={size} 
    height={size} 
    style={{ display: 'block', borderRadius: '4px' }} 
  />
);

export const ContractAddressBadge: React.FC<ContractAddressBadgeProps> = ({ variant = 'hero' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(TOKEN_CONFIG.address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback if clipboard API fails
      const textarea = document.createElement('textarea');
      textarea.value = TOKEN_CONFIG.address;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const truncatedAddress = 
    TOKEN_CONFIG.address.length > 16 
      ? `${TOKEN_CONFIG.address.slice(0, 6)}...${TOKEN_CONFIG.address.slice(-4)}`
      : TOKEN_CONFIG.address;

  if (variant === 'footer') {
    return (
      <div className="footer-ca-wrap">
        <div className="footer-ca-badge">
          <div className="footer-ca-chain-wrap">
            <div className="footer-ca-chain-logo">
              <RobinhoodChainIcon size={14} />
            </div>
            <div className="ca-floating-tooltip ca-tooltip-bottom">
              <span className="ca-tooltip-label">Network</span>
              <span className="ca-tooltip-value">Robinhood</span>
              <div className="ca-tooltip-arrow-top"></div>
            </div>
          </div>

          <span className="footer-ca-label">CA:</span>
          
          <div className="footer-ca-code-wrap">
            <code className="footer-ca-code">{TOKEN_CONFIG.address}</code>
            <div className="ca-floating-tooltip ca-tooltip-top">
              <span className="ca-tooltip-label">Verified Smart Contract</span>
              <span className="ca-tooltip-address">{TOKEN_CONFIG.address}</span>
              <div className="ca-tooltip-arrow-bottom"></div>
            </div>
          </div>

          <button 
            type="button"
            className={`footer-ca-copy ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
            aria-label="Copy official contract address"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-ca-wrap">
      <div className="hero-ca-card">
        {/* Chain Logo with Tooltip */}
        <div className="hero-ca-tag-wrap">
          <div className="hero-ca-tag">
            <RobinhoodChainIcon size={16} />
          </div>
          <div className="ca-floating-tooltip ca-tooltip-top">
            <span className="ca-tooltip-label">Network</span>
            <span className="ca-tooltip-value">Robinhood</span>
            <div className="ca-tooltip-arrow-bottom"></div>
          </div>
        </div>

        <span className="hero-ca-divider"></span>

        {/* Contract Address Display with Floating Rich Tooltip */}
        <div className="hero-ca-info-wrap">
          <div className="hero-ca-info">
            <span className="hero-ca-label">CA</span>
            <code className="hero-ca-address">{truncatedAddress}</code>
          </div>

          {/* Premium Floating Tooltip */}
          <div className="ca-floating-tooltip ca-tooltip-top" role="tooltip">
            <div className="ca-tooltip-header">
              <span className="ca-tooltip-badge">OFFICIAL CA</span>
              <span className="ca-tooltip-network">Robinhood</span>
            </div>
            <code className="ca-tooltip-address">{TOKEN_CONFIG.address}</code>
            <span className="ca-tooltip-hint">{copied ? '✓ Copied to clipboard!' : 'Click copy button to copy'}</span>
            <div className="ca-tooltip-arrow-bottom"></div>
          </div>
        </div>

        {/* Copy Button */}
        <button 
          type="button"
          onClick={handleCopy} 
          className={`hero-ca-btn-copy ${copied ? 'copied' : ''}`}
          aria-label="Copy official contract address"
        >
          {copied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Copied</span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
