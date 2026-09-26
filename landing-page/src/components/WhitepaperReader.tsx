import React, { useEffect, useState, useMemo, useRef } from 'react';

const TOC_GROUPS = [
  {
    partTitle: 'Preamble: Executive Summary',
    items: [
      { id: 'abstract', title: 'Abstract & Scope', badge: 'spec' },
    ]
  },
  {
    partTitle: 'Part I: Foundations',
    items: [
      { id: 'chapter-1', title: '1. Introduction', badge: 'spec' },
      { id: 'chapter-2', title: '2. The Problem & Thesis', badge: 'spec' },
      { id: 'chapter-3', title: '3. The Multi-Wallet Problem', badge: 'spec' },
      { id: 'chapter-4', title: '4. What Is Plurivex?', badge: 'spec' },
    ]
  },
  {
    partTitle: 'Part II: Execution Architecture',
    items: [
      { id: 'chapter-5', title: '5. Execution Lifecycle', badge: 'spec' },
      { id: 'chapter-6', title: '6. Multi-Wallet Execution', badge: 'spec' },
      { id: 'chapter-7', title: '7. Execution Atomicity', badge: 'spec' },
      { id: 'chapter-8', title: '8. Multi-Chain Execution', badge: 'spec' },
      { id: 'chapter-9', title: '9. Phrasser — Transaction Parsing', badge: 'roadmap' },
      { id: 'chapter-10', title: '10. Sweeper — Asset Sweeping', badge: 'live' },
      { id: 'chapter-11', title: '11. DEX Batch Execution', badge: 'roadmap' },
    ]
  },
  {
    partTitle: 'Part III: Security & Systems',
    items: [
      { id: 'chapter-12', title: '12. Security Architecture', badge: 'live' },
      { id: 'chapter-13', title: '13. Local-First Philosophy', badge: 'live' },
      { id: 'chapter-14', title: '14. System Architecture', badge: 'live' },
    ]
  },
  {
    partTitle: 'Part IV: Policies & Automation',
    items: [
      { id: 'chapter-15', title: '15. Execution Policies & Automation', badge: 'roadmap' },
    ]
  },
  {
    partTitle: 'Part V: Market & Economics',
    items: [
      { id: 'chapter-16', title: '16. Competitive Landscape', badge: 'spec' },
      { id: 'chapter-17', title: '17. Product Development Status', badge: 'spec' },
      { id: 'chapter-18', title: '18. Protocol Economics', badge: 'roadmap' },
      { id: 'chapter-19', title: '19. $PLUR Utility', badge: 'roadmap' },
      { id: 'chapter-20', title: '20. Core Stewardship & Governance', badge: 'spec' },
      { id: 'chapter-21', title: '21. Four-Phase Roadmap', badge: 'roadmap' },
    ]
  },
  {
    partTitle: 'Part VI: Principles & Conclusion',
    items: [
      { id: 'chapter-22', title: '22. Security Principles', badge: 'spec' },
      { id: 'chapter-23', title: '23. Risk Considerations', badge: 'spec' },
      { id: 'chapter-24', title: '24. Security Verification & Audits', badge: 'spec' },
      { id: 'chapter-25', title: '25. The Future of Execution & AI', badge: 'future' },
      { id: 'appendices', title: 'Appendices A–C', badge: 'spec' },
    ]
  }
];

const findSheetForSection = (sectionId: string): number => {
  for (let i = 0; i < TOC_GROUPS.length; i++) {
    if (TOC_GROUPS[i].items.some(item => item.id === sectionId)) {
      return i;
    }
  }
  return 0;
};

export const WhitepaperReader: React.FC = () => {
  const tocGroups = TOC_GROUPS;

  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== 'whitepaper') {
        return findSheetForSection(hash);
      }
    }
    return 0;
  });
  const [animatingFrom, setAnimatingFrom] = useState<number | null>(null);
  const [isSliding, setIsSliding] = useState<boolean>(false);
  const isSlidingRef = useRef<boolean>(false);
  const slidingTimerRef = useRef<number | null>(null);
  const [activeChapter, setActiveChapter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== 'whitepaper') {
        return hash;
      }
    }
    return 'abstract';
  });
  const activeChapterRef = useRef<string>(activeChapter);
  activeChapterRef.current = activeChapter;
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticTimerRef = useRef<number | null>(null);
  const readingBarRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 768;
    }
    return true;
  });
  const canvasRef = useRef<HTMLDivElement>(null);

  const triggerToast = (msg: string) => {
    setCopiedToast(msg);
    setTimeout(() => {
      setCopiedToast(null);
    }, 2500);
  };

  const getSlideClass = (index: number) => {
    if (index === activeSheetIndex && !isSliding) return 'slide-active';
    if (isSliding) {
      const from = animatingFrom ?? activeSheetIndex;
      const min = Math.min(from, activeSheetIndex);
      const max = Math.max(from, activeSheetIndex);
      if (index >= min && index <= max) return 'slide-sliding';
    }
    return 'slide-dormant';
  };

  const goToSheet = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= tocGroups.length) return;
    if (targetIndex === activeSheetIndex) {
      if (canvasRef.current) {
        canvasRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    if (slidingTimerRef.current) {
      window.clearTimeout(slidingTimerRef.current);
    }

    isSlidingRef.current = true;
    setAnimatingFrom(activeSheetIndex);
    setIsSliding(true);
    setActiveSheetIndex(targetIndex);

    const firstChapter = tocGroups[targetIndex].items[0].id;
    setActiveChapter(firstChapter);
    activeChapterRef.current = firstChapter;

    // Instant top reset so target sheet starts cleanly at top without competing vertical animation
    if (canvasRef.current) {
      canvasRef.current.scrollTop = 0;
    }
    if (readingBarRef.current) {
      readingBarRef.current.style.width = '0%';
    }

    slidingTimerRef.current = window.setTimeout(() => {
      isSlidingRef.current = false;
      setIsSliding(false);
      setAnimatingFrom(null);
    }, 450);
  };

  const scrollToSection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
    const targetSheet = findSheetForSection(id);
    const isDifferentSheet = targetSheet !== activeSheetIndex;

    if (isDifferentSheet) {
      // 1. Change sheet via smooth horizontal slide track
      goToSheet(targetSheet);
      setActiveChapter(id);
      activeChapterRef.current = id;

      const firstSectionOfTargetSheet = tocGroups[targetSheet].items[0].id;
      // If user clicked a sub-chapter on that target sheet, glide smoothly to it after slide completes
      if (id !== firstSectionOfTargetSheet) {
        if (programmaticTimerRef.current) {
          window.clearTimeout(programmaticTimerRef.current);
        }
        isProgrammaticScrollRef.current = true;

        programmaticTimerRef.current = window.setTimeout(() => {
          const canvas = canvasRef.current;
          if (!canvas) {
            isProgrammaticScrollRef.current = false;
            return;
          }
          const targetEl = canvas.querySelector(`#${id}`) as HTMLElement;
          if (targetEl) {
            const targetRect = targetEl.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            const relativeTop = targetRect.top - canvasRect.top + canvas.scrollTop;
            canvas.scrollTo({
              top: Math.max(0, relativeTop - 20),
              behavior: 'smooth'
            });
          }
          window.setTimeout(() => {
            isProgrammaticScrollRef.current = false;
          }, 450);
        }, 460);
      }
    } else {
      // Same sheet: smooth scroll directly to the section without any bounce or fighting
      const canvas = canvasRef.current;
      if (!canvas) return;
      const targetEl = canvas.querySelector(`#${id}`) as HTMLElement;
      if (targetEl) {
        if (programmaticTimerRef.current) {
          window.clearTimeout(programmaticTimerRef.current);
        }
        isProgrammaticScrollRef.current = true;
        setActiveChapter(id);
        activeChapterRef.current = id;

        const targetRect = targetEl.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const relativeTop = targetRect.top - canvasRect.top + canvas.scrollTop;
        canvas.scrollTo({
          top: Math.max(0, relativeTop - 20),
          behavior: 'smooth'
        });

        programmaticTimerRef.current = window.setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 450);
      }
    }
  };

  // Keyboard navigation: Left/Right arrows flip sheets
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (activeSheetIndex < tocGroups.length - 1) {
          goToSheet(activeSheetIndex + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (activeSheetIndex > 0) {
          goToSheet(activeSheetIndex - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSheetIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleScroll = () => {
      if (isSlidingRef.current || isProgrammaticScrollRef.current) return;

      const totalScroll = canvas.scrollTop;
      const maxScroll = canvas.scrollHeight - canvas.clientHeight;
      const scroll = maxScroll > 0 ? totalScroll / maxScroll : 0;
      if (readingBarRef.current) {
        readingBarRef.current.style.width = `${Math.min(100, Math.max(0, scroll * 100))}%`;
      }

      // Only evaluate sections belonging to the active sheet
      const activeSheetWrapper = canvas.querySelectorAll('.wp-sheet-slide-wrapper')[activeSheetIndex];
      if (!activeSheetWrapper) return;

      const sections = activeSheetWrapper.querySelectorAll('.wp-paper-section');
      let currentActive = activeChapterRef.current;

      const canvasRect = canvas.getBoundingClientRect();
      sections.forEach((section) => {
        const secRect = section.getBoundingClientRect();
        if (secRect.top - canvasRect.top <= 140) {
          currentActive = section.getAttribute('id') || currentActive;
        }
      });

      if (currentActive !== activeChapterRef.current) {
        activeChapterRef.current = currentActive;
        setActiveChapter(currentActive);
      }
    };

    canvas.addEventListener('scroll', handleScroll, { passive: true });

    // Handle custom event from external navigation
    const handleCustomScroll = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const id = customEvent.detail;
      if (!id) return;
      const targetSheet = findSheetForSection(id);
      const isDifferentSheet = targetSheet !== activeSheetIndex;

      if (isDifferentSheet) {
        goToSheet(targetSheet);
        setActiveChapter(id);
        activeChapterRef.current = id;

        const firstSectionOfTargetSheet = tocGroups[targetSheet].items[0].id;
        if (id !== firstSectionOfTargetSheet) {
          if (programmaticTimerRef.current) {
            window.clearTimeout(programmaticTimerRef.current);
          }
          isProgrammaticScrollRef.current = true;

          programmaticTimerRef.current = window.setTimeout(() => {
            const canvas = canvasRef.current;
            if (!canvas) {
              isProgrammaticScrollRef.current = false;
              return;
            }
            const targetEl = canvas.querySelector(`#${id}`) as HTMLElement;
            if (targetEl) {
              const targetRect = targetEl.getBoundingClientRect();
              const canvasRect = canvas.getBoundingClientRect();
              const relativeTop = targetRect.top - canvasRect.top + canvas.scrollTop;
              canvas.scrollTo({
                top: Math.max(0, relativeTop - 20),
                behavior: 'smooth'
              });
            }
            window.setTimeout(() => {
              isProgrammaticScrollRef.current = false;
            }, 450);
          }, 460);
        }
      } else {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const targetEl = canvas.querySelector(`#${id}`) as HTMLElement;
        if (targetEl) {
          if (programmaticTimerRef.current) {
            window.clearTimeout(programmaticTimerRef.current);
          }
          isProgrammaticScrollRef.current = true;
          setActiveChapter(id);
          activeChapterRef.current = id;

          const targetRect = targetEl.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          const relativeTop = targetRect.top - canvasRect.top + canvas.scrollTop;
          canvas.scrollTo({
            top: Math.max(0, relativeTop - 20),
            behavior: 'smooth'
          });

          programmaticTimerRef.current = window.setTimeout(() => {
            isProgrammaticScrollRef.current = false;
          }, 450);
        }
      }
    };

    window.addEventListener('wp-scroll-to', handleCustomScroll);

    return () => {
      canvas.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wp-scroll-to', handleCustomScroll);
      if (slidingTimerRef.current) window.clearTimeout(slidingTimerRef.current);
      if (programmaticTimerRef.current) window.clearTimeout(programmaticTimerRef.current);
    };
  }, [activeSheetIndex]);

  // Handle initial hash navigation strictly once on initial mount
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash !== 'whitepaper') {
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const targetEl = canvas.querySelector(`#${hash}`) as HTMLElement;
        if (targetEl) {
          const targetRect = targetEl.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          const relativeTop = targetRect.top - canvasRect.top + canvas.scrollTop;
          canvas.scrollTo({
            top: Math.max(0, relativeTop - 24),
            behavior: 'instant'
          });
        }
      }, 60);
    }
  }, []);

  const filteredGroups = useMemo(() => {
    if (!searchTerm) return tocGroups;
    const lowerSearch = searchTerm.toLowerCase();
    
    return tocGroups.map(group => {
      const filteredItems = group.items.filter(item => 
        item.title.toLowerCase().includes(lowerSearch)
      );
      return { ...group, items: filteredItems };
    }).filter(group => group.items.length > 0);
  }, [searchTerm, tocGroups]);

  return (
    <div className="wp-reader-shell">
      {/* 1. Global Reading Progress Indicator */}
      <div className="wp-reading-bar" ref={readingBarRef} style={{ width: '0%' }}></div>

      {/* 2. WPS Office / Academic PDF Top Ribbon Toolbar */}
      <div className="wp-reader-toolbar">
        <div className="wp-toolbar-left">
          <button 
            className="btn-toolbar-tool"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Outline Sidebar"
            style={{ padding: '5px 8px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            <span style={{ fontSize: '11px' }}>Outline</span>
          </button>
          <span className="wp-doc-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            PDF SPEC
          </span>
          <div className="wp-doc-title-tag">
            <b>Plurivex_Specification.pdf</b>
            <span className="sep">/</span>
            <span className="ver">v1.0 Specification</span>
          </div>
        </div>

        {/* Center: Page Stepper (Option 1) */}
        <div className="wp-toolbar-center">
          <div className="wp-sheet-stepper">
            <button 
              className="btn-sheet-step" 
              disabled={activeSheetIndex === 0}
              onClick={() => goToSheet(activeSheetIndex - 1)}
              title="Previous Sheet (ArrowLeft)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              <span>Prev</span>
            </button>

            <div className="wp-sheet-counter">
              <span className="wp-sheet-badge">Sheet {activeSheetIndex + 1}/{tocGroups.length}</span>
              <span className="wp-sheet-title">{tocGroups[activeSheetIndex].partTitle}</span>
            </div>

            <button 
              className="btn-sheet-step" 
              disabled={activeSheetIndex === tocGroups.length - 1}
              onClick={() => goToSheet(activeSheetIndex + 1)}
              title="Next Sheet (ArrowRight)"
            >
              <span>Next</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        <div className="wp-toolbar-right">
          <button className="btn-toolbar-tool" onClick={() => triggerToast('Link copied to clipboard')} title="Copy share link">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            <span>Share</span>
          </button>
          <button className="btn-toolbar-tool" onClick={() => triggerToast('BibTeX reference copied')} title="Cite BibTeX">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
            <span>Cite</span>
          </button>
          <button className="btn-toolbar-tool primary" onClick={() => window.print()} title="Print or Save PDF">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* 3. Workstation: Left Outline Drawer + Central Paper Canvas */}
      <div className="wp-reader-workstation">
        {/* Left Document Outline Drawer */}
        <aside className={`wp-outline-drawer ${sidebarOpen ? 'open' : 'closed'} ${sidebarOpen ? 'mobile-open' : ''}`}>
          <div className="wp-outline-header">
            <div className="wp-outline-title">
              <span>Document Outline</span>
              <span>{tocGroups.length} Sheets · 25 Ch</span>
            </div>
            <div className="wp-outline-search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input 
                type="text" 
                placeholder="Filter outline..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>

          {filteredGroups.map((group) => {
            const originalIndex = tocGroups.findIndex(g => g.partTitle === group.partTitle);
            const isCurrentPart = originalIndex === activeSheetIndex;
            return (
              <div className={`wp-outline-group ${isCurrentPart ? 'active-sheet' : ''}`} key={originalIndex}>
                <div 
                  className="wp-outline-part-title"
                  onClick={() => goToSheet(originalIndex)}
                  style={{ cursor: 'pointer' }}
                  title="Jump to this sheet"
                >
                  <span>{group.partTitle}</span>
                </div>
                <ul className="wp-outline-list">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <a 
                        href={`#${item.id}`} 
                        onClick={(e) => scrollToSection(e, item.id)}
                        className={`wp-outline-link ${activeChapter === item.id ? 'active' : ''}`}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </span>
                        <span className={`wp-outline-tag ${item.badge}`}>
                          {item.badge === 'live' ? 'LIVE' : item.badge === 'roadmap' ? 'DEV' : item.badge === 'future' ? 'FUT' : 'SPEC'}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </aside>

        {/* Mobile Backdrop Overlay */}
        {sidebarOpen && (
          <div 
            className="wp-drawer-backdrop" 
            onClick={() => setSidebarOpen(false)} 
          />
        )}

        {/* Central Paper Canvas (The Virtual Desk) */}
        <div className="wp-canvas-container">
          <main className="wp-reader-canvas" ref={canvasRef}>
            <div className="wp-sheets-viewport">
              <div 
                className="wp-sheets-track"
                style={{
                  transform: `translateX(-${activeSheetIndex * 100}%)`,
                  transition: isSliding ? 'transform 0.44s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none',
                }}
              >
                {/* =========================================================================
                    SHEET 1: DOCUMENT PREAMBLE & EXECUTIVE SUMMARY (Abstract & Scope)
                    ========================================================================= */}
                <div className={`wp-sheet-slide-wrapper ${getSlideClass(0)}`}>
                  <article className="wp-paper-sheet">
                {/* Running Academic Header */}
                <div className="wp-paper-running-head">
                  <span>PLURIVEX ARCHITECTURAL &amp; CRYPTOGRAPHIC SPECIFICATION</span>
                  <span>SHEET 1 OF 7 · DOCUMENT PREAMBLE</span>
                </div>

                {/* Paper Cover / Academic Header */}
                <header className="wp-paper-cover">
                  <div className="wp-paper-classification">
                    RESEARCH SPECIFICATION · OPEN-SOURCE PROTOCOL ARCHITECTURE
                  </div>
                  <h1 className="wp-paper-main-title">
                    Plurivex: The Onchain Execution Layer
                  </h1>
                  <div className="wp-paper-subtitle">
                    A Formal Protocol Specification for Client Side Pre Flight Simulation, Cryptographic MEV Shielding, Parallel Multi Wallet Orchestration, and Forensic Seed Recovery
                  </div>

                  <div className="wp-paper-byline">
                    <div>
                      <div className="wp-byline-lead">Plurivex Protocol Engineering &amp; Research Group</div>
                      <div className="wp-byline-sub">Cryptographic Core Systems Division</div>
                    </div>
                    <div>
                      <div><span className="wp-byline-label">Status:</span> Living Document · Synced with Codebase</div>
                      <div><span className="wp-byline-label">Test Coverage:</span> 72/72 Rust Unit Tests Passing · 0 npm Vulns</div>
                    </div>
                  </div>

                  {/* Academic Abstract */}
                  <div className="wp-paper-abstract-box">
                    <div className="wp-paper-abstract-title">ABSTRACT</div>
                    <p className="wp-paper-abstract-text">
                      Blockchain infrastructure has evolved rapidly, but onchain execution remains fragmented. A single transaction may require users to interact with multiple wallets, RPC providers, simulation tools, MEV protection systems, private execution infrastructure, transaction monitors, and recovery mechanisms. Plurivex is an onchain execution infrastructure protocol designed to orchestrate the full lifecycle of blockchain transactions across multiple wallets and networks. Instead of treating a transaction as a single action, Plurivex treats execution as a lifecycle:
                    </p>
                    <div className="wp-paper-code-box" style={{ textAlign: 'center', fontWeight: 700, color: '#10B981', margin: '10px 0' }}>
                      INTENT → SIMULATE → PROTECT → EXECUTE → VERIFY → RECOVER.
                    </div>
                    <p className="wp-paper-abstract-text">
                      The protocol combines simulation, execution protection, private submission, multi-wallet orchestration, monitoring, automated retry, and recovery into a unified execution layer.
                    </p>
                    <div className="wp-paper-keywords">
                      <b>Index Terms</b> &nbsp;Multi-Wallet Parallelism, Client Side Pre Flight Simulation, Memory Zeroization, Argon2id KDF, MEV Shielding, BIP-39 Forensic Combinatorial Solver, Air Gapped Safe Mode.
                    </div>
                  </div>

                  {/* Formal Metadata Grid */}
                  <div className="wp-paper-meta-grid">
                    <div className="wp-paper-meta-cell"><b>Document ID</b><span>PLUR-WP-2026.01</span></div>
                    <div className="wp-paper-meta-cell"><b>Classification</b><span>Execution Layer Infrastructure</span></div>
                    <div className="wp-paper-meta-cell"><b>Core Engine</b><span>Rust 2021 · Zero-Cloud Native</span></div>
                    <div className="wp-paper-meta-cell"><b>Verification</b><span>Formal Codebase Verification · 0 Vulns</span></div>
                    <div className="wp-paper-meta-cell"><b>License</b><span>MIT / Open Execution Standard</span></div>
                    <div className="wp-paper-meta-cell"><b>Target Platforms</b><span>EVM · Solana · Bitcoin SegWit</span></div>
                  </div>

                  {/* Formal Legend Bar */}
                  <div className="wp-paper-legend-bar">
                    <span className="wp-paper-legend-title">FEATURE STATUS:</span>
                    <span className="wp-status-pill live">✓ LIVE IN CORE</span>
                    <span className="wp-status-pill spec">📋 SPECIFICATION</span>
                    <span className="wp-status-pill roadmap">⏳ IN DEV · ACTIVE SPRINT</span>
                    <span className="wp-status-pill future">📅 FUTURE ROADMAP</span>
                    <span className="wp-legend-repo-hash">
                      SPECIFICATION v1.0 · REPOSITORY SYNCHRONIZED
                    </span>
                  </div>
                </header>

                {/* Abstract Section */}
                <section className="wp-paper-section" id="abstract">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · EXECUTIVE SUMMARY</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">Executive Summary &amp; Protocol Scope</h2>
                  </div>
                  <p>
                    As distributed networks expand across Layer 1 and Layer 2 rollups, transaction execution has become the most vulnerable failure point for institutional and high volume crypto participants. Plurivex unifies isolated primitives into a deterministic client-side execution framework.
                  </p>
                  <p>
                    By shifting the architectural boundary from server-dependent RPC routing to client controlled, memory zeroized execution machines, the protocol guarantees that sensitive state, private credentials, and pre flight simulation payloads never leak into public mempools or untrusted third party servers.
                  </p>
                </section>

                {/* Running Academic Page Footer */}
                <footer className="wp-paper-running-footer">
                  <span>Plurivex Protocol · Specification v1.0</span>
                  <span>Zero-Cloud Air-Gapped Execution Boundary</span>
                  <span>Sheet 1 of 7</span>
                </footer>
              </article>
            </div>

            {/* =========================================================================
                SHEET 2: PART I — FOUNDATIONS (Chapters 1–4)
                ========================================================================= */}
            <div className={`wp-sheet-slide-wrapper ${getSlideClass(1)}`}>
              <article className="wp-paper-sheet">
                {/* Running Academic Header */}
                <div className="wp-paper-running-head">
                  <span>PLURIVEX ARCHITECTURAL &amp; CRYPTOGRAPHIC SPECIFICATION</span>
                  <span>SHEET 2 OF 7 · PART I: SEC 01–04</span>
                </div>

                {/* Part I: Foundations Sheet Heading */}
                <div className="wp-sheet-intro-header">
                  <h1 className="wp-paper-sheet-heading">Part I: Foundations</h1>
                  <div className="wp-paper-subtitle">Core Problem Taxonomy, Multi-Wallet Operational Complexities, and The Plurivex Thesis</div>
                </div>

                {/* Chapter 1 */}
                <section className="wp-paper-section" id="chapter-1">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Foundational</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">1. Introduction</h2>
                  </div>
                  <p>Blockchains have become increasingly capable. Yet the execution experience has not evolved at the same pace. A typical workflow may involve a wallet, transaction construction, simulation, RPC selection, MEV protection, private execution, submission, monitoring, retry, and recovery. The industry has built excellent primitives. What is missing is a unified layer that coordinates them. That is the problem Plurivex solves.</p>
                </section>

                {/* Chapter 2 */}
                <section className="wp-paper-section" id="chapter-2">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Problem Taxonomy &amp; Thesis</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">2. The Problem &amp; Architectural Thesis</h2>
                  </div>
                  <p>Onchain execution is fragmented. Users must decide what to execute, whether a transaction will succeed, what it changes, whether it is exposed to MEV, which execution path to use, what happens on failure, whether to retry, and how to verify the result. Today these questions are handled by separate tools, creating a fragmented stack and increasing operational complexity.</p>
                  <p>Existing infrastructure solves isolated parts of execution. Plurivex coordinates the entire lifecycle into a deterministic client-side execution framework.</p>
                  <div className="wp-paper-callout">
                    <strong>CORE PROTOCOL THESIS:</strong> Every onchain execution should be treated as a comprehensive lifecycle, not a risky atomic transaction.
                  </div>
                </section>

                {/* Chapter 3 */}
                <section className="wp-paper-section" id="chapter-3">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Multi-Wallet Problem</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">3. The Multi-Wallet Problem</h2>
                  </div>
                  <p>Managing one wallet is simple. Managing dozens or hundreds across networks becomes infrastructure. Operators need sweeping, distribution, consolidation, batch swaps, balance monitoring, submission, recovery, and wallet specific policies. Plurivex treats multi wallet activity as an orchestration problem.</p>
                  
                  <div className="wp-paper-equation">
                    <code>d(w, c) = min(Insert, Delete, Substitute, Transpose) ≤ 2</code>
                    <span className="eq-number">(1)</span>
                  </div>
                  <div className="wp-equation-caption">
                    Equation 1: Damerau-Levenshtein Metric for BIP-39 Typo Search.
                  </div>

                  <div className="wp-paper-equation">
                    <code>Permutations(k=2) = 2,048 × 2,048 = 4,194,304 candidate seed vectors</code>
                    <span className="eq-number">(2)</span>
                  </div>
                  <div className="wp-equation-caption">
                    Equation 2: Two-Word Missing Seed State Space (Rayon Parallel Solver, solved &lt; 1.8s).
                  </div>
                </section>

                {/* Chapter 4 */}
                <section className="wp-paper-section" id="chapter-4">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Architectural Blueprint</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">4. What Is Plurivex?</h2>
                  </div>
                  <p>
                    Plurivex is an onchain execution infrastructure protocol that orchestrates the complete transaction lifecycle across multiple wallets and blockchain networks. The protocol establishes a sovereign coordination layer between high-level user intent and decentralized settlement.
                  </p>
                  <p>
                    It unifies encrypted local wallet storage, multi-chain scanning, mnemonic repair, asset sweeping, transaction diagnostics, and execution tooling into a single desktop architecture. Instead of relying on disconnected tools, Plurivex gives operators a structured framework to inspect, secure, and execute onchain operations.
                  </p>
                  <p>
                    The protocol follows a structured Client First to Protocol roadmap:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75, marginBottom: '16px' }}>
                    <li>
                      <b>Foundation Phase (Operational Today):</b> A zero cloud, native desktop application (Tauri v2 + Rust Core) offering air-gapped cryptographic key protection, local database storage, multi-threaded forensic mnemonic recovery, and multi wallet balance sweeping.
                    </li>
                    <li>
                      <b>Protocol Expansion (Roadmap Phases II–IV):</b> Progressive expansion into an onchain execution coordination protocol, introducing pre trade simulation, MEV shielded private relays, and a decentralized relayer network.
                    </li>
                  </ul>
                  <p><strong>Traditional Execution Flow:</strong></p>
                  <div className="wp-paper-code-box">User ──▶ Wallet ──▶ Transaction ──▶ Blockchain</div>
                  <p><strong>Plurivex Orchestrated Lifecycle Flow:</strong></p>
                  <div className="wp-paper-code-box plurivex-flow">User / Application ──▶ Execution Intent ──▶ Plurivex Orchestrator ──▶ Simulation ──▶ Protection ──▶ Execution ──▶ Monitoring ──▶ Verification ──▶ Recovery ──▶ Blockchain</div>
                </section>

                {/* Running Academic Page Footer */}
                <footer className="wp-paper-running-footer">
                  <span>Plurivex Protocol · Specification v1.0</span>
                  <span>Zero-Cloud Air-Gapped Execution Boundary</span>
                  <span>Sheet 2 of 7</span>
                </footer>
              </article>
            </div>
{/* =========================================================================
                SHEET 3: PART II — EXECUTION ARCHITECTURE (Chapters 5–11)
                ========================================================================= */}
            <div className={`wp-sheet-slide-wrapper ${getSlideClass(2)}`}>
              <article className="wp-paper-sheet">
                {/* Running Academic Header */}
                <div className="wp-paper-running-head">
                  <span>PLURIVEX PROTOCOL SPECIFICATION · EXECUTION ARCHITECTURE</span>
                  <span>SHEET 3 OF 7 · PART II: SEC 05–11</span>
                </div>

                <div className="wp-sheet-intro-header">
                  <h1 className="wp-paper-sheet-heading">Part II: Execution Architecture</h1>
                  <div className="wp-paper-subtitle">Formal Mechanics for Pre Flight Simulation, Mempool MEV Shielding, and Multi Wallet Orchestration</div>
                </div>

                {/* Chapter 5 */}
                <section className="wp-paper-section" id="chapter-5">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Lifecycle Specification</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">5. Execution Lifecycle &amp; Orchestration</h2>
                  </div>
                  <p>The core Plurivex execution lifecycle consists of six formal operational stages coordinating user intent into confirmed settlement.</p>
                  
                  {/* Formal Academic Figure 1: Pipeline */}
                  <div className="wp-paper-figure">
                    <div className="wp-pipeline-diagram">
                      <div className="wp-pipeline-node">
                        <div className="wp-pipeline-node-num">STAGE 01</div>
                        <div className="wp-pipeline-node-title">INTENT</div>
                        <div className="wp-pipeline-node-desc">User specifies outcome across multiple wallets</div>
                      </div>
                      <div className="wp-pipeline-node">
                        <div className="wp-pipeline-node-num">STAGE 02</div>
                        <div className="wp-pipeline-node-title">SIMULATE</div>
                        <div className="wp-pipeline-node-desc">Pre-execution state change validation</div>
                      </div>
                      <div className="wp-pipeline-node">
                        <div className="wp-pipeline-node-num">STAGE 03</div>
                        <div className="wp-pipeline-node-title">PROTECT</div>
                        <div className="wp-pipeline-node-desc">MEV defense &amp; private submission</div>
                      </div>
                      <div className="wp-pipeline-node">
                        <div className="wp-pipeline-node-num">STAGE 04</div>
                        <div className="wp-pipeline-node-title">EXECUTE</div>
                        <div className="wp-pipeline-node-desc">Multi-wallet parallel dispatch</div>
                      </div>
                      <div className="wp-pipeline-node">
                        <div className="wp-pipeline-node-num">STAGE 05</div>
                        <div className="wp-pipeline-node-title">VERIFY</div>
                        <div className="wp-pipeline-node-desc">Onchain outcome confirmation</div>
                      </div>
                      <div className="wp-pipeline-node">
                        <div className="wp-pipeline-node-num">STAGE 06</div>
                        <div className="wp-pipeline-node-title">RECOVER</div>
                        <div className="wp-pipeline-node-desc">Fallback &amp; cryptographic key repair</div>
                      </div>
                    </div>
                    <div className="wp-figure-caption">
                      <b>Figure 1:</b> The End-to-End Plurivex Onchain Execution Lifecycle Pipeline.
                    </div>
                  </div>

                  <h3>5.1 Intent</h3>
                  <p>Users and applications define what they want to achieve rather than raw transactions. Examples: "sweep dust across 50 wallets," "execute 20 token swaps with &lt; 1% slippage," "rebalance portfolio across chains."</p>

                  <h3>5.2 Simulate</h3>
                  <p>Before any transaction touches the mempool, Plurivex simulates execution locally. Simulation answers: Will it revert? What will state look like? What are gas costs? What tokens change hands?</p>

                  <h3>5.3 Protect</h3>
                  <p>Execution is exposed to value extraction (frontrunning, sandwich attacks, reordering). Plurivex applies protection private submission, MEV aware routing, execution timing, slippage defense.</p>

                  <h3>5.4 Execute</h3>
                  <p>Protected transactions are dispatched according to defined policy: single, parallel, batched, conditional, multi-wallet.</p>

                  <h3>5.5 Verify</h3>
                  <p>After submission, Plurivex monitors and confirms execution: Did the tx confirm? Did it produce the expected state? Was slippage within bounds?</p>

                  <h3>5.6 Recover: The Dual Pillar Recovery Model</h3>
                  <p>
                    Execution failure and credential loss are treated as first-class states in the Plurivex lifecycle. To address the entire threat surface, Plurivex implements a formal Dual Pillar Recovery Model spanning cryptographic credentials and onchain settlement:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75, marginBottom: '16px' }}>
                    <li>
                      <b>Pillar 1 — Cryptographic Key &amp; Forensic Seed Recovery (✓ LIVE IN CORE):</b> Blockchain execution is fundamentally impossible if access keys are damaged, transposed, or incomplete. Plurivex features a native multi-threaded Rayon solver capable of evaluating 4,194,304 candidate BIP-39 mnemonic vectors in under 1.8 seconds across 10 international dictionaries, supplemented by Damerau Levenshtein typo correction (d ≤ 2) and strict zero disk RAM guarantees via <code>Zeroizing</code> buffers.
                    </li>
                    <li>
                      <b>Pillar 2 — On-Chain Execution Failure Recovery (⏳ ROADMAP · Phase III):</b> Settlement level failures resulting from sudden gas surges, route expiration, slippage breaches, or nonce collisions enter an automated recovery workflow. The engine dynamically evaluates gas escalation (EIP-1559 priority fee bumping), RPC endpoint failover, transaction parameter adjustment, or safe execution postponement.
                    </li>
                  </ul>
                  <div className="wp-paper-callout">
                    <strong>PRIMARY USP — EXECUTION LIFECYCLE ORCHESTRATION:</strong> Simulation informs execution; execution generates state; state informs verification; and failure triggers recovery. Wallets serve as execution resources, policies govern execution constraints, and protection layers determine private submission pathways. Plurivex coordinates the full transaction lifecycle as an integrated, self-healing system.
                  </div>
                </section>

                {/* Chapter 6 */}
                <section className="wp-paper-section" id="chapter-6">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Multi-Wallet Orchestration</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">6. Multi-Wallet Execution</h2>
                  </div>
                  <p>
                    Plurivex fundamentally reimagines cryptographic wallets not as isolated account identities, but as <strong>pooled execution resources</strong>. In conventional Web3 architectures, an operator managing dozens of accounts must sequentially switch providers, re-authorize permissions, and manually construct individual transactions. Plurivex abstracts this complexity by coordinating concurrent operations across arbitrary wallet sets.
                  </p>
                  <p>
                    The orchestrator enforces strict, user-defined execution policies across the resource pool:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75 }}>
                    <li><b>Parallel Fan-Out Dispatch:</b> Non-interdependent operations (such as parallel asset sweeps or multi-account claiming) execute concurrently across multi-threaded Tokio asynchronous worker pools.</li>
                    <li><b>Deterministic Sequential Pipelines:</b> Dependent operations (such as multi-hop rebalances or laddered liquidity entries) execute in strict topological order, requiring transaction $N$'s block receipt before transaction $N+1$ is dispatched.</li>
                    <li><b>Dynamic Gas Reservation &amp; Hedging:</b> Automatic pre-flight balance checks verify that each account maintains sufficient native gas balance before broadcast, preventing partial gas burn failures.</li>
                    <li><b>Slippage &amp; Failure Isolation:</b> If an individual wallet within a batch experiences network rejection or high slippage, the orchestrator isolates the failure without halting unrelated wallet operations.</li>
                  </ul>
                </section>

                {/* Chapter 7 */}
                <section className="wp-paper-section" id="chapter-7">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Orchestration Atomicity</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">7. Execution Atomicity</h2>
                  </div>
                  <p>
                    Atomicity must be defined with rigorous technical honesty. Across disparate, heterogeneous blockchains (such as coordinating simultaneous actions on EVM, Solana, and Bitcoin), true cryptographic consensus-level atomicity is mathematically impossible without centralized custodial escrows or complex cross-chain state bridges.
                  </p>
                  <p>
                    Plurivex solves this dilemma by establishing <strong>Policy-Enforced Orchestration Atomicity</strong>:
                  </p>
                  <div className="wp-paper-callout info">
                    <strong>Orchestration Invariant:</strong> A multi-wallet or multi-chain batch is defined as successful only if all requisite pre-conditions and post-settlement proofs are cryptographically satisfied. If any sub-transaction reverts, the orchestrator instantly engages fail-closed policy handling: halting downstream broadcasts, marking nonces, and activating the automated Dual-Pillar Recovery engine.
                  </div>
                  <p>
                    Operators can configure atomicity behaviors tailored to specific risk tolerances: <em>All-or-Nothing</em> (abort entire pipeline on single failure), <em>Best-Effort with Isolation</em> (proceed with remaining wallets and isolate reverts into a quarantine queue), or <em>Heuristic Retry</em> (automatically escalate gas and retry failed legs up to a bounded limit).
                  </p>
                </section>

                {/* Chapter 8 */}
                <section className="wp-paper-section" id="chapter-8">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Multi-Chain Protocol Architecture</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">8. Multi-Chain Execution</h2>
                  </div>
                  <p>
                    The modern digital asset landscape is fundamentally multi-chain. Sovereign operators and automated strategies maintain capital across diverse execution environments, including Ethereum, Robinhood Chain, Arbitrum, Base, Binance Smart Chain (BSC), Polygon, Solana, and Bitcoin.
                  </p>
                  <p>
                    Each blockchain architecture introduces divergent transaction serialization formats, state models, gas accounting systems, and confirmation finality guarantees:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75, marginBottom: '16px' }}>
                    <li>
                      <b>EVM Ecosystem (Ethereum, Robinhood Chain, Arbitrum, Base, BSC, Polygon):</b> Standardized around BIP-44 key derivation (<code>m/44'/60'/0'/0/0</code>), EIP-1559 dynamic base fee + priority tip estimation, and ERC-20 token approval standards.
                    </li>
                    <li>
                      <b>Solana High-Throughput Network:</b> Built on SLIP-0010 Ed25519 key derivation (<code>m/44'/501'/0'/0'</code>), Compact-u16 instruction serialization, Associated Token Accounts (ATA), durable transaction nonces, and dynamic Compute Unit (CU) budget optimization.
                    </li>
                    <li>
                      <b>Bitcoin Network (Tri-Address Support):</b> Native SegWit Bech32 (<code>bc1q...</code> via BIP-84), Legacy P2PKH (<code>1...</code> via BIP-44), and Wallet Import Format (WIF) key export with UTXO transaction parsing.
                    </li>
                  </ul>
                  <div className="wp-paper-callout info">
                    <strong>Protocol Abstraction:</strong> Plurivex unifies these disparate networks at the local key derivation and balance scanner layer (operational today in core), while multi-chain atomic routing is actively scheduled on the roadmap.
                  </div>
                </section>

                {/* Chapter 9 */}
                <section className="wp-paper-section" id="chapter-9">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill roadmap">⏳ IN DEV · Phase II Specification</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">9. Phrasser — Universal Transaction Parsing</h2>
                  </div>
                  <p>
                    <strong>Phrasser</strong> is an execution subsystem that decodes raw, unreadable blockchain calldata into structured human-readable intent. In standard onchain workflows, users frequently interact with hexadecimal bytecode—creating severe blind-signing vulnerabilities that wallet drainers and malicious smart contracts exploit. Phrasser acts as a deterministic parsing layer between raw network payloads and high-level execution logic.
                  </p>
                  <p>
                    Key architectural capabilities include decompilation of raw EVM calldata, 4-byte function selector resolution, smart contract parameter identification, and pre-flight approval interception. By parsing bytecode before signing, Phrasser decodes critical contract calls:
                  </p>
                  
                  <div className="wp-paper-code-box" style={{ fontSize: '12px' }}>
                    0xa9059cbb ──▶ ERC-20 transfer(address to, uint256 amount){'\n'}
                    0x095ea7b3 ──▶ ERC-20 approve(address spender, uint256 amount){'\n'}
                    0x23b872dd ──▶ ERC-20 transferFrom(address from, address to, uint256 amount){'\n'}
                    0xa22cb465 ──▶ ERC-721 setApprovalForAll(address operator, bool approved){'\n'}
                    0x38ed1739 ──▶ Uniswap V2 swapExactTokensForTokens(...)
                  </div>

                  <p>
                    Crucially, Phrasser detects and warns against deceptive patterns such as <em>unconstrained token allowances</em> (e.g., <code>type(uint256).max</code> / <code>0xffffff...</code>) and unverified proxy implementations, eliminating blind signing across Web3 workflows.
                  </p>

                  <div className="wp-paper-callout info">
                    <strong>Implementation Status &amp; Alignment:</strong> In the active Phase I foundational core, Plurivex provides the <strong>Universal Key &amp; Credential Extractor</strong> (<code>extractor.rs</code>) for sovereign local credential analysis. The <strong>Phrasser Universal Calldata Decompiler</strong> is actively scheduled for <strong>Phase II (Active Sprint)</strong> as part of the Pre-Trade Simulation and MEV Shield pipeline, ensuring transparent technical precision without premature live claims.
                  </div>
                </section>

                {/* Chapter 10 */}
                <section className="wp-paper-section" id="chapter-10">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill live">✓ LIVE · Production Engine</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">10. Sweeper — Multi-Wallet Asset Sweeping</h2>
                  </div>
                  <p>
                    <strong>Sweeper</strong> is a battle-tested Plurivex subsystem engineered to consolidate scattered assets from dozens or hundreds of secondary, dormant, or compromised wallets into a single sovereign destination vault.
                  </p>
                  <p>
                    The sweeping pipeline incorporates advanced execution heuristics:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75 }}>
                    <li><b>Intelligent Dust Thresholding:</b> Automatically calculates whether the cost of network gas exceeds the real economic value of a token balance, preventing unprofitable transactions that waste operator funds.</li>
                    <li><b>Dual Native &amp; Token Pipeline:</b> Concurrently handles ERC-20, SPL, and native asset sweeps. For tokens requiring approvals, the engine constructs atomic multi-call or sequential approval-and-transfer bundles.</li>
                    <li><b>Compromised Wallet Extraction Mode:</b> Submits sweeps through private mempools and MEV-shielded relays, bypassing public mempool sweeper bots that monitor compromised addresses.</li>
                    <li><b>Deterministic Nonce &amp; Fee Prioritization:</b> Computes EIP-1559 max priority fees dynamically to guarantee swift block inclusion during critical recovery operations.</li>
                  </ul>
                </section>

                {/* Chapter 11 */}
                <section className="wp-paper-section" id="chapter-11">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill roadmap">⏳ IN DEV · Routing &amp; Simulator</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">11. DEX Batch Execution</h2>
                  </div>
                  <p>Plurivex extends execution lifecycle to DEX operations. Batch trading workflow:</p>
                  <div className="wp-paper-code-box">Define Strategy ──▶ Build Transactions ──▶ Simulate ──▶ Evaluate Results ──▶ Apply Protection ──▶ Execute Across Wallets ──▶ Monitor ──▶ Verify ──▶ Recover</div>
                  <p>Active preview simulator available via <code>DexBatchTrader.tsx</code>.</p>
                </section>

                {/* Running Academic Page Footer */}
                <footer className="wp-paper-running-footer">
                  <span>Plurivex Protocol · Specification v1.0</span>
                  <span>Zero-Cloud Air-Gapped Execution Boundary</span>
                  <span>Sheet 3 of 7</span>
                </footer>
              </article>
            </div>
{/* =========================================================================
                SHEET 4: PART III — SECURITY & SYSTEMS (Chapters 12–14)
                ========================================================================= */}
            <div className={`wp-sheet-slide-wrapper ${getSlideClass(3)}`}>
              <article className="wp-paper-sheet">
                {/* Running Academic Header */}
                <div className="wp-paper-running-head">
                  <span>PLURIVEX PROTOCOL SPECIFICATION · SECURITY &amp; SYSTEMS</span>
                  <span>SHEET 4 OF 7 · PART III: SEC 12–14</span>
                </div>

                <div className="wp-sheet-intro-header">
                  <h1 className="wp-paper-sheet-heading">Part III: Security &amp; Systems</h1>
                  <div className="wp-paper-subtitle">Defense in Depth Cryptographic Engineering, Memory Zeroization, and Air Gapped Safe Mode</div>
                </div>

                {/* Chapter 12 */}
                <section className="wp-paper-section" id="chapter-12">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill live">✓ LIVE · Layered Defense-in-Depth</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">12. Security Architecture</h2>
                  </div>
                  <p>
                    Plurivex treats security as an uncompromising, layered defense in depth architecture. Rather than relying on singlepoint perimeters, each functional layer enforces strict mathematical and operational constraints:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75, marginBottom: '16px' }}>
                    <li>
                      <b>Layer 1 — Local Cryptographic Vault:</b> Secrets are protected by memory hard Argon2id KDF (<code>m = 19,456 KiB</code> / 19 MiB RAM, <code>t = 2</code> iterations, <code>p = 1</code> lane) deriving 256-bit symmetric keys in accordance with OWASP cryptographic recommendations. Stored data is sealed with authenticated AES 256 GCM using unique 96-bit nonces.
                    </li>
                    <li>
                      <b>Layer 2 — Volatile Memory Zeroization:</b> All intermediate secret buffers (seed bytes, private keys, derived keypairs) implement the <code>Zeroize</code> and <code>ZeroizeOnDrop</code> traits from the official Rust <code>zeroize</code> crate, reinforced with explicit <code>compiler_fence(Ordering::SeqCst)</code> memory barriers upon auto-lock or session termination.
                    </li>
                    <li>
                      <b>Layer 3 — Keyed Deduplication Shield:</b> Wallet entries are indexed using keyed HMAC SHA256 fingerprints (<code>hmac1:&lt;digest&gt;</code>) seeded by an internal vault pepper, completely preventing offline rainbow table and dictionary cross matching.
                    </li>
                    <li>
                      <b>Layer 4 — Dynamic Gas &amp; Balance Validation:</b> Execution operations evaluate dynamic gas thresholds, insufficient funds, and network fee parameters prior to signing, preventing partial gas burn failures.
                    </li>
                    <li>
                      <b>Layer 5 — Fail Closed Air Gapped Safe Mode:</b> A kernel level execution gate enforces a total network disconnect during key recovery and secret inspection, preventing inadvertent exfiltration via external RPCs.
                    </li>
                  </ul>
                </section>

                {/* Chapter 13 */}
                <section className="wp-paper-section" id="chapter-13">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill live">✓ LIVE · Core Mandate</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">13. Local-First Security Philosophy</h2>
                  </div>
                  <p>
                    Private keys and seed phrases represent absolute sovereignty over blockchain assets. Plurivex enforces an immutable architectural mandate:
                  </p>
                  <div className="wp-paper-callout">
                    <strong>ARCHITECTURAL MANDATE:</strong> Sensitive wallet operations must be performed as close to the user's controlled environment as practical. The system strictly avoids transmission of private keys, seed phrases, or master passwords to centralized cloud servers, third-party indexers, or telemetry sinks.
                  </div>
                  <p>
                    Where network interaction is strictly necessary (such as onchain balance verification or transaction broadcast), execution payloads are strictly separated from signing authority. The client signs locally within isolated native Rust memory, dispatching only pre-signed raw byte payloads over TLS to authorized network adapters.
                  </p>
                </section>

                {/* Chapter 14 */}
                <section className="wp-paper-section" id="chapter-14">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill live">✓ LIVE · System Map</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">14. System Architecture</h2>
                  </div>
                  <p>The system relies on a multi-tier client structure ensuring complete separation between the UI application and the highly secure cryptographic core.</p>
                  <div className="wp-paper-code-box ascii-art">
{`┌────────────────────────────────────────────────────────────────────┐
│                    PLURIVEX DESKTOP CLIENT                         │
│   (Tauri v2 + React 19 · Air-Gapped Capable · Zero Cloud Telemetry)│
└────────────────────────────────────────────────────────────────────┘
                              │  IPC Bridge (core-permissions.toml)
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                   RUST CORE SECURITY ENGINE                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │Argon2id 19MB │  │AES-256-GCM  │  │ Zeroizing<T> RAM Wiping  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │Rayon Solver  │  │SQLite EncWAL │  │  Keyed HMAC-SHA256 Guard │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              │  Raw JSON-RPC / Private Relays
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                   ONCHAIN EXECUTION LAYER                          │
│  Ethereum · Solana · Robinhood · Base · Arbitrum · Polygon · BSC   │
└────────────────────────────────────────────────────────────────────┘`}
                  </div>
                  <div className="wp-figure-caption">
                    <b>Listing 1:</b> Multi-Tier Client Architecture separating UI from Memory-Zeroized Rust Security Core.
                  </div>
                </section>

                {/* Running Academic Page Footer */}
                <footer className="wp-paper-running-footer">
                  <span>Plurivex Protocol · Specification v1.0</span>
                  <span>Zero-Cloud Air-Gapped Execution Boundary</span>
                  <span>Sheet 4 of 7</span>
                </footer>
              </article>
            </div>
{/* =========================================================================
                SHEET 5: PART IV — POLICIES & AUTOMATION (Chapter 15)
                ========================================================================= */}
            <div className={`wp-sheet-slide-wrapper ${getSlideClass(4)}`}>
              <article className="wp-paper-sheet">
                {/* Running Academic Header */}
                <div className="wp-paper-running-head">
                  <span>PLURIVEX PROTOCOL SPECIFICATION · POLICIES &amp; AUTOMATION</span>
                  <span>SHEET 5 OF 7 · PART IV: SEC 15</span>
                </div>

                <div className="wp-sheet-intro-header">
                  <h1 className="wp-paper-sheet-heading">Part IV: Policies &amp; Automation</h1>
                  <div className="wp-paper-subtitle">Programmable Execution Policies, Safety Guardrails, and Automated Workflow Execution</div>
                </div>

                {/* Chapter 15 */}
                <section className="wp-paper-section" id="chapter-15">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill roadmap">⏳ IN DEV · Policy &amp; Automation Engine</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">15. Programmable Execution Policies &amp; Automation</h2>
                  </div>
                  <p>
                    At the core of Plurivex is programmable execution policy. Rather than manual, high-friction transaction approval, operators configure deterministic execution guardrails enforced client-side prior to broadcast:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75, marginBottom: '16px' }}>
                    <li><b>Pre-Flight Verification Gate:</b> Only execute if pre flight simulation succeeds and reveals zero state divergence or honeypot revert triggers.</li>
                    <li><b>Strict Secret Export Authentication:</b> Enforce master password re authentication before any plaintext secret or mnemonic export can occur.</li>
                    <li><b>Factory Reset Confirmation:</b> Enforce explicit destructive confirmation (<code>CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY</code>) before local database zeroization.</li>
                    <li><b>Batch Failure Quarantine:</b> Stop a multi-wallet batch if a user-defined threshold percentage of wallets encounter revert conditions.</li>
                    <li><b>Slippage Bound Defense:</b> Never execute if dynamic expected slippage exceeds defined limits.</li>
                    <li><b>Automated RPC Fallback Hedging:</b> Route primary JSON-RPC with automated multi-provider failover hedging during latency spikes.</li>
                  </ul>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '20px 0 10px', color: '#0F172A' }}>15.1 Automated Workflow Execution</h3>
                  <p>
                    Automation is the natural evolutionary extension of execution orchestration. Instead of <em>User → Click → Transaction</em>, the operating paradigm shifts to <em>User → Define Policy → Plurivex Executes</em>.
                  </p>
                  <p>
                    Built-in automation primitives support scheduled execution cadences, threshold-based multi-wallet balance rebalancing, recurring asset sweeps into cold storage, and automated failover recovery loops—running with zero-cloud exposure in the background desktop machine.
                  </p>
                </section>

                {/* Running Academic Page Footer */}
                <footer className="wp-paper-running-footer">
                  <span>Plurivex Protocol · Specification v1.0</span>
                  <span>Zero-Cloud Air-Gapped Execution Boundary</span>
                  <span>Sheet 5 of 7</span>
                </footer>
              </article>
            </div>
{/* =========================================================================
                SHEET 6: PART V — MARKET & ECONOMICS (Chapters 16–21)
                ========================================================================= */}
            <div className={`wp-sheet-slide-wrapper ${getSlideClass(5)}`}>
              <article className="wp-paper-sheet">
                {/* Running Academic Header */}
                <div className="wp-paper-running-head">
                  <span>PLURIVEX PROTOCOL SPECIFICATION · MARKET &amp; ECONOMICS</span>
                  <span>SHEET 6 OF 7 · PART V: SEC 16–21</span>
                </div>

                <div className="wp-sheet-intro-header">
                  <h1 className="wp-paper-sheet-heading">Part V: Market &amp; Economics</h1>
                  <div className="wp-paper-subtitle">Competitive Differentiation, Architecture Status Matrix, Protocol Economics, and 4 Phase Development Track</div>
                </div>

                {/* Chapter 16 */}
                <section className="wp-paper-section" id="chapter-16">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Industry Differentiation</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">16. Competitive Landscape &amp; Differentiation</h2>
                  </div>
                  <p>Plurivex does not replace every crypto infrastructure product, but unifies fragmented primitives:</p>
                  <ul>
                    <li>Wallets focus on key management</li>
                    <li>Trading terminals focus on token discovery</li>
                    <li>Simulation platforms focus on isolated bytecode analysis</li>
                    <li>MEV infrastructure focuses on isolated private bundles</li>
                    <li>Automation tools focus on isolated cron execution</li>
                  </ul>
                  <div className="wp-paper-callout">
                    <strong>SYSTEMIC INTEGRATION:</strong> The core differentiation comes from the relationship between components. Simulation informs execution ──▶ execution generates state ──▶ state informs verification ──▶ failure triggers recovery. Wallets provide execution resources, and policies determine deterministic behavior. The primitives become exponentially more reliable when unified into a single client-side execution layer.
                  </div>
                </section>

                {/* Chapter 17 */}
                <section className="wp-paper-section" id="chapter-17">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Architecture Status Matrix</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">17. Product Development Status</h2>
                  </div>
                  <p>A serious infrastructure project should never present a roadmap feature as if it already exists. In accordance with this principle, every subsystem is tracked transparently against real repository architecture positioning Phrasser in active Phase II development while core credential parsing remains live in Phase I.</p>
                  
                  {/* Formal Academic Table */}
                  <div className="wp-paper-table-wrapper">
                    <table className="wp-paper-table">
                      <thead>
                        <tr>
                          <th>Module / Component</th>
                          <th>Architecture State</th>
                          <th>Verification Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><b>Local Desktop Security Vault</b> (Argon2id + AES-256-GCM)</td>
                          <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          <td>Verified &amp; Passing (<code>crypto.rs</code>)</td>
                        </tr>
                        <tr>
                          <td><b>Forensic Mnemonic Recovery</b> (Rayon 4.19M Permutations)</td>
                          <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          <td>Multi-core Rayon solver (<code>recovery_session.rs</code>)</td>
                        </tr>
                        <tr>
                          <td><b>Multi-Wallet Sweeper Engine</b></td>
                          <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          <td>Production ready (<code>SweeperWorkspace.tsx</code>)</td>
                        </tr>
                        <tr>
                          <td><b>Fail-Closed Air-Gapped Safe Mode</b></td>
                          <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          <td>Kernel gate enforcement (<code>commands.rs</code>)</td>
                        </tr>
                        <tr>
                          <td><b>Keyed HMAC Deduplication</b> (<code>hmac1:</code>)</td>
                          <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          <td>Rainbow-table proof (<code>fingerprint.rs</code>)</td>
                        </tr>
                        <tr>
                          <td><b>Universal Key &amp; Credential Extractor</b></td>
                          <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          <td>Native parser &amp; regex extractor (<code>extractor.rs</code>)</td>
                        </tr>
                        <tr>
                          <td><b>DEX Batch Execution Engine</b></td>
                          <td><span className="wp-status-pill roadmap">⏳ IN DEV</span></td>
                          <td>Simulator preview active (<code>DexBatchTrader.tsx</code>)</td>
                        </tr>
                        <tr>
                          <td><b>Phrasser (Universal Transaction &amp; Calldata Decoder)</b></td>
                          <td><span className="wp-status-pill roadmap">⏳ IN DEV</span></td>
                          <td>Phase II active sprint · On-chain bytecode decompiler</td>
                        </tr>
                        <tr>
                          <td><b>MEV &amp; Private Submission Routing</b></td>
                          <td><span className="wp-status-pill roadmap">⏳ IN DEV</span></td>
                          <td>Flashbots / RPC router integration</td>
                        </tr>
                        <tr>
                          <td><b>Decentralized Relayer Network &amp; $PLUR Layer</b></td>
                          <td><span className="wp-status-pill future">📅 FUTURE</span></td>
                          <td>Phase IV protocol expansion</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="wp-figure-caption">
                    <b>Table 1:</b> Module Verification and System Architecture Matrix.
                  </div>
                </section>

                {/* Chapter 18 */}
                <section className="wp-paper-section" id="chapter-18">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill roadmap">⏳ ROADMAP · Protocol Economics</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">18. Protocol Economics</h2>
                  </div>
                  <p>
                    The $PLUR token is not presented as the reason Plurivex exists; the infrastructure comes first. Plurivex operates under a self-sustaining economic loop where protocol utility supports decentralized network operations:
                  </p>
                  <div className="wp-paper-code-box">
                    Protocol Usage ──▶️ Execution Activity ──▶️ Network Utility ──▶️ Plurivex Economic Layer ──▶️ $PLUR
                  </div>
                  <p>
                    Local desktop operations (air-gapped key management, forensic mnemonic recovery, and local wallet indexing) remain 100% free, private, and sovereign. Protocol-level economics apply strictly to decentralized execution orchestration, multi-chain route hedging, and shared smart contract infrastructure.
                  </p>
                </section>

                {/* Chapter 19 */}
                <section className="wp-paper-section" id="chapter-19">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill roadmap">⏳ ROADMAP · Technical Utility</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">19. $PLUR Utility</h2>
                  </div>
                  <p>
                    The $PLUR token provides tangible technical utility tied directly to execution lifecycle activity:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75 }}>
                    <li><b>Execution Fee Subsidies:</b> Token holders receive tiered fee reductions on high-volume batch routing and multi-wallet sweeping operations.</li>
                    <li><b>Priority MEV Relays:</b> Guaranteed access to high-throughput private mempools and block builder bundles during high network congestion.</li>
                    <li><b>Execution Relayer Staking:</b> Required staking collateral for decentralized execution relayer nodes participating in the Phase IV network.</li>
                  </ul>
                  <p>
                    Mandate: Build the execution infrastructure first, connect the token second. Utility is activated strictly through verified software capability.
                  </p>
                </section>

                {/* Chapter 20 */}
                <section className="wp-paper-section" id="chapter-20">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Engineering Stewardship</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">20. Core Stewardship &amp; Governance</h2>
                  </div>
                  <p>
                    Infrastructure reliability requires operational agility, deterministic standards, and rigorous security engineering. Plurivex adopts a <strong>Core Engineering Stewardship</strong> model:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75 }}>
                    <li><b>Engineering-Led Agility:</b> The core cryptographic team maintains direct responsibility for rapid vulnerability mitigation, kernel security updates, and client binary releases without administrative delays.</li>
                    <li><b>Deterministic Algorithmic Rules:</b> Protocol parameters (such as dust thresholds, slippage tolerances, and gas hedges) are enforced deterministically in open-source code rather than subject to volatile speculative voting.</li>
                    <li><b>Transparent Open-Source Evolution:</b> Technical proposals, protocol improvements, and security audits are reviewed through public RFCs and cryptographic peer review, ensuring integrity and developer alignment.</li>
                  </ul>
                </section>

                {/* Chapter 21 */}
                <section className="wp-paper-section" id="chapter-21">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill roadmap">⏳ ROADMAP · Four-Phase Development Track</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">21. Four-Phase Roadmap</h2>
                  </div>
                  
                  <div className="wp-paper-roadmap">
                    <div className="wp-roadmap-card">
                      <div className="wp-roadmap-card-bar done"></div>
                      <div className="wp-roadmap-card-body">
                        <div className="wp-roadmap-card-title done">PHASE I — FOUNDATION (COMPLETED &amp; VERIFIED)</div>
                        <div className="wp-roadmap-card-desc">Local-first wallet vault · Universal Key &amp; Credential Extractor · Rayon forensic mnemonic recovery · Multi-wallet Sweeper · Multi-chain scanner (EVM, Solana, Bitcoin) · Keyed HMAC deduplication · Air-gapped safe mode.</div>
                      </div>
                    </div>
                    <div className="wp-roadmap-card">
                      <div className="wp-roadmap-card-bar active"></div>
                      <div className="wp-roadmap-card-body">
                        <div className="wp-roadmap-card-title active">PHASE II — EXECUTION &amp; SIMULATION (IN ACTIVE SPRINT)</div>
                        <div className="wp-roadmap-card-desc">Phrasser universal calldata &amp; ABI decoder · Pre-trade transaction simulation (eth_call &amp; Solana sim) · Private mempool / MEV routing · Transaction monitoring.</div>
                      </div>
                    </div>
                    <div className="wp-roadmap-card">
                      <div className="wp-roadmap-card-bar future"></div>
                      <div className="wp-roadmap-card-body">
                        <div className="wp-roadmap-card-title future">PHASE III — AUTOMATION &amp; BATCHING</div>
                        <div className="wp-roadmap-card-desc">On-chain DEX Batch Trader engine · Auto-retry execution policies · Multi-wallet rebalancing · Conditional threshold triggers.</div>
                      </div>
                    </div>
                    <div className="wp-roadmap-card">
                      <div className="wp-roadmap-card-bar future"></div>
                      <div className="wp-roadmap-card-body">
                        <div className="wp-roadmap-card-title future">PHASE IV — EXECUTION NETWORK &amp; $PLUR</div>
                        <div className="wp-roadmap-card-desc">Permissionless execution marketplace · Decentralized relayer network · $PLUR token launch &amp; core protocol expansion.</div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Running Academic Page Footer */}
                <footer className="wp-paper-running-footer">
                  <span>Plurivex Protocol · Specification v1.0</span>
                  <span>Zero-Cloud Air-Gapped Execution Boundary</span>
                  <span>Sheet 6 of 7</span>
                </footer>
              </article>
            </div>
{/* =========================================================================
                SHEET 7: PART VI — PRINCIPLES & CONCLUSION (Chapters 22–25 + Appendices)
                ========================================================================= */}
            <div className={`wp-sheet-slide-wrapper ${getSlideClass(6)}`}>
              <article className="wp-paper-sheet">
                {/* Running Academic Header */}
                <div className="wp-paper-running-head">
                  <span>PLURIVEX PROTOCOL SPECIFICATION · PRINCIPLES &amp; CONCLUSION</span>
                  <span>SHEET 7 OF 7 · PART VI: SEC 22–25</span>
                </div>

                <div className="wp-sheet-intro-header">
                  <h1 className="wp-paper-sheet-heading">Part VI: Principles &amp; Conclusion</h1>
                  <div className="wp-paper-subtitle">Architectural Guarantees, Security Verification Verdict, Autonomous AI Vision, and Formal Appendices</div>
                </div>

                {/* Chapter 22 */}
                <section className="wp-paper-section" id="chapter-22">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Sovereign Defense Mandate</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">22. Security Principles</h2>
                  </div>
                  <p>
                    The engineering of Plurivex is governed by seven non negotiable architectural principles:
                  </p>
                  <ol style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.85 }}>
                    <li style={{ marginBottom: '10px' }}>
                      <b>Minimize exposure of private wallet information:</b> Sensitive cryptographic material (private keys, mnemonics, seeds) never leaves the user's local machine. No telemetry, cloud backup, or remote storage is permitted.
                    </li>
                    <li style={{ marginBottom: '10px' }}>
                      <b>Validate before execution:</b> Every onchain action must undergo deterministic pre flight simulation (gas calculation, state change analysis, revert checks) before transaction broadcast.
                    </li>
                    <li style={{ marginBottom: '10px' }}>
                      <b>Separate execution intent from execution infrastructure:</b> User intent represents high level goals, transport infrastructure (relays, RPC endpoints, mempools) is treated as untrusted and interchangeable.
                    </li>
                    <li style={{ marginBottom: '10px' }}>
                      <b>Treat failure as an expected execution state:</b> Failure is not an exception, it is a guaranteed network contingency. The protocol prioritizes automated failure detection, route switching, and recovery.
                    </li>
                    <li style={{ marginBottom: '10px' }}>
                      <b>Make execution observable:</b> Provide complete, real-time transparency across all stages of the transaction lifecycle (INTENT → SIMULATE → PROTECT → EXECUTE → VERIFY → RECOVER) without compromising privacy.
                    </li>
                    <li style={{ marginBottom: '10px' }}>
                      <b>Do not assume successful submission means successful execution:</b> Transaction submission is merely network receipt; verified execution requires cryptographic onchain block confirmation and receipt receipts.
                    </li>
                    <li style={{ marginBottom: '10px' }}>
                      <b>Never sacrifice user-controlled security for convenience without explicit consent:</b> Default settings are fail closed, delegation of authority requires explicit cryptographic authorization.
                    </li>
                  </ol>
                </section>

                {/* Chapter 23 */}
                <section className="wp-paper-section" id="chapter-23">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Risk Transparency</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">23. Risk Considerations</h2>
                  </div>
                  <p>
                    Blockchain execution involves inherent risks that no software layer can fully eliminate:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75 }}>
                    <li><b>Smart Contract &amp; DeFi Vulnerabilities:</b> External smart contracts, decentralized exchanges, and liquidity pools may contain logic exploits or economic attack vectors beyond protocol control.</li>
                    <li><b>Network &amp; Sequencer Outages:</b> Blockchain forks, severe network congestion, base fee spikes (EIP 1559), and L2 sequencer downtime can delay or invalidate transaction ordering.</li>
                    <li><b>Simulation vs State Divergence:</b> Pre flight simulation evaluates state at block $N$, actual execution occurs at block $N+k$. Intervening transactions, sandwich attacks, or slippage shifts may cause execution divergence.</li>
                  </ul>
                  <div className="wp-paper-callout info">
                    <strong>Core Positioning:</strong> Plurivex reduces execution uncertainty, eliminates blind signing, and streamlines multi wallet operations. It does not eliminate systemic blockchain risks, nor does it guarantee speculative investment returns.
                  </div>
                </section>

                {/* Chapter 24 */}
                <section className="wp-paper-section" id="chapter-24">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Verification Framework</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">24. Security Verification &amp; Audits</h2>
                  </div>
                  <p>
                    Before protocol components are deployed to permissionless mainnet environments, critical modules undergo a multi layered verification framework:
                  </p>
                  <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75 }}>
                    <li><b>Comprehensive Automated Testing:</b> 72/72 automated regression and cryptographic test suites covering KDF derivation, mnemonic permutation boundaries, and zero-disk wiping.</li>
                    <li><b>Cryptographic Minisign Verification:</b> All desktop production releases carry verifiable Minisign digital signatures, allowing users to verify binary integrity independently.</li>
                    <li><b>Internal Cryptographic Verification:</b> Regression and cryptographic test suites completed (72/72 passing) with zero supply chain vulnerabilities and fail-closed security. Formal external third-party audit scheduled on roadmap.</li>
                    <li><b>Continuous Bug Bounty Program:</b> Public vulnerability disclosure program with rewards for ethical security researchers inspecting open-source components.</li>
                  </ul>
                </section>

                {/* Chapter 25 */}
                <section className="wp-paper-section" id="chapter-25">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill future">📅 FUTURE · Industry Evolution &amp; Macro Vision</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">25. The Future of Onchain Execution &amp; Autonomous AI Agents</h2>
                  </div>
                  <p>
                    The long-term vision of Plurivex is to become the <strong>Onchain Execution Layer</strong>: the universal, sovereign coordination infrastructure through which all blockchain operations are simulated, protected, executed, verified, and recovered.
                  </p>
                  <div className="wp-paper-manifesto">
                    <p><b>TO BECOME THE ONCHAIN EXECUTION LAYER:</b> Users and autonomous systems should not need to master complex RPC configurations, MEV hazards, or multi-chain encoding to interact with Web3 safely. Plurivex establishes this unified abstraction layer.</p>
                  </div>
                  <p>
                    The evolution of blockchain infrastructure spans five historical epochs:
                  </p>
                  <div className="wp-paper-code-box" style={{ fontSize: '12px', lineHeight: 1.8 }}>
                    Stage 1 (2009–2015) ──▶️ Decentralized Settlement (Bitcoin, Ethereum L1){'\n'}
                    Stage 2 (2015–2020) ──▶️ Sovereign Wallet Access (MetaMask, Seed Phrases){'\n'}
                    Stage 3 (2020–2023) ──▶️ Financial Composability (Uniswap, Aave, DeFi Summer){'\n'}
                    Stage 4 (2023–2026) ──▶️ Fragmented Execution Primitives (Flashbots, RPCs, Simulators){'\n'}
                    Stage 5 (Plurivex Era) ──▶️ Execution Lifecycle Orchestration (Unified Layer)
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '20px 0 10px', color: '#0F172A' }}>The Autonomous AI Agent Revolution</h3>
                  <p>
                    As autonomous AI agents increasingly conduct onchain economic activity arbitraging liquidity pools, managing DAO treasuries, and executing programmatic rebalances they cannot operate through human-centric browser extension popups.
                  </p>
                  <p>
                    Autonomous agents require deterministic, headless, programmatic execution infrastructure with built-in pre-flight simulation, MEV shielding, policy guardrails, and automated recovery loops. Plurivex provides the sovereign execution rail for the autonomous Web3 economy.
                  </p>
                  <p>
                    Blockchain technology has solved decentralized settlement. The next monumental hurdle is orchestrating the journey from human or machine intent to that settlement. Plurivex establishes this sovereign execution bridge through client-side cryptographic security, parallel multi-wallet orchestration, pre-flight bytecode interpretation, and deterministic recovery.
                  </p>
                </section>

                {/* Appendices */}
                <section className="wp-paper-section" id="appendices">
                  <div className="wp-paper-chapter-header">
                    <div className="wp-paper-chapter-eyebrow">
                      <span className="wp-status-pill spec">📋 SPEC · Core Definitions</span>
                    </div>
                    <h2 className="wp-paper-chapter-title">Appendices A–C: Formal Definitions &amp; Product Stack</h2>
                  </div>
                  
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '16px 0 10px', color: '#0F172A' }}>Appendix A  Core Definitions</h3>
                    <ul style={{ paddingLeft: '20px', color: '#334155', fontSize: '13.5px', lineHeight: 1.75 }}>
                      <li><b>Execution:</b> The deterministic process of submitting and completing an onchain operation.</li>
                      <li><b>Execution Intent:</b> A structured, human-readable representation of desired user actions prior to broadcast.</li>
                      <li><b>Execution Lifecycle:</b> The unified sequence: INTENT → SIMULATE → PROTECT → EXECUTE → VERIFY → RECOVER.</li>
                      <li><b>Execution Orchestration:</b> Coordination of multiple execution primitives across distinct wallets and networks.</li>
                      <li><b>Execution Policy:</b> Programmable rules determining how an execution batch behaves and handles hazards.</li>
                      <li><b>Recovery:</b> Dual-pillar handling of damaged cryptographic credentials (Pillar 1) and failed transactions (Pillar 2).</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '20px 0 10px', color: '#0F172A' }}>Appendix B Core Product Stack Architecture</h3>
                    <div className="wp-paper-table-wrapper">
                      <table className="wp-paper-table">
                        <thead>
                          <tr>
                            <th>Layer</th>
                            <th>Core Subsystem</th>
                            <th>Status Track</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td><b>Interface</b></td>
                            <td>Plurivex Native Desktop Workspace</td>
                            <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          </tr>
                          <tr>
                            <td><b>Vault Engine</b></td>
                            <td>Argon2id KDF + AES-256-GCM Air-Gapped Store</td>
                            <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          </tr>
                          <tr>
                            <td><b>Credential Parsing</b></td>
                            <td>Universal Key &amp; Credential Extractor (<code>extractor.rs</code>)</td>
                            <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          </tr>
                          <tr>
                            <td><b>Transaction Parsing</b></td>
                            <td>Phrasser Universal Calldata &amp; ABI Decoder</td>
                            <td><span className="wp-status-pill roadmap">⏳ IN DEV (Phase II)</span></td>
                          </tr>
                          <tr>
                            <td><b>Asset Operations</b></td>
                            <td>Multi-Wallet Sweeper &amp; Consolidation Engine</td>
                            <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          </tr>
                          <tr>
                            <td><b>Pre-Flight &amp; MEV</b></td>
                            <td>Simulation Engine &amp; Private Submission Relay</td>
                            <td><span className="wp-status-pill roadmap">⏳ IN DEV (Phase II)</span></td>
                          </tr>
                          <tr>
                            <td><b>Forensic Recovery</b></td>
                            <td>Rayon Multi-Threaded Seed Phrase Solver</td>
                            <td><span className="wp-status-pill live">✓ LIVE</span></td>
                          </tr>
                          <tr>
                            <td><b>Relayer &amp; Economy</b></td>
                            <td>Decentralized Execution Relayers and $PLUR Layer</td>
                            <td><span className="wp-status-pill future">📅 FUTURE (Phases III–IV)</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '20px 0 10px', color: '#0F172A' }}>Appendix C  The Core Plurivex Statement</h3>
                  <div className="wp-paper-manifesto">
                    <p><b>THE CORE PLURIVEX POSITIONING STATEMENT:</b> Plurivex is an onchain execution infrastructure protocol that orchestrates the full transaction lifecycle  from simulation and protection to execution, verification, and recovery  across multiple wallets and blockchain networks.</p>
                    <p><b>Product Philosophy:</b> Every execution is a lifecycle, not a transaction.</p>
                    <p><b>Core Differentiation:</b> EXECUTION LIFECYCLE ORCHESTRATION. Plurivex does not build another execution tool. Plurivex builds the layer that orchestrates execution.</p>
                  </div>

                  <div style={{ textAlign: 'center', marginTop: '44px', paddingTop: '26px', borderTop: '1px solid #E5E7EB' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#64748B', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '14px', fontWeight: 600 }}>
                      Open-Source Cryptographic Client · Air-Gapped Safe Mode Active
                    </div>
                    <a href="#download" className="btn btn-primary" style={{ padding: '12px 32px', fontSize: '13.5px', fontWeight: 700 }}>
                      Download Plurivex Desktop Suite v0.1.6
                    </a>
                  </div>
                </section>

                {/* Running Academic Page Footer */}
                <footer className="wp-paper-running-footer">
                  <span>Plurivex Protocol · Specification v1.0</span>
                  <span>Zero-Cloud Air-Gapped Execution Boundary</span>
                  <span>Sheet 7 of 7</span>
                </footer>
              </article>
            </div>

          </div>
        </div>
      </main>

        {/* Floating Side Navigation Arrows: Middle Left & Middle Right */}
        {activeSheetIndex > 0 && (
          <button 
            className="wp-side-nav-btn prev"
            onClick={() => goToSheet(activeSheetIndex - 1)}
            aria-label={`Previous Sheet: ${tocGroups[activeSheetIndex - 1].partTitle} (ArrowLeft)`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span className="wp-side-nav-tooltip">
              <span className="label">Prev Sheet ({activeSheetIndex}/{tocGroups.length})</span>
              <span className="title">{tocGroups[activeSheetIndex - 1].partTitle}</span>
            </span>
          </button>
        )}

        {activeSheetIndex < tocGroups.length - 1 && (
          <button 
            className="wp-side-nav-btn next"
            onClick={() => goToSheet(activeSheetIndex + 1)}
            aria-label={`Next Sheet: ${tocGroups[activeSheetIndex + 1].partTitle} (ArrowRight)`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span className="wp-side-nav-tooltip">
              <span className="label">Next Sheet ({activeSheetIndex + 2}/{tocGroups.length})</span>
              <span className="title">{tocGroups[activeSheetIndex + 1].partTitle}</span>
            </span>
          </button>
        )}
      </div>
    </div>

      {/* Copied Toast Alert */}
      {copiedToast && (
        <div className="wp-toast">
          <span>✓</span> {copiedToast}
        </div>
      )}
    </div>
  );
};
