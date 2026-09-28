import { useCallback, useState } from "react";
import { useApp } from "../../context/AppContext";
import type { WalletView } from "../../lib/types/index";
import { DexBatchTrader } from "./DexBatchTrader";
import { SweeperWorkspace } from "../workspaces/SweeperWorkspace";

export type TradingMode = "swap" | "transfer";

interface TradingWorkspaceProps {
  mode?: TradingMode;
  onModeChange?: (mode: TradingMode) => void;
  wallet?: WalletView;
}

export function TradingWorkspace({ mode, onModeChange, wallet }: TradingWorkspaceProps) {
  const { sessionToken, isAirGapped, networkSessionReady } = useApp();
  const [localMode, setLocalMode] = useState<TradingMode>(mode ?? "swap");
  const activeMode = mode ?? localMode;
  const [busyMode, setBusyMode] = useState<TradingMode | null>(null);

  const handleModeChange = useCallback((nextMode: TradingMode) => {
    if (busyMode !== null) return;
    if (mode === undefined) setLocalMode(nextMode);
    onModeChange?.(nextMode);
  }, [busyMode, mode, onModeChange]);

  const reportSwapBusy = useCallback((busy: boolean) => {
    setBusyMode((current) => busy ? "swap" : current === "swap" ? null : current);
  }, []);
  const reportTransferBusy = useCallback((busy: boolean) => {
    setBusyMode((current) => busy ? "transfer" : current === "transfer" ? null : current);
  }, []);

  const sessionLabel = isAirGapped
    ? "Safe Mode is on"
    : !sessionToken
      ? "Vault locked"
      : !networkSessionReady
        ? "Checking secure network access…"
        : "Vault session ready";
  const sessionClass = isAirGapped || !sessionToken || !networkSessionReady ? "is-blocked" : "is-ready";

  return (
    <div className="trading-workspace">
      <header className="trading-workspace-heading">
        <div className="trading-title-copy">
          <div className="trading-eyebrow"><span /> MULTI-WALLET OPERATIONS</div>
          <h1>Trading workspace</h1>
          <p>Swap tokens or transfer balances from one focused workspace. Each action keeps its own setup, review, and confirmation flow.</p>
        </div>
        <div className={`trading-session-pill ${sessionClass}`}>
          <i /> {sessionLabel}
        </div>
      </header>

      <div className="trading-mode-tabs" role="tablist" aria-label="Trading action">
        <button
          type="button"
          id="trading-tab-swap"
          role="tab"
          aria-controls="trading-panel-swap"
          aria-selected={activeMode === "swap"}
          className={`trading-mode-tab ${activeMode === "swap" ? "active" : ""}`}
          onClick={() => handleModeChange("swap")}
          disabled={busyMode !== null}
        >
          <span className="trading-mode-icon" aria-hidden="true">↗</span>
          <span className="trading-mode-copy"><b>DEX swap</b><small>Buy or sell through a DEX route</small></span>
          <span className="trading-mode-arrow" aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          id="trading-tab-transfer"
          role="tab"
          aria-controls="trading-panel-transfer"
          aria-selected={activeMode === "transfer"}
          className={`trading-mode-tab ${activeMode === "transfer" ? "active" : ""}`}
          onClick={() => handleModeChange("transfer")}
          disabled={busyMode !== null}
        >
          <span className="trading-mode-icon" aria-hidden="true">⇄</span>
          <span className="trading-mode-copy"><b>Transfer &amp; sweep</b><small>Move native assets or SPL tokens to a recipient</small></span>
          <span className="trading-mode-arrow" aria-hidden="true">→</span>
        </button>
      </div>

      <div className="trading-view-heading">
        <div>
          <h2>{activeMode === "swap" ? "Swap setup" : "Transfer setup"}</h2>
          <p>{activeMode === "swap"
            ? "Configure a single-wallet trade or an explicit multi-wallet batch."
            : "Move native balances or Solana SPL tokens to one destination address."}</p>
        </div>
        <span className="trading-view-note">
          {activeMode === "swap"
            ? <><b>Solana route</b> · not live-tested</>
            : <><b>No swap action</b> · transfers only</>}
        </span>
      </div>

      <div
        id="trading-panel-swap"
        className="trading-mode-panel"
        role="tabpanel"
        aria-labelledby="trading-tab-swap"
        hidden={activeMode !== "swap"}
      >
        <DexBatchTrader wallet={wallet} active={activeMode === "swap"} onBusyChange={reportSwapBusy} />
      </div>
      <div
        id="trading-panel-transfer"
        className="trading-mode-panel"
        role="tabpanel"
        aria-labelledby="trading-tab-transfer"
        hidden={activeMode !== "transfer"}
      >
        <SweeperWorkspace wallet={wallet} active={activeMode === "transfer"} onBusyChange={reportTransferBusy} />
      </div>
    </div>
  );
}
