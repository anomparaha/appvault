import { balanceAmount, formatCompactBalance, type Chain } from "../../../lib/chains/chains";
import { ChainIcon } from "../../../icons/ChainIcon";

export function BalanceCard({ chain, value }: { chain: Chain; value: string | null }) {
  const num = value && value !== "loading" && value !== "error" ? balanceAmount(value) : 0;
  const state = value === "loading" ? "loading" : value === "error" ? "error" : num > 0 ? "positive" : "zero";

  return (
    <div className={`bal-card bal-${chain.key}`} style={{ "--chain-color": chain.color } as React.CSSProperties}>
      <div className="bal-card-top">
        <div className="bal-card-chain-meta">
          <ChainIcon chain={chain.key} size={16} />
          <span className="bal-card-name">{chain.label}</span>
        </div>
        <span className={`bal-card-status-dot ${state === "positive" ? "live" : ""}`} data-tooltip={state === "positive" ? "Active balance detected" : "Chain idle / ready"} />
      </div>
      <div className={`bal-card-val ${state}`}>
        {value === "loading" && <span className="bal-spinner" />}
        {value === "error" && "Failed"}
        {value && value !== "loading" && value !== "error" && formatCompactBalance(value)}
        {!value && <span className="bal-pending">Not scanned</span>}
      </div>
      <div className="bal-card-sub">
        {state === "positive" ? "Native Liquid Asset" : "0.00 Gas Reserve"}
      </div>
    </div>
  );
}
