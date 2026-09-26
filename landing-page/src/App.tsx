import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { MockupShowcase } from './components/MockupShowcase';
import { Features } from './components/Features';
import { Architecture } from './components/Architecture';
import { WhitepaperReader } from './components/WhitepaperReader';
import { DownloadCenter } from './components/DownloadCenter';
import { FAQ } from './components/FAQ';
import { Footer } from './components/Footer';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'home' | 'whitepaper'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.startsWith('#whitepaper') || hash.startsWith('#chapter') || hash === '#abstract' || hash === '#appendices') {
        return 'whitepaper';
      }
    }
    return 'home';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#whitepaper') || hash.startsWith('#chapter') || hash === '#abstract' || hash === '#appendices') {
        setCurrentView('whitepaper');
        window.scrollTo(0, 0);
        if (hash.startsWith('#chapter') || hash === '#abstract' || hash === '#appendices') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('wp-scroll-to', { detail: hash.replace('#', '') }));
          }, 100);
        }
      } else {
        setCurrentView('home');
        if (hash === '#' || hash === '#portal') {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (currentView === 'whitepaper') {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      window.scrollTo(0, 0);
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [currentView]);

  const navigateTo = (view: 'home' | 'whitepaper', hash?: string) => {
    setCurrentView(view);

    if (view === 'whitepaper') {
      const targetHash = hash || '#whitepaper';
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
      window.scrollTo(0, 0);
      if (hash && (hash.startsWith('#chapter') || hash === '#abstract' || hash === '#appendices')) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('wp-scroll-to', { detail: hash.replace('#', '') }));
        }, 100);
      }
    } else {
      if (hash && hash !== '#' && hash !== '#portal') {
        if (window.location.hash !== hash) {
          window.history.pushState(null, '', hash);
        }
        setTimeout(() => {
          const el = document.querySelector(hash);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 60);
      } else {
        if (window.location.hash) {
          window.history.pushState(null, '', window.location.pathname + window.location.search);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <div className={`app-container ${currentView === 'whitepaper' ? 'reader-mode' : ''}`}>
      <Navbar currentView={currentView} onNavigate={navigateTo} />

      {currentView === 'home' ? (
        <>
          <Hero onOpenWhitepaper={() => navigateTo('whitepaper')} />
          <MockupShowcase />
          <Features />
          <Architecture />
          
          {/* Whitepaper Preview Callout Banner */}
          <section className="section" id="whitepaper-preview">
            <div className="container">
              <div className="whitepaper-preview-box">
                <div>
                  <span className="section-tag">Read Online · No Download Required</span>
                  <h2 className="whitepaper-preview-title">Technical Whitepaper</h2>
                  <p className="whitepaper-preview-desc">
                    Explore our cryptographic design, combinatorial recovery mathematics, and multi chain signing specifications directly in your browser. Complete with an interactive Table of Contents and deep technical breakdowns.
                  </p>
                  <div className="whitepaper-preview-cta">
                    <button onClick={() => navigateTo('whitepaper')} className="btn btn-primary">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
                      </svg>
                      <span>Read Whitepaper</span>
                    </button>
                  </div>
                </div>

                <div>
                  <ul className="whitepaper-chapters">
                    <li className="chapter-item" style={{ cursor: 'pointer' }} onClick={() => navigateTo('whitepaper', '#chapter-1')}>
                      <span className="chapter-num">CH 01</span>
                      <span className="chapter-title">Introduction</span>
                    </li>
                    <li className="chapter-item" style={{ cursor: 'pointer' }} onClick={() => navigateTo('whitepaper', '#chapter-2')}>
                      <span className="chapter-num">CH 02</span>
                      <span className="chapter-title">The Problem & Thesis</span>
                    </li>
                    <li className="chapter-item" style={{ cursor: 'pointer' }} onClick={() => navigateTo('whitepaper', '#chapter-3')}>
                      <span className="chapter-num">CH 03</span>
                      <span className="chapter-title">The Multi-Wallet Scale Problem</span>
                    </li>
                    <li className="chapter-item" style={{ cursor: 'pointer' }} onClick={() => navigateTo('whitepaper', '#chapter-5')}>
                      <span className="chapter-num">CH 05</span>
                      <span className="chapter-title">The Execution Lifecycle</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <DownloadCenter />
          <FAQ />
          <Footer onOpenWhitepaper={() => navigateTo('whitepaper')} />
        </>
      ) : (
        <WhitepaperReader />
      )}
    </div>
  );
};

export default App;
