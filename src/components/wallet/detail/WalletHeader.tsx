import { IconChartPie, IconRefresh, IconHistory, IconScan, IconTrash } from "../../../icons";
import { useApp } from "../../../context/AppContext";
import type { WalletType } from "../../../lib/types/index";

export type DetailMode = "portfolio" | "trading" | "explorer";

interface AllocationItem {
  chain: string;
  label: string;
  color: string;
  usd: number;
  pct: number;
}

interface WalletHeaderProps {
  activeTab: DetailMode;
  setActiveTab: (t: DetailMode) => void;
  walletType: WalletType;
  hasFunds: boolean;
  walletLabel: string | null;
  isEditingTag: boolean;
  tagInput: string;
  setTagInput: (val: string) => void;
  setIsEditingTag: (val: boolean) => void;
  saveTag: () => void;
  onSetPresetTag: (tag: string) => void;
  onScan: () => void;
  onDelete: () => void;
  hasScanTarget: boolean;
  scanning: boolean;
  totalUsd: number;
  allocations: AllocationItem[];
}

export function WalletHeader({
  activeTab,
  setActiveTab,
  walletType,
  hasFunds,
  walletLabel,
  isEditingTag,
  tagInput,
  setTagInput,
  setIsEditingTag,
  saveTag,
  onSetPresetTag,
  onScan,
  onDelete,
  hasScanTarget,
  scanning,
  totalUsd,
  allocations,
}: WalletHeaderProps) {
  const { pricing } = useApp();
  const valuation = pricing.formatValuation(totalUsd);

  return (
    <>
      {/* 1. Multi-Mode Workspace Header Tabs */}
      <div className="workspace-tabs-bar">
        <button
          type="button"
          className={`workspace-tab ${activeTab === "portfolio" ? "active" : ""}`}
          onClick={() => setActiveTab("portfolio")}
        >
          <IconChartPie size={13} /> Portfolio & Balances
        </button>
        <button
          type="button"
          className={`workspace-tab ${activeTab === "trading" ? "active" : ""}`}
          onClick={() => setActiveTab("trading")}
        >
          <IconRefresh size={13} /> Trading
        </button>
        <button
          type="button"
          className={`workspace-tab ${activeTab === "explorer" ? "active" : ""}`}
          onClick={() => setActiveTab("explorer")}
        >
          <IconHistory size={13} /> Explorer & Diagnostics
        </button>
      </div>

      {/* 2. Executive Hero Identity & Balance Overview */}
      <div className="hero-executive-card">
        <div className="hero-top-row">
          <div className="hero-tags-group">
            <span className={`hero-type-badge badge-${walletType.toLowerCase()}`}>{walletType}</span>
            {hasFunds && <span className="hero-funded-pill">● HAS BALANCE</span>}

            {/* Editable Label Tag */}
            <div className="detail-tag-cluster">
              {isEditingTag ? (
                <div className="tag-inline-form">
                  <input
                    type="text"
                    className="input-base tag-input-sm"
                    placeholder="Tag name…"
                    value={tagInput}
                    autoFocus
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTag();
                      if (e.key === "Escape") setIsEditingTag(false);
                    }}
                  />
                  <button type="button" className="btn-tag-action btn-tag-save" onClick={saveTag}>✓</button>
                  <button type="button" className="btn-tag-action btn-tag-cancel" onClick={() => setIsEditingTag(false)}>✕</button>
                </div>
              ) : (
                <div className="tag-pills-row">
                  <button
                    type="button"
                    className={`tag-display-btn ${walletLabel ? `tag-${walletLabel.toLowerCase()}` : "tag-none"}`}
                    onClick={() => { setTagInput(walletLabel || ""); setIsEditingTag(true); }}
                    data-tooltip="Click to edit label"
                  >
                    {walletLabel ? walletLabel : "+ Add Tag"}
                  </button>
                  {["Main", "Airdrop", "Whales", "Burner"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`tag-preset-chip ${walletLabel?.toLowerCase() === p.toLowerCase() ? "active" : ""}`}
                      onClick={() => onSetPresetTag(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="hero-actions-toolbar">
            <button
              type="button"
              className={`btn-hero-action btn-hero-scan ${scanning ? "is-scanning" : ""}`}
              onClick={onScan}
              disabled={!hasScanTarget || scanning}
              data-tooltip="Rescan balances across all configured chains"
            >
              <IconScan size={13} className={scanning ? "spin-scan" : ""} />
              <span>{scanning ? "Scanning…" : "Rescan Wallet"}</span>
            </button>
            <button
              type="button"
              className="btn-hero-action btn-hero-delete"
              onClick={onDelete}
              data-tooltip="Remove wallet from vault"
            >
              <IconTrash size={13} />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {/* Compact Valuation Bar with Multi-Currency Selector */}
        {totalUsd > 0 && (
          <div className="hero-valuation-strip">
            <div className="valuation-strip-left">
              <span className="val-strip-lbl">ESTIMATED NET ASSETS:</span>
              <div
                className="val-strip-val mono"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                <span>{valuation.primary}</span>
                {valuation.secondary && (
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 500 }}>
                    ({valuation.secondary})
                  </span>
                )}
                {pricing.priceReport?.stale && (
                  <span
                    className="val-offline-badge"
                    data-tooltip="Estimated value based on cached / offline rates"
                    style={{
                      fontSize: "9.5px",
                      padding: "1px 6px",
                      borderRadius: "999px",
                      background: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.28)",
                      color: "#f59e0b",
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      marginLeft: "2px",
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                    Offline
                  </span>
                )}
              </div>

              {/* Fiat Currency Selector Dropdown */}
              <select
                className="val-currency-select mono"
                value={pricing.currency}
                onChange={(e) => pricing.setCurrency(e.target.value)}
                aria-label="Valuation currency selector"
                data-tooltip="Select valuation currency (Default: USD)"
                style={{
                  background: "var(--card-bg, #1a1b26)",
                  color: "var(--accent, #7aa2f7)",
                  border: "1px solid var(--border, #2f3549)",
                  borderRadius: "4px",
                  padding: "1px 6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none",
                  marginLeft: "4px",
                }}
              >
                {pricing.supportedCurrencies.map((c) => (
                  <option
                    key={c.code}
                    value={c.code}
                    style={{ background: "#1a1b26", color: "#c0caf5" }}
                  >
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
            <div className="valuation-strip-right">
              {allocations.map((a) => (
                <span key={a.label} className="val-alloc-tag">
                  <span className="alloc-dot" style={{ background: a.color }} />
                  {a.label} {a.pct}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
