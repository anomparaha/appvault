import React, { useState } from 'react';

type PlatformId = 'windows' | 'macos' | 'linux' | 'google-play';

interface PlatformSpec {
  label: string;
  value: string;
}

interface PlatformTab {
  id: PlatformId;
  name: string;
  tabLabel: string;
  tabBadge: string;
  logo: string;
  alt: string;
  isLive: boolean;
  title: string;
  tagline: string;
  description: string;
  specs: PlatformSpec[];
  downloads?: {
    label: string;
    sublabel: string;
    href: string;
    isPrimary: boolean;
  }[];
}

const PLATFORMS: PlatformTab[] = [
  {
    id: 'windows',
    name: 'Windows',
    tabLabel: 'Windows',
    tabBadge: 'v0.1.6 Live',
    logo: '/assets/platforms/windows.png',
    alt: 'Microsoft Windows',
    isLive: true,
    title: 'Plurivex Desktop for Windows',
    tagline: 'Windows 10 & 11 · 64-bit (x64) Architecture',
    description: 'High-performance native desktop client engineered with local Argon2id vault encryption, fail-closed Air-Gapped Safe Mode, and multithreaded Rayon recovery engine.',
    specs: [
      { label: 'Architecture', value: 'x86_64 (64-bit)' },
      { label: 'Cryptography', value: 'Argon2id + AES-256-GCM' },
      { label: 'Offline Mode', value: 'Kernel-enforced Air-Gap' },
      { label: 'Verification', value: 'SHA-256 Verified · Audited' },
    ],
    downloads: [
      {
        label: 'Download .EXE Setup',
        sublabel: 'Standard Windows Installer',
        href: '/downloads/Plurivex_x64_setup.exe',
        isPrimary: true,
      },
      {
        label: 'Download .MSI Package',
        sublabel: 'Enterprise Installer Package',
        href: '/downloads/Plurivex_x64.msi',
        isPrimary: false,
      },
    ],
  },
  {
    id: 'macos',
    name: 'macOS',
    tabLabel: 'macOS',
    tabBadge: 'Coming Soon',
    logo: '/assets/platforms/macos.png',
    alt: 'Apple macOS',
    isLive: false,
    title: 'Plurivex Desktop for macOS',
    tagline: 'Apple Silicon (M1–M4) & Intel 64-bit',
    description: 'Universal DMG installer engineered for macOS 12.0 Monterey and newer, featuring native Apple Keychain enclave integration, Metal hardware acceleration, and air-gapped protection.',
    specs: [
      { label: 'Target Format', value: 'Universal .DMG Package' },
      { label: 'Compatibility', value: 'macOS 12.0+ (Monterey or later)' },
      { label: 'Hardware', value: 'Apple Silicon & Intel Core' },
      { label: 'Status', value: 'Phase II Roadmap · In Development' },
    ],
  },
  {
    id: 'linux',
    name: 'Linux',
    tabLabel: 'Linux',
    tabBadge: 'Coming Soon',
    logo: '/assets/platforms/linux.png',
    alt: 'Linux Tux',
    isLive: false,
    title: 'Plurivex Desktop for Linux',
    tagline: 'Ubuntu, Debian, Fedora & Arch (x86_64)',
    description: 'Lightweight, self-contained AppImage and Debian packages designed with systemd secret service integration, native Wayland rendering, and zero background telemetry.',
    specs: [
      { label: 'Target Formats', value: 'AppImage & .deb Packages' },
      { label: 'C Runtime', value: 'glibc 2.31+ Compatible' },
      { label: 'Display Server', value: 'Wayland & X11 Native' },
      { label: 'Status', value: 'Phase II Roadmap · In Development' },
    ],
  },
  {
    id: 'google-play',
    name: 'Google Play',
    tabLabel: 'Google Play',
    tabBadge: 'Coming Soon',
    logo: '/assets/platforms/google-play.png',
    alt: 'Google Play Store',
    isLive: false,
    title: 'Plurivex Mobile for Android',
    tagline: 'Android 10.0+ (ARM64 Architecture)',
    description: 'Ultra-secure mobile companion app for on-the-go transaction signing, biometric hardware keystore isolation, and multi-wallet balance surveillance without remote key custody.',
    specs: [
      { label: 'Distribution', value: 'Google Play Store & APK' },
      { label: 'Biometrics', value: 'Android BiometricPrompt Enclave' },
      { label: 'Sync Protocol', value: 'End-to-End Encrypted Relay' },
      { label: 'Status', value: 'Phase III Roadmap · Companion App' },
    ],
  },
];

export const DownloadCenter: React.FC = () => {
  const [activeId, setActiveId] = useState<PlatformId>('windows');
  const current = PLATFORMS.find((p) => p.id === activeId) || PLATFORMS[0];

  return (
    <section className="section" id="download">
      <div className="container">
        <div className="platform-section-header">
          <span className="section-pill">CROSS-PLATFORM ECOSYSTEM</span>
          <h2 className="section-title">Get Plurivex for Your Operating System</h2>
          <p className="section-desc">
            Zero-cloud, air-gapped security infrastructure built natively in Rust.
          </p>
        </div>

        <div className="platform-tabs-wrapper">
          {/* Top Segmented Tab Navigation */}
          <div className="platform-tab-nav" role="tablist">
            {PLATFORMS.map((platform) => {
              const isActive = platform.id === activeId;
              return (
                <button
                  key={platform.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`platform-tab-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveId(platform.id)}
                >
                  <img
                    src={platform.logo}
                    alt=""
                    className="tab-platform-icon"
                    aria-hidden="true"
                  />
                  <span className="tab-platform-label">{platform.tabLabel}</span>
                  <span className={`tab-platform-badge ${platform.isLive ? 'live' : 'soon'}`}>
                    {platform.isLive && <span className="tab-dot" />}
                    {platform.tabBadge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Platform Showcase Card */}
          <div className={`platform-showcase-panel ${current.isLive ? 'is-live' : 'is-soon'}`}>
            <div className="showcase-header">
              <div className="showcase-brand">
                <div className="showcase-logo-box">
                  <img
                    src={current.logo}
                    alt={current.alt}
                    className="showcase-logo-img"
                  />
                </div>
                <div className="showcase-title-area">
                  <div className="showcase-title-row">
                    <h3 className="showcase-title">{current.title}</h3>
                    {current.isLive ? (
                      <span className="showcase-status live">
                        <span className="status-dot" />
                        Available Now · v0.1.6
                      </span>
                    ) : (
                      <span className="showcase-status soon">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        In Active Development
                      </span>
                    )}
                  </div>
                  <span className="showcase-tagline">{current.tagline}</span>
                </div>
              </div>
            </div>

            <p className="showcase-description">{current.description}</p>

            {/* Technical Specifications Grid */}
            <div className="showcase-specs-grid">
              {current.specs.map((spec) => (
                <div key={spec.label} className="showcase-spec-item">
                  <span className="spec-label">{spec.label}</span>
                  <span className="spec-value">{spec.value}</span>
                </div>
              ))}
            </div>

            {/* Action Buttons Area */}
            <div className="showcase-action-area">
              {current.isLive && current.downloads ? (
                <div className="showcase-downloads-row">
                  {current.downloads.map((dl) => (
                    <a
                      key={dl.label}
                      href={dl.href}
                      className={`showcase-dl-btn ${dl.isPrimary ? 'primary' : 'secondary'}`}
                    >
                      <div className="showcase-dl-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="2" y="2" width="9.2" height="9.2" rx="1.2" />
                          <rect x="12.8" y="2" width="9.2" height="9.2" rx="1.2" />
                          <rect x="2" y="12.8" width="9.2" height="9.2" rx="1.2" />
                          <rect x="12.8" y="12.8" width="9.2" height="9.2" rx="1.2" />
                        </svg>
                      </div>
                      <div className="showcase-dl-info">
                        <div className="showcase-dl-title-row">
                          <span className="showcase-dl-main">{dl.label}</span>
                          <svg className="showcase-dl-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                          </svg>
                        </div>
                        <span className="showcase-dl-sub">{dl.sublabel}</span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="showcase-upcoming-row">
                  <div className="showcase-upcoming-status">
                    <span className="upcoming-dot" />
                    <span>Targeted for Phase II &amp; III Releases</span>
                  </div>
                  <a
                    href="https://x.com/Plurivex"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-notify-x"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    <span>Follow @Plurivex on X for Launch Alerts</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
