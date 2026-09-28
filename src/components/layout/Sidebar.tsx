import { useApp } from "../../context/AppContext";
 
interface SidebarProps {
  activeNav?: string;
  setActiveNav?: (nav: string) => void;
  isCollapsed?: boolean;
  setIsCollapsed?: (fn: (prev: boolean) => boolean) => void;
}

export function Sidebar({
  activeNav = "wallets",
  setActiveNav,
  isCollapsed = false,
  setIsCollapsed,
}: SidebarProps) {
  const { fundedCount, lock } = useApp();

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`} id="sidebar">
      {/* Brand Header */}
      <div className="sb-top">
        <img src="/app-icon.png" alt="Plurivex" className="sb-logo" style={{ objectFit: "contain", borderRadius: "6px" }} />
        <div className="sb-brand">
          <b>PLURIVEX</b>
          <span>SECURE WALLET VAULT</span>
        </div>
      </div>

      {/* Main Navigation Menu */}
      <nav className="sb-nav scrollable">
        <div className="nav-label">Main</div>

        <button
          type="button"
          className={`nav-itm ${activeNav === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveNav?.("dashboard")}
          data-tooltip={isCollapsed ? "Dashboard Overview" : undefined}
          data-tooltip-pos="right"
        >
          <svg className="nic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>
          </svg>
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          className={`nav-itm ${activeNav === "wallets" ? "active" : ""}`}
          onClick={() => setActiveNav?.("wallets")}
          data-tooltip={isCollapsed ? "Portfolio & Wallets Inventory" : undefined}
          data-tooltip-pos="right"
        >
          <svg className="nic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V6a2 2 0 012-2h2a2 2 0 012 2v1"/><path d="M3 12h18"/>
          </svg>
          <span>Portfolio &amp; Wallets</span>
          {fundedCount > 0 && <span className="nav-badge" style={{ background: "var(--ok)", color: "#16191F" }}>{fundedCount}</span>}
        </button>

        <button
          type="button"
          className={`nav-itm ${activeNav === "trading" ? "active" : ""}`}
          onClick={() => setActiveNav?.("trading")}
          data-tooltip={isCollapsed ? "DEX swaps and wallet transfers" : undefined}
          data-tooltip-pos="right"
        >
          <svg className="nic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
          </svg>
          <span>Trading</span>
        </button>

        <button
          type="button"
          className={`nav-itm ${activeNav === "activity" ? "active" : ""}`}
          onClick={() => setActiveNav?.("activity")}
          data-tooltip={isCollapsed ? "Activity & Vault Logs" : undefined}
          data-tooltip-pos="right"
        >
          <svg className="nic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l3-8 4 16 3-8h4"/>
          </svg>
          <span>Activity</span>
        </button>

        <div className="nav-label">Operations</div>

        <button
          type="button"
          className={`nav-itm ${activeNav === "import" ? "active" : ""}`}
          onClick={() => setActiveNav?.("import")}
          data-tooltip={isCollapsed ? "Import Wallet" : undefined}
          data-tooltip-pos="right"
        >
          <svg className="nic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>
          </svg>
          <span>Import Wallet</span>
        </button>

        <button
          type="button"
          className={`nav-itm ${activeNav === "repair" ? "active" : ""}`}
          onClick={() => setActiveNav?.("repair")}
          data-tooltip={isCollapsed ? "Mnemonic Typo Repair & Forensics" : undefined}
          data-tooltip-pos="right"
        >
          <svg className="nic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="4.5"/><path d="M8 12.5V20M8 16.5h.01M15.5 5.2a4.5 4.5 0 010 8.6M15.5 11.5V20"/>
          </svg>
          <span>Typo Repair</span>
          <span className="nav-badge" style={{ background: "var(--accent)", color: "#16191F" }}>PRO</span>
        </button>

        <div className="nav-label">Security &amp; Network</div>

        <button
          type="button"
          className="nav-itm disabled"
          disabled
          data-tooltip="Token Allowances · Coming Soon"
          data-tooltip-pos="right"
        >
          <svg className="nic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7 3v5c0 4.6-3 8.7-7 10-4-1.3-7-5.4-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>
          </svg>
          <span>Allowances</span>
          <span className="nav-badge soon">SOON</span>
        </button>

        <button
          type="button"
          className={`nav-itm ${activeNav === "rpc" ? "active" : ""}`}
          onClick={() => setActiveNav?.("rpc")}
          data-tooltip={isCollapsed ? "RPC Node Manager" : undefined}
          data-tooltip-pos="right"
        >
          <svg className="nic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/>
            <path d="M7 7.5h.01M7 16.5h.01M11 7.5h.01M11 16.5h.01"/>
          </svg>
          <span>RPC Manager</span>
        </button>
      </nav>

      {/* Bottom Shield & Collapse Controls */}
      <div className="sb-bottom">
        <div className="sb-sec">
          <span className="shield">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7 3v5c0 4.6-3 8.7-7 10-4-1.3-7-5.4-7-10V6l7-3z"/>
            </svg>
          </span>
          <div>
            <b>Active Shield</b>
            <span>Argon2id · AES-256 GCM</span>
          </div>
        </div>

        <div className="sb-colidx">
          <button
            type="button"
            className="sb-col"
            onClick={() => setIsCollapsed?.((prev) => !prev)}
            data-tooltip={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            data-tooltip-pos="right"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9.5 4v16"/>
            </svg>
          </button>
          <button
            type="button"
            className="sb-col"
            onClick={lock}
            data-tooltip="Lock Vault Immediately (Ctrl+L)"
            data-tooltip-pos="right"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
