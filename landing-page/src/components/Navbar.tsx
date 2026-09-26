import React, { useState } from 'react';

interface NavbarProps {
  currentView: 'home' | 'whitepaper';
  onNavigate: (view: 'home' | 'whitepaper', hash?: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavClick = (view: 'home' | 'whitepaper', hash?: string) => {
    setMobileOpen(false);
    onNavigate(view, hash);
  };

  return (
    <header className="header">
      <div className="header-container">
        <div className="brand" onClick={() => handleNavClick('home')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon">
            <img src="/assets/logo-dark.png" alt="Plurivex" />
          </div>
          <div className="brand-text">
            <b className="brand-title">PLURIVEX</b>
            <span className="brand-sub">SECURITY VAULT</span>
          </div>
        </div>

        <ul className="nav-links">
          {currentView === 'home' ? (
            <>
              <li><a href="#features" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#features'); }}>Features</a></li>
              <li><a href="#architecture" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#architecture'); }}>Architecture</a></li>
              <li><a href="#security" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#security'); }}>Security</a></li>
              <li>
                <a href="#whitepaper" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper'); }}>
                  Whitepaper
                  <span className="nav-tag-live"><span className="nav-dot"></span>Read Online</span>
                </a>
              </li>
              <li><a href="#download" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#download'); }}>Download</a></li>
              <li><a href="#faq" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#faq'); }}>FAQ</a></li>
            </>
          ) : (
            <>
              <li><a href="/" onClick={(e) => { e.preventDefault(); handleNavClick('home'); }}>← Back to Portal</a></li>
              <li><a href="#abstract" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#abstract'); }}>Abstract</a></li>
              <li><a href="#chapter-1" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-1'); }}>Foundations</a></li>
              <li><a href="#chapter-5" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-5'); }}>Execution</a></li>
              <li><a href="#chapter-12" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-12'); }}>Security</a></li>
              <li><a href="#chapter-16" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-16'); }}>Economics</a></li>
              <li><a href="#chapter-22" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-22'); }}>Verification</a></li>
            </>
          )}
        </ul>

        <div className="nav-actions">
          <a 
            href="https://x.com/Plurivex" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="nav-x-link"
            aria-label="Follow Plurivex on X"
            title="Follow Plurivex on X"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <a 
            href="https://discord.gg/hxG2TJUnW" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="nav-x-link"
            aria-label="Join Plurivex Discord Community"
            title="Join Discord Community"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </a>
        </div>

        <button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className={`mobile-nav-drawer ${mobileOpen ? 'open' : ''}`}>
        <ul>
          {currentView === 'home' ? (
            <>
              <li><a href="#features" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#features'); }}>Features</a></li>
              <li><a href="#architecture" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#architecture'); }}>Architecture</a></li>
              <li><a href="#security" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#security'); }}>Security</a></li>
              <li><a href="#whitepaper" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper'); }}>Whitepaper (Read Online)</a></li>
              <li><a href="#download" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#download'); }}>Download</a></li>
              <li><a href="#faq" onClick={(e) => { e.preventDefault(); handleNavClick('home', '#faq'); }}>FAQ</a></li>
              <li><a href="https://x.com/Plurivex" target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)}>Follow on X (@Plurivex)</a></li>
              <li><a href="https://discord.gg/hxG2TJUnW" target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)}>Discord Community</a></li>
            </>
          ) : (
            <>
              <li><a href="/" onClick={(e) => { e.preventDefault(); handleNavClick('home'); }}>← Back to Portal Home</a></li>
              <li><a href="#abstract" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#abstract'); }}>Abstract &amp; Scope</a></li>
              <li><a href="#chapter-1" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-1'); }}>Part I: Foundations (Ch 1–4)</a></li>
              <li><a href="#chapter-5" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-5'); }}>Part II: Execution Architecture (Ch 5–11)</a></li>
              <li><a href="#chapter-12" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-12'); }}>Part III: Security &amp; Systems (Ch 12–14)</a></li>
              <li><a href="#chapter-15" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-15'); }}>Part IV: Policies &amp; Automation (Ch 15)</a></li>
              <li><a href="#chapter-16" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-16'); }}>Part V: Market &amp; Economics (Ch 16–21)</a></li>
              <li><a href="#chapter-22" onClick={(e) => { e.preventDefault(); handleNavClick('whitepaper', '#chapter-22'); }}>Part VI: Principles &amp; Verification (Ch 22–25)</a></li>
            </>
          )}
        </ul>
      </div>
    </header>
  );
};
