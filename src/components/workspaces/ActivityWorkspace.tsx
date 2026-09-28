import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../context/AppContext";
import {
  getActivities,
  clearActivities,
  subscribeActivities,
  formatActivityTime,
  exportActivitiesCsv,
  exportActivitiesJson,
  type ActivityRecord,
} from "../../lib/services/activity";
import {
  IconSearch,
  IconShield,
  IconScan,
  IconZap,
  IconImport,
  IconExport,
  IconTrash,
  IconWallet,
  IconTrendingUp,
  ChainIcon,
} from "../../icons";
import { WinRateCard } from "../analytics/WinRateCard";

interface ActivityWorkspaceProps {
  onBack?: () => void;
  onOpenSweeper?: () => void;
}

export function ActivityWorkspace({ onBack, onOpenSweeper }: ActivityWorkspaceProps) {
  const { wallets, isAirGapped, toast } = useApp();
  const [activities, setActivities] = useState<ActivityRecord[]>(() => getActivities());
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeActivities((latest) => {
      setActivities(latest);
    });
    return unsub;
  }, []);

  const counts = useMemo(() => {
    const res: Record<string, number> = {
      all: activities.length,
      sweep: 0,
      scan: 0,
      import: 0,
      security: 0,
      export: 0,
      trade: 0,
    };
    for (const a of activities) {
      if (a.type in res) {
        res[a.type]++;
      }
    }
    return res;
  }, [activities]);

  const filtered = useMemo(() => {
    return activities.filter((item) => {
      if (filterType !== "all" && item.type !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (item.title || "").toLowerCase().includes(q);
        const matchDesc = (item.desc || "").toLowerCase().includes(q);
        const matchTx = (item.txHash || "").toLowerCase().includes(q);
        const matchChain = (item.chain || "").toLowerCase().includes(q);
        const matchSender = (item.sender || "").toLowerCase().includes(q);
        const matchRecipient = (item.recipient || "").toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchTx && !matchChain && !matchSender && !matchRecipient) {
          return false;
        }
      }
      return true;
    });
  }, [activities, filterType, searchQuery]);

  // Group filtered activities chronologically
  const groupedActivities = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: { label: string; items: ActivityRecord[] }[] = [
      { label: "Today", items: [] },
      { label: "Yesterday", items: [] },
      { label: "Earlier This Week", items: [] },
      { label: "Older Records", items: [] },
    ];

    for (const item of filtered) {
      const d = new Date(item.timestamp);
      if (d >= today) {
        groups[0].items.push(item);
      } else if (d >= yesterday) {
        groups[1].items.push(item);
      } else if (d >= lastWeek) {
        groups[2].items.push(item);
      } else {
        groups[3].items.push(item);
      }
    }

    return groups.filter((g) => g.items.length > 0);
  }, [filtered]);

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all activity audit logs? This action is irreversible.")) {
      clearActivities();
      toast("Activity logs cleared", "info");
    }
  };

  const handleCopyText = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast(`Copied ${fieldName} to clipboard`, "success");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast("Failed to copy to clipboard", "error");
    }
  };

  const handleCopyForensicJson = () => {
    if (!selectedActivity) return;
    const jsonStr = JSON.stringify(selectedActivity, null, 2);
    handleCopyText(jsonStr, "Forensic JSON Record");
  };

  return (
    <div className="activity-workspace-view">
      {/* ── Page Header ── */}
      <div className="page-head">
        <div className="grow">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            {onBack && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onBack}
                style={{ height: "26px", padding: "0 8px", fontSize: "11px" }}
              >
                ← Dashboard
              </button>
            )}
            <h1 style={{ margin: 0 }}>Activity &amp; Vault Audit Log</h1>
          </div>
          <p>Real-time forensic ledger of asset sweeps, balance scans, credential imports, and vault security events.</p>
        </div>

        <div className="page-head-actions" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={exportActivitiesCsv}
            disabled={activities.length === 0}
            style={{ fontSize: "11px", height: "28px" }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={exportActivitiesJson}
            disabled={activities.length === 0}
            style={{ fontSize: "11px", height: "28px" }}
          >
            Export JSON
          </button>
          {activities.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleClearAll}
              style={{ fontSize: "11px", height: "28px", color: "var(--danger)" }}
            >
              <IconTrash size={12} /> Clear
            </button>
          )}
          <span
            className="badge"
            style={{
              background: "rgba(34, 197, 94, 0.12)",
              color: "var(--ok)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              height: "28px",
              padding: "0 10px",
              fontSize: "10.5px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--ok)" }}></span>
            Live Audit Active
          </span>
        </div>
      </div>

      {/* ── Binance Web3 Style Win Rate & Performance Tracker ── */}
      <WinRateCard />

      {/* ── Metric Summary Deck ── */}
      <div className="activity-metrics-grid">
        <div className="activity-metric-card">
          <div className="activity-metric-label">
            <span>Sweeper Executions</span>
            <IconZap size={13} />
          </div>
          <div className="activity-metric-val">
            <span>{counts.sweep}</span>
            <span style={{ fontSize: "11px", color: "var(--ok)", fontWeight: "600" }}>Broadcasts</span>
          </div>
          <div className="activity-metric-sub">Multi-wallet asset consolidation</div>
        </div>

        <div className="activity-metric-card">
          <div className="activity-metric-label">
            <span>Balance Scans</span>
            <IconScan size={13} />
          </div>
          <div className="activity-metric-val">
            <span>{counts.scan}</span>
            <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: "600" }}>Passes</span>
          </div>
          <div className="activity-metric-sub">Multi-chain node verification</div>
        </div>

        <div className="activity-metric-card">
          <div className="activity-metric-label">
            <span>Security Posture</span>
            <IconShield size={13} />
          </div>
          <div className="activity-metric-val" style={{ color: isAirGapped ? "var(--warning)" : "var(--ok)" }}>
            <span style={{ fontSize: "14.5px" }}>{isAirGapped ? "Safe Mode" : "App RPC"}</span>
          </div>
          <div className="activity-metric-sub">
            {isAirGapped ? "App-level network gate enabled" : "Configured app network paths enabled"}
          </div>
        </div>

        <div className="activity-metric-card">
          <div className="activity-metric-label">
            <span>Encrypted Vault</span>
            <IconWallet size={13} />
          </div>
          <div className="activity-metric-val">
            <span>{wallets.length}</span>
            <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: "600" }}>Addresses</span>
          </div>
          <div className="activity-metric-sub">Argon2id local database storage</div>
        </div>
      </div>

      {/* ── Filter & Search Bar ── */}
      <div className="activity-filter-bar">
        <div className="activity-filter-pills">
          <button
            type="button"
            className={`btn-filter-pill ${filterType === "all" ? "active" : ""}`}
            onClick={() => setFilterType("all")}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            className={`btn-filter-pill ${filterType === "sweep" ? "active" : ""}`}
            onClick={() => setFilterType("sweep")}
          >
            Sweeper ({counts.sweep})
          </button>
          <button
            type="button"
            className={`btn-filter-pill ${filterType === "trade" ? "active" : ""}`}
            onClick={() => setFilterType("trade")}
          >
            Trades ({counts.trade})
          </button>
          <button
            type="button"
            className={`btn-filter-pill ${filterType === "scan" ? "active" : ""}`}
            onClick={() => setFilterType("scan")}
          >
            Scanning ({counts.scan})
          </button>
          <button
            type="button"
            className={`btn-filter-pill ${filterType === "import" ? "active" : ""}`}
            onClick={() => setFilterType("import")}
          >
            Imports ({counts.import})
          </button>
          <button
            type="button"
            className={`btn-filter-pill ${filterType === "security" ? "active" : ""}`}
            onClick={() => setFilterType("security")}
          >
            Security ({counts.security})
          </button>
          <button
            type="button"
            className={`btn-filter-pill ${filterType === "export" ? "active" : ""}`}
            onClick={() => setFilterType("export")}
          >
            Exports ({counts.export})
          </button>
        </div>

        <div className="activity-search-box">
          <span style={{ color: "var(--text-dim)", display: "flex", alignItems: "center" }}>
            <IconSearch size={13} />
          </span>
          <input
            type="text"
            placeholder="Search by title, tx hash, address, or network..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              padding: "0",
              fontSize: "11.5px",
              color: "var(--text)",
              outline: "none",
              width: "100%",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: "0" }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Activities Card Container ── */}
      <div className="card pad" style={{ padding: "8px 16px" }}>
        {groupedActivities.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-dim)" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>📜</div>
            <strong style={{ color: "var(--text)", fontSize: "13.5px" }}>No Activities Found</strong>
            <p style={{ fontSize: "11.5px", marginTop: "6px", maxWidth: "420px", marginInline: "auto" }}>
              {searchQuery || filterType !== "all"
                ? "No activity logs match your search criteria. Try adjusting filters."
                : "No actions have been executed yet. Run a multi-chain balance scan or sweep liquid funds to view records."}
            </p>
            {onOpenSweeper && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onOpenSweeper}
                style={{ marginTop: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <IconZap size={13} /> Open Fund Sweeper
              </button>
            )}
          </div>
        ) : (
          groupedActivities.map((group) => (
            <div key={group.label} style={{ marginBottom: "14px" }}>
              <div className="activity-timeline-header">{group.label}</div>
              {group.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="act-row clickable"
                  onClick={() => setSelectedActivity(item)}
                  style={{
                    padding: "11px 8px",
                    borderBottom: idx === group.items.length - 1 ? "none" : "1px solid var(--border-subtle, rgba(255, 255, 255, 0.05))",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Type Icon */}
                  <span
                    className="aic"
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "9px",
                      background:
                        item.status === "failed"
                          ? "rgba(239, 68, 68, 0.12)"
                          : item.type === "sweep"
                          ? "rgba(204, 255, 0, 0.12)"
                          : item.type === "trade"
                          ? "rgba(59, 130, 246, 0.15)"
                          : item.type === "security"
                          ? "rgba(59, 130, 246, 0.12)"
                          : item.type === "scan"
                          ? "rgba(16, 185, 129, 0.12)"
                          : "var(--surface-3)",
                      color:
                        item.status === "failed"
                          ? "var(--danger)"
                          : item.type === "sweep"
                          ? "var(--accent)"
                          : item.type === "trade"
                          ? "#60a5fa"
                          : item.type === "security"
                          ? "#60a5fa"
                          : item.type === "scan"
                          ? "var(--ok)"
                          : "var(--text)",
                      flexShrink: 0,
                      marginTop: "2px",
                    }}
                  >
                    {item.type === "sweep" ? (
                      <IconZap size={16} />
                    ) : item.type === "trade" ? (
                      <IconTrendingUp size={16} />
                    ) : item.type === "security" ? (
                      <IconShield size={16} />
                    ) : item.type === "scan" ? (
                      <IconScan size={16} />
                    ) : item.type === "import" ? (
                      <IconImport size={16} />
                    ) : item.type === "export" ? (
                      <IconExport size={16} />
                    ) : (
                      <IconShield size={16} />
                    )}
                  </span>

                  {/* Title & Description */}
                  <div className="act-txt" style={{ marginLeft: "8px", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <b style={{ fontSize: "12.5px", color: "var(--text)" }}>{item.title}</b>
                      
                      {item.chain && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "9px",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "var(--surface-3)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                            textTransform: "uppercase",
                            fontWeight: 650,
                          }}
                        >
                          <ChainIcon chain={item.chain} size={10} />
                          {item.chain}
                        </span>
                      )}

                      <span
                        className={`badge ${
                          item.status === "success"
                            ? "b-ok"
                            : item.status === "failed"
                            ? "b-warn"
                            : item.status === "warning"
                            ? "b-warn"
                            : "b-ghost"
                        }`}
                        style={{ fontSize: "8.5px", height: "16px", padding: "0 6px" }}
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </div>

                    <span style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "3px", display: "block", lineHeight: 1.45 }}>
                      {item.desc}
                    </span>

                    {/* Tx Hash preview */}
                    {item.txHash && (
                      <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>Tx:</span>
                        <span className="mono" style={{ fontSize: "10px", color: "var(--accent)" }}>
                          {item.txHash.slice(0, 10)}...{item.txHash.slice(-8)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Amount & Time */}
                  <div className="act-status-col" style={{ textAlign: "right", flexShrink: 0, marginLeft: "12px" }}>
                    {item.amount && (
                      <span
                        className="amt mono"
                        style={{
                          color: item.amountColor || (item.status === "success" ? "var(--ok)" : "var(--text)"),
                          fontSize: "11.5px",
                          fontWeight: "700",
                          display: "block",
                        }}
                      >
                        {item.amount}
                      </span>
                    )}
                    <span className="t" style={{ fontSize: "10.5px", color: "var(--text-dim)", marginTop: "2px", display: "block" }}>
                      {formatActivityTime(item.timestamp)}
                    </span>
                    <span style={{ fontSize: "9.5px", color: "var(--accent)", marginTop: "3px", display: "block" }}>
                      Inspect →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── Forensic Activity Inspector Modal ── */}
      {selectedActivity && createPortal(
        <div className="forensic-modal-backdrop" onClick={() => setSelectedActivity(null)}>
          <div className="forensic-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="forensic-modal-head">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--surface-3)",
                    color: "var(--accent)",
                  }}
                >
                  {selectedActivity.type === "sweep" ? (
                    <IconZap size={14} />
                  ) : selectedActivity.type === "scan" ? (
                    <IconScan size={14} />
                  ) : selectedActivity.type === "import" ? (
                    <IconImport size={14} />
                  ) : selectedActivity.type === "export" ? (
                    <IconExport size={14} />
                  ) : (
                    <IconShield size={14} />
                  )}
                </span>
                <div>
                  <h4 style={{ margin: 0, fontSize: "13.5px", color: "var(--text)" }}>Forensic Audit Inspector</h4>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>ID: {selectedActivity.id}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedActivity(null)}
                style={{ padding: "2px 8px", fontSize: "14px", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div className="forensic-modal-body">
              {/* Event Title & Status Banner */}
              <div className="forensic-field-box">
                <div className="forensic-field-label">Action &amp; Outcome</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                  <b style={{ fontSize: "13px", color: "var(--text)" }}>{selectedActivity.title}</b>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {selectedActivity.chain && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "9.5px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: "var(--surface-3)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          textTransform: "uppercase",
                          fontWeight: 650,
                        }}
                      >
                        <ChainIcon chain={selectedActivity.chain} size={11} />
                        {selectedActivity.chain}
                      </span>
                    )}
                    <span
                      className={`badge ${
                        selectedActivity.status === "success"
                          ? "b-ok"
                          : selectedActivity.status === "failed"
                          ? "b-warn"
                          : selectedActivity.status === "warning"
                          ? "b-warn"
                          : "b-ghost"
                      }`}
                      style={{ fontSize: "9px", padding: "1px 8px" }}
                    >
                      {selectedActivity.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "11.5px", color: "var(--text-dim)", lineHeight: 1.5 }}>
                  {selectedActivity.desc}
                </p>
              </div>

              {/* Timestamp Forensic Details */}
              <div className="forensic-field-box">
                <div className="forensic-field-label">Timestamp Precision</div>
                <div className="forensic-field-val">
                  <span className="mono">{new Date(selectedActivity.timestamp).toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" })}</span>
                  <span className="mono" style={{ color: "var(--text-dim)", fontSize: "10.5px" }}>({selectedActivity.timestamp} ms)</span>
                </div>
              </div>

              {/* Amount / Volume (if applicable) */}
              {selectedActivity.amount && (
                <div className="forensic-field-box">
                  <div className="forensic-field-label">Recorded Value</div>
                  <div className="forensic-field-val">
                    <strong style={{ fontSize: "14px", color: selectedActivity.amountColor || "var(--ok)" }}>
                      {selectedActivity.amount}
                    </strong>
                    <span className="badge b-ghost" style={{ fontSize: "9px" }}>SETTLED</span>
                  </div>
                </div>
              )}

              {/* Transaction Hash & Explorer Link */}
              {selectedActivity.txHash && (
                <div className="forensic-field-box">
                  <div className="forensic-field-label">On-Chain Transaction Hash</div>
                  <div className="forensic-field-val">
                    <code className="mono" style={{ fontSize: "11px", color: "var(--accent)" }}>
                      {selectedActivity.txHash}
                    </code>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleCopyText(selectedActivity.txHash!, "Transaction Hash")}
                      style={{ fontSize: "10px", padding: "2px 6px", height: "22px" }}
                    >
                      {copiedField === "Transaction Hash" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  {selectedActivity.explorerUrl && (
                    <div style={{ marginTop: "8px" }}>
                      <a
                        href={selectedActivity.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "11px",
                          color: "var(--accent)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          textDecoration: "underline",
                        }}
                      >
                        Open Official Block Explorer ↗
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Sender & Recipient Addresses (if applicable) */}
              {selectedActivity.sender && (
                <div className="forensic-field-box">
                  <div className="forensic-field-label">Origin Sender Address</div>
                  <div className="forensic-field-val">
                    <code className="mono" style={{ fontSize: "11px" }}>{selectedActivity.sender}</code>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleCopyText(selectedActivity.sender!, "Sender Address")}
                      style={{ fontSize: "10px", padding: "2px 6px", height: "22px" }}
                    >
                      {copiedField === "Sender Address" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              {selectedActivity.recipient && (
                <div className="forensic-field-box">
                  <div className="forensic-field-label">Recipient Address</div>
                  <div className="forensic-field-val">
                    <code className="mono" style={{ fontSize: "11px" }}>{selectedActivity.recipient}</code>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleCopyText(selectedActivity.recipient!, "Recipient Address")}
                      style={{ fontSize: "10px", padding: "2px 6px", height: "22px" }}
                    >
                      {copiedField === "Recipient Address" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              {/* Structured Metadata Tree (if present) */}
              {selectedActivity.metadata && Object.keys(selectedActivity.metadata).length > 0 && (
                <div className="forensic-field-box">
                  <div className="forensic-field-label">Structured Execution Metadata</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginTop: "4px" }}>
                    {Object.entries(selectedActivity.metadata).map(([k, v]) => (
                      <div key={k} style={{ background: "var(--surface-2)", padding: "6px 8px", borderRadius: "4px" }}>
                        <span style={{ fontSize: "9.5px", color: "var(--text-dim)", textTransform: "uppercase", display: "block" }}>
                          {k}
                        </span>
                        <strong className="mono" style={{ fontSize: "11px", color: "var(--text)" }}>
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="forensic-modal-foot">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCopyForensicJson}
                style={{ fontSize: "11px", height: "28px" }}
              >
                {copiedField === "Forensic JSON Record" ? "✓ JSON Copied!" : "Copy Full JSON"}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setSelectedActivity(null)}
                style={{ fontSize: "11px", height: "28px", padding: "0 14px" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
