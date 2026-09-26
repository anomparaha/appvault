import { IconArrowLeft, IconCheckCircle, IconShield, IconZap } from "../../icons";

interface AllowancesWorkspaceProps {
  onBack?: () => void;
}

export function AllowancesWorkspace({ onBack }: AllowancesWorkspaceProps) {
  return (
    <div className="import-workspace-view" style={{ maxWidth: "900px" }}>
      {/* Header */}
      <div className="page-head" style={{ marginBottom: "24px" }}>
        <div className="grow">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            {onBack && (
              <button
                type="button"
                className="btn sm"
                onClick={onBack}
                style={{ height: "26px", padding: "0 8px" }}
              >
                <IconArrowLeft size={13} />
                <span>Back</span>
              </button>
            )}
            <h1>Token Allowances &amp; Revoke Guard</h1>
          </div>
          <p>Scan smart contract spending permissions and revoke unauthorized token allowances across your wallets.</p>
        </div>

        <div className="page-head-actions">
          <span className="badge" style={{ background: "var(--surface-3)", color: "var(--text-dim)", border: "1px solid var(--border)", height: "26px", padding: "0 10px", fontSize: "10.5px" }}>
            Coming Soon
          </span>
        </div>
      </div>

      {/* Feature Preview Card */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "28px 24px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "24px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <IconShield size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
              Anti-Drainer Smart Contract Protection
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
              When you interact with DeFi protocols, you grant token spending allowances. If a protocol gets compromised, lingering allowances can be exploited by drainers. Plurivex Token Revoke Guard audits and resets these allowances to zero.
            </p>
          </div>
        </div>

        {/* 3 Protection Capabilities */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ color: "var(--ok)", display: "inline-flex" }}><IconCheckCircle size={15} /></span>
              <b style={{ fontSize: "12px", color: "var(--text)" }}>Unlimited Approval Audit</b>
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
              Detects high-risk contracts granted unlimited token allowances (<code className="mono" style={{ fontSize: "10px" }}>type(uint256).max</code>).
            </p>
          </div>

          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ color: "var(--accent)", display: "inline-flex" }}><IconZap size={15} /></span>
              <b style={{ fontSize: "12px", color: "var(--text)" }}>1-Click Batch Revoke</b>
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
              Generates zero-allowance transactions to revoke permissions across multiple wallets simultaneously.
            </p>
          </div>

          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ color: "var(--warning)", display: "inline-flex" }}><IconShield size={15} /></span>
              <b style={{ fontSize: "12px", color: "var(--text)" }}>Known Exploit Watchlist</b>
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
              Cross-references approved router contracts against known phishing and drainer contract databases.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "18px", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "10px" }}>
          <span style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>
            Status: <b style={{ color: "var(--text)" }}>In Active Development</b>
          </span>
          <button
            type="button"
            className="btn"
            disabled={true}
            style={{ opacity: 0.6, cursor: "not-allowed", fontSize: "11px" }}
          >
            Revoke Engine in Development
          </button>
        </div>
      </div>
    </div>
  );
}
