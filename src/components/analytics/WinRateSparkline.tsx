import { useState, useEffect, useMemo } from "react";
import { calculateWinRateTrend, type WinRateTrendPoint } from "../../lib/services/winrateAnalytics";
import {
  getTradePositions,
  subscribeTradePositions,
  type TokenTradePosition,
} from "../../services/tokenTradeHistoryService";
import type { WalletView } from "../../lib/types/index";

interface WinRateSparklineProps {
  activeWallets?: WalletView[];
  allWallets: WalletView[];
  fundedCount: number;
  seedCount: number;
  onViewActivity?: () => void;
}

export function WinRateSparkline({
  activeWallets,
  allWallets,
  fundedCount: _fundedCount,
  seedCount: _seedCount,
  onViewActivity,
}: WinRateSparklineProps) {
  const [positions, setPositions] = useState<TokenTradePosition[]>(() => getTradePositions());
  const [hoveredPoint, setHoveredPoint] = useState<WinRateTrendPoint | null>(null);

  useEffect(() => {
    const unsubPositions = subscribeTradePositions((latest) => {
      setPositions(latest);
    });
    return unsubPositions;
  }, []);

  const trend = useMemo(() => {
    return calculateWinRateTrend(positions, activeWallets, 320, 90);
  }, [positions, activeWallets]);

  return (
    <div
      className="winrate-hero-widget"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        minWidth: 0,
      }}
    >
      {/* ── Top Header: Title, Live Win Rate & Win/Loss Tally ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "4px",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              color: trend.strokeColor,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "18px",
              height: "18px",
              borderRadius: "4px",
              background: `color-mix(in srgb, ${trend.strokeColor} 15%, transparent)`,
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </span>
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: "750",
              color: "var(--text-secondary)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Win Rate Trend
          </span>
          {onViewActivity && (
            <button
              type="button"
              onClick={onViewActivity}
              title="Buka log audit & aktivitas lengkap"
              style={{
                background: "none",
                border: "none",
                padding: "0 2px",
                color: "var(--text-dim)",
                fontSize: "10px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                opacity: 0.8,
              }}
            >
              ↗
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span
            className="mono"
            style={{
              fontSize: "16px",
              fontWeight: "750",
              color: trend.strokeColor,
              letterSpacing: "-0.02em",
            }}
          >
            {trend.winRateFormatted}
          </span>
          <span
            className="mono"
            style={{
              fontSize: "10px",
              color: "var(--text-dim)",
              background: "rgba(255, 255, 255, 0.05)",
              padding: "1px 6px",
              borderRadius: "4px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {trend.wins}W / {trend.losses}L
          </span>
        </div>
      </div>

      {/* ── Interactive SVG Sparkline ── */}
      <div style={{ position: "relative", width: "100%", height: "90px" }}>
        <svg
          className="spark"
          viewBox="0 0 320 90"
          fill="none"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "90px", display: "block", overflow: "visible" }}
        >
          <defs>
            <linearGradient id={trend.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trend.strokeColor} stopOpacity="0.32" />
              <stop offset="100%" stopColor={trend.strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Reference Line: 100% Win Rate Benchmark */}
          <line
            x1="0"
            y1="14"
            x2="320"
            y2="14"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeDasharray="3 3"
            strokeWidth="0.8"
          />

          {/* Reference Line: 50% Win Rate Centerline */}
          <line
            x1="0"
            y1="45"
            x2="320"
            y2="45"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeDasharray="2 4"
            strokeWidth="0.8"
          />

          {/* Area Fill */}
          <path d={trend.fillPath} fill={`url(#${trend.gradientId})`} />

          {/* Stroke Line */}
          <path
            d={trend.strokePath}
            stroke={trend.strokeColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Active Status Pulse Indicator on Latest Coordinate */}
          <circle
            cx={trend.lastPoint.x}
            cy={trend.lastPoint.y}
            r="8"
            fill={trend.strokeColor}
            opacity="0.25"
          />
          <circle
            cx={trend.lastPoint.x}
            cy={trend.lastPoint.y}
            r="4"
            fill={trend.strokeColor}
          />
          <circle
            cx={trend.lastPoint.x}
            cy={trend.lastPoint.y}
            r="1.8"
            fill="#FFFFFF"
          />

          {/* Interactive Hover Point Overlay */}
          {trend.points.map((p, idx) => (
            <g
              key={idx}
              onMouseEnter={() => setHoveredPoint(p)}
              onMouseLeave={() => setHoveredPoint(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Invisible Hit Target */}
              <circle cx={p.x} cy={p.y} r="14" fill="transparent" />

              {/* Visible Anchor Dot when Hovered */}
              {hoveredPoint === p && (
                <>
                  <circle cx={p.x} cy={p.y} r="5" fill="#FFFFFF" />
                  <circle cx={p.x} cy={p.y} r="8" fill={trend.strokeColor} opacity="0.4" />
                </>
              )}
            </g>
          ))}
        </svg>

        {/* Hover Floating Tooltip */}
        {hoveredPoint && (
          <div
            style={{
              position: "absolute",
              left: `${Math.min(220, Math.max(10, (hoveredPoint.x / 320) * 100))}%`,
              top: `${Math.max(0, hoveredPoint.y - 32)}px`,
              background: "rgba(18, 22, 31, 0.95)",
              border: `1px solid ${trend.strokeColor}`,
              borderRadius: "5px",
              padding: "2px 8px",
              fontSize: "10px",
              color: "#FFFFFF",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
              transform: "translateX(-50%)",
              zIndex: 10,
              fontFamily: "var(--mono)",
            }}
          >
            <span style={{ color: trend.strokeColor, fontWeight: 700 }}>
              {hoveredPoint.rate.toFixed(1)}%
            </span>{" "}
            • {hoveredPoint.label.slice(0, 24)}
          </div>
        )}
      </div>

      {/* ── Metric Summary Row ── */}
      <div className="s-stat" style={{ marginTop: "8px" }}>
        <div>
          <span>WIN RATE</span>
          <b style={{ color: trend.strokeColor }}>{trend.winRateFormatted}</b>
        </div>
        <div>
          <span>TRADES</span>
          <b>{trend.totalTrades > 0 ? `${trend.wins}W / ${trend.losses}L` : "0 Trades"}</b>
        </div>
        <div>
          <span>PNL MINUS</span>
          <b style={{ color: trend.totalPnlUsd >= 0 ? "#10b981" : "#f43f5e" }}>
            {trend.totalPnlUsd < 0 ? "-" : "+"}${Math.abs(trend.totalPnlUsd).toFixed(2)}
          </b>
        </div>
        <div>
          <span>WALLETS</span>
          <b>{(activeWallets ?? allWallets).length} Active</b>
        </div>
      </div>
    </div>
  );
}
