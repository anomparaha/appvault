import { useState, useMemo, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { getTradePositions, subscribeTradePositions, type TokenTradePosition } from "../../services/tokenTradeHistoryService";
import { getActivities, subscribeActivities, type ActivityRecord } from "../../lib/services/activity";
import { calculateWinRate, type Timeframe } from "../../lib/services/winrateAnalytics";
import { robinhoodWs } from "../../services/robinhoodWsService";
import { solanaWs } from "../../services/solanaWsService";
import { IconTrendingUp } from "../../icons";

export function WinRateCard({ compact = false }: { compact?: boolean }) {
  const { wallets, selectedSweepIds } = useApp();
  const [activities, setActivities] = useState<ActivityRecord[]>(() => getActivities());
  const [positions, setPositions] = useState<TokenTradePosition[]>(() => getTradePositions());
  const [timeframe, setTimeframe] = useState<Timeframe>("7D");
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [latestBlock, setLatestBlock] = useState<number>(0);
  const [solWsConnected, setSolWsConnected] = useState<boolean>(false);
  const [latestSlot, setLatestSlot] = useState<number>(0);

  useEffect(() => {
    const unsub = subscribeActivities((latest) => {
      setActivities(latest);
    });
    const unsubPositions = subscribeTradePositions((latest) => setPositions(latest));
    return () => {
      unsub();
      unsubPositions();
    };
  }, []);

  useEffect(() => {
    const unsubStatus = robinhoodWs.subscribeStatus((connected) => {
      setWsConnected(connected);
    });
    const unsubBlock = robinhoodWs.subscribeBlocks((blockNum) => {
      setLatestBlock(blockNum);
    });
    const unsubSolStatus = solanaWs.subscribeStatus((connected) => {
      setSolWsConnected(connected);
    });
    const unsubSolSlot = solanaWs.subscribeSlots((slotNum) => {
      setLatestSlot(slotNum);
    });
    return () => {
      unsubStatus();
      unsubBlock();
      unsubSolStatus();
      unsubSolSlot();
    };
  }, []);

  const activeWallets = useMemo(() => {
    if (selectedSweepIds.size === 0) return undefined;
    return wallets.filter((wallet) => selectedSweepIds.has(wallet.id));
  }, [wallets, selectedSweepIds]);

  const stats = useMemo(() => {
    return calculateWinRate(activities, timeframe, positions, activeWallets);
  }, [activities, timeframe, positions, activeWallets]);

  const winRateColor = useMemo(() => {
    if (stats.totalTrades === 0) return "var(--ok)";
    if (stats.winRate >= 80) return "var(--ok)";
    if (stats.winRate >= 50) return "var(--accent)";
    return "var(--danger)";
  }, [stats]);

  if (compact) {
    return (
      <div
        className="winrate-compact-pill"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "4px 10px",
          fontSize: "11px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ color: winRateColor, display: "flex" }}>
            <IconTrendingUp size={13} />
          </span>
          <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>Win Rate ({timeframe}):</span>
          <span style={{ color: winRateColor, fontWeight: 700, fontFamily: "var(--mono)" }}>
            {stats.winRateFormatted}
          </span>
        </div>
        <span style={{ color: "var(--border)" }}>|</span>
        <span style={{ color: "var(--text-dim)", fontSize: "10px" }}>
          {stats.wins}W / {stats.losses}L
        </span>
      </div>
    );
  }

  return (
    <div
      className="winrate-analytics-card"
      style={{
        background: "linear-gradient(135deg, rgba(20, 24, 33, 0.95) 0%, rgba(13, 17, 23, 0.98) 100%)",
        border: "1px solid rgba(240, 185, 11, 0.28)",
        borderRadius: "14px",
        padding: "18px 22px",
        marginBottom: "20px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background Accent Glow */}
      <div
        style={{
          position: "absolute",
          top: "-50px",
          right: "-50px",
          width: "160px",
          height: "160px",
          background: "radial-gradient(circle, rgba(240, 185, 11, 0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Top Row: Header & Timeframe Switcher ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              background: "rgba(240, 185, 11, 0.14)",
              color: "#f0b90b",
              border: "1px solid rgba(240, 185, 11, 0.35)",
              fontSize: "9px",
              fontWeight: 800,
              padding: "2px 7px",
              borderRadius: "4px",
              letterSpacing: "0.06em",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <IconTrendingUp size={11} />
            <span>BINANCE WEB3 STYLE METRICS</span>
          </span>

          <span
            style={{
              fontSize: "11px",
              color: wsConnected ? "#4ade80" : "var(--text-dim)",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
            title="Zan.top Dedicated Robinhood RPC Node"
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: wsConnected ? "#22c55e" : "#eab308",
                boxShadow: wsConnected ? "0 0 8px #22c55e" : "none",
              }}
            />
            <span style={{ fontSize: "10px", fontWeight: 600 }}>
              {wsConnected
                ? `Robinhood Live ${latestBlock ? `(#${latestBlock})` : ""}`
                : "Robinhood WS…"}
            </span>
          </span>

          <span
            style={{
              fontSize: "11px",
              color: solWsConnected ? "#a855f7" : "var(--text-dim)",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
            title="Helius Dedicated Solana WebSocket RPC"
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: solWsConnected ? "#a855f7" : "#eab308",
                boxShadow: solWsConnected ? "0 0 8px #a855f7" : "none",
              }}
            />
            <span style={{ fontSize: "10px", fontWeight: 600 }}>
              {solWsConnected
                ? `Solana Live ${latestSlot ? `(#${latestSlot})` : ""}`
                : "Solana WS…"}
            </span>
          </span>
        </div>

        {/* Timeframe Selector Pills */}
        <div
          style={{
            display: "flex",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "2px",
            gap: "2px",
          }}
        >
          {(["1D", "7D", "30D", "ALL"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              style={{
                background: timeframe === tf ? "rgba(240, 185, 11, 0.20)" : "transparent",
                color: timeframe === tf ? "#f0b90b" : "var(--text-dim)",
                border: timeframe === tf ? "1px solid rgba(240, 185, 11, 0.4)" : "1px solid transparent",
                borderRadius: "6px",
                padding: "3px 10px",
                fontSize: "10.5px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tf === "1D" ? "1D (24h)" : tf === "7D" ? "7D (1W)" : tf}
            </button>
          ))}
        </div>
      </div>

      {/* ── Metric Display Body ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "14px",
          alignItems: "center",
        }}
      >
        {/* Win Rate Tile */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: "10.5px", color: "var(--text-dim)", fontWeight: 600, marginBottom: "4px" }}>
            WIN RATE ({timeframe})
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 800,
              fontFamily: "var(--mono)",
              color: winRateColor,
              display: "flex",
              alignItems: "baseline",
              gap: "4px",
            }}
          >
            {stats.winRateFormatted}
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
            {stats.totalTrades === 0 ? "No trades recorded yet" : `${stats.wins} Won · ${stats.losses} Lost`}
          </div>
        </div>

        {/* Total Executions */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: "10.5px", color: "var(--text-dim)", fontWeight: 600, marginBottom: "4px" }}>
            EXECUTIONS / SWEEPS
          </div>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 800,
              fontFamily: "var(--mono)",
              color: "var(--text)",
            }}
          >
            {stats.totalTrades}
          </div>
          <div style={{ fontSize: "10px", color: "var(--ok)", marginTop: "2px", fontWeight: 600 }}>
            {stats.wins} Successful (100% on-chain)
          </div>
        </div>

        {/* Win / Loss Ratio Visual Bar */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: "10.5px", color: "var(--text-dim)", fontWeight: 600, marginBottom: "6px" }}>
            PERFORMANCE RATIO
          </div>
          <div
            style={{
              height: "8px",
              borderRadius: "4px",
              background: "rgba(239, 68, 68, 0.4)",
              overflow: "hidden",
              display: "flex",
              marginBottom: "6px",
            }}
          >
            <div
              style={{
                width: `${stats.totalTrades > 0 ? (stats.wins / stats.totalTrades) * 100 : 100}%`,
                background: "linear-gradient(90deg, #22c55e 0%, #4ade80 100%)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "9.5px",
              fontFamily: "var(--mono)",
            }}
          >
            <span style={{ color: "#4ade80", fontWeight: 700 }}>{stats.wins} WINS</span>
            <span style={{ color: stats.losses > 0 ? "#f87171" : "var(--text-dim)" }}>
              {stats.losses} LOSSES
            </span>
          </div>
        </div>
      </div>

      {/* ── Recent Trade Highlights in timeframe ── */}
      {stats.recentTrades.length > 0 && (
        <div style={{ marginTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "10px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", fontWeight: 700, marginBottom: "6px" }}>
            RECENT EXECUTIONS ({timeframe}):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {stats.recentTrades.slice(0, 3).map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  background: "rgba(255, 255, 255, 0.02)",
                  padding: "4px 8px",
                  borderRadius: "6px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: item.status === "success" ? "#22c55e" : "#ef4444",
                    }}
                  />
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{item.title}</span>
                  {item.amount && (
                    <span style={{ color: "var(--ok)", fontFamily: "var(--mono)", fontSize: "10.5px" }}>
                      +{item.amount}
                    </span>
                  )}
                </div>
                {item.explorerUrl && (
                  <a
                    href={item.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--accent)",
                      fontSize: "10px",
                      textDecoration: "none",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    View Tx ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
