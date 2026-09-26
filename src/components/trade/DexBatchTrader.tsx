import { useState } from "react";
import { useApp } from "../../context/AppContext";
import { ChainIcon, IconTrendingUp, IconTrendingDown, IconTarget, IconZap } from "../../icons";
import type { WalletView } from "../../lib/types/index";
import { OFFICIAL_TOKEN_SPEC } from "../../services/officialTokenService";

export function DexBatchTrader({ wallet: _wallet }: { wallet?: WalletView }) {
  const { selectedSweepIds } = useApp();
  const [selectedChain, setSelectedChain] = useState<"eth" | "robinhood" | "base" | "arb" | "bsc" | "sol">("eth");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tradeAction, setTradeAction] = useState<"buy" | "sell">("buy");
  const [amountPerWallet, setAmountPerWallet] = useState("0.05");
  const [slippage, setSlippage] = useState("1.0");
  const [traderMode, setTraderMode] = useState<"distributed" | "sweep">("distributed");
  const activeWalletsCount = selectedSweepIds.size > 0 ? selectedSweepIds.size : 1;

  return (
    <div className="dex-trader-panel">
      {/* 1. Header Banner */}
      <div className="dex-header">
        <div className="dex-title-box">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span className="dex-badge">MULTI-WALLET SWAP ENGINE</span>
            <span className="dex-badge-warning" style={{ background: "var(--surface-3)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>COMING SOON</span>
          </div>
          <h3>DEX Batch Trader</h3>
          <p>Multi-wallet parallel swap execution on Uniswap, PancakeSwap, and Raydium is currently in development.</p>
        </div>
        <div className="dex-mode-pills">
          <button
            type="button"
            className={`mode-pill ${tradeAction === "buy" ? "active-buy" : ""}`}
            onClick={() => setTradeAction("buy")}
          >
            <IconTrendingUp size={13} /> Batch Buy
          </button>
          <button
            type="button"
            className={`mode-pill ${tradeAction === "sell" ? "active-sell" : ""}`}
            onClick={() => setTradeAction("sell")}
          >
            <IconTrendingDown size={13} /> Batch Sell
          </button>
        </div>
      </div>

      {/* 2. Form Grid */}
      <div className="dex-form-grid">
        {/* Network Selection */}
        <div className="dex-field">
          <label className="dex-label">1. Blockchain Network</label>
          <div className="dex-chain-tabs">
            {[
              { key: "eth", name: "Ethereum", dex: "Uniswap V3" },
              { key: "robinhood", name: "Robinhood", dex: "Robinhood Swap" },
              { key: "base", name: "Base", dex: "Aerodrome" },
              { key: "arb", name: "Arbitrum", dex: "Camelot" },
              { key: "bsc", name: "BNB Chain", dex: "PancakeSwap" },
              { key: "sol", name: "Solana", dex: "Raydium" },
            ].map((c) => (
              <button
                key={c.key}
                type="button"
                className={`dex-chain-btn ${selectedChain === c.key ? "active" : ""}`}
                onClick={() => setSelectedChain(c.key as any)}
              >
                <ChainIcon chain={c.key} size={16} />
                <div className="chain-info">
                  <span className="chain-title">{c.name}</span>
                  <span className="chain-dex">{c.dex}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Target Token Input */}
        <div className="dex-field">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", flexWrap: "wrap", gap: "6px" }}>
            <label className="dex-label" style={{ margin: 0 }}>2. Target Token Contract / Mint Address</label>
            <button
              type="button"
              onClick={() => {
                setTokenAddress(OFFICIAL_TOKEN_SPEC.contractAddress);
                setSelectedChain("robinhood");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "10px",
                fontWeight: "700",
                background: "rgba(204, 255, 0, 0.12)",
                color: "#ccff00",
                border: "1px solid rgba(204, 255, 0, 0.35)",
                borderRadius: "5px",
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              <img
                src={OFFICIAL_TOKEN_SPEC.logoUrl}
                alt={OFFICIAL_TOKEN_SPEC.name}
                style={{ width: "13px", height: "13px", borderRadius: "3px", objectFit: "cover" }}
              />
              <span>{OFFICIAL_TOKEN_SPEC.name} ({OFFICIAL_TOKEN_SPEC.symbol})</span>
              <span style={{ fontSize: "8.5px", background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", padding: "1px 4px", borderRadius: "3px" }}>
                VERIFIED ✓
              </span>
            </button>
          </div>
          <div className="token-input-box">
            <input
              type="text"
              className="dex-input mono"
              placeholder="Paste token address (e.g. 0x... or Solana Mint)"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
            />
            {tokenAddress && (
              <button type="button" className="btn-clear-input" onClick={() => setTokenAddress("")}>
                ×
              </button>
            )}
          </div>
        </div>

        {/* Trade Configuration */}
        <div className="dex-config-row">
          <div className="dex-field flex-1">
            <label className="dex-label">3. Amount per Wallet</label>
            <div className="amount-input-wrap">
              <input
                type="text"
                className="dex-input mono"
                value={amountPerWallet}
                onChange={(e) => setAmountPerWallet(e.target.value)}
              />
              <span className="amount-unit">{selectedChain === "bsc" ? "BNB" : selectedChain === "sol" ? "SOL" : "ETH"}</span>
            </div>
          </div>

          <div className="dex-field w-32">
            <label className="dex-label">Slippage (%)</label>
            <input
              type="text"
              className="dex-input mono"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />
          </div>

          <div className="dex-field flex-1">
            <label className="dex-label">Execution Strategy</label>
            <div className="strategy-pills">
              <button
                type="button"
                className={`strat-btn ${traderMode === "distributed" ? "active" : ""}`}
                onClick={() => setTraderMode("distributed")}
              >
                <IconTarget size={12} /> Distributed Sniper
              </button>
              <button
                type="button"
                className={`strat-btn ${traderMode === "sweep" ? "active" : ""}`}
                onClick={() => setTraderMode("sweep")}
              >
                <IconZap size={12} /> Auto-Consolidate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Execution Summary Bar */}
      <div className="dex-summary-bar">
        <div className="summary-left">
          <div className="summary-wallets">
            <span className="summary-highlight mono">{activeWalletsCount}</span> Active Wallets Selected
          </div>
          <div className="summary-est">
            Estimated Total: <strong className="mono">{(parseFloat(amountPerWallet || "0") * activeWalletsCount).toFixed(4)} {selectedChain === "bsc" ? "BNB" : selectedChain === "sol" ? "SOL" : "ETH"}</strong>
          </div>
        </div>

        <button
          type="button"
          className="btn-execute-trade btn-disabled"
          disabled={true}
          style={{ opacity: 0.6, cursor: "not-allowed" }}
        >
          <IconZap size={13} /> On-Chain Router in Development
        </button>
      </div>
    </div>
  );
}
