import type { ActivityRecord } from "./activity";
import type { WalletView } from "../wallets/types";
import { getTradePositions, type TokenTradePosition } from "../../services/tokenTradeHistoryService";

export type Timeframe = "1D" | "7D" | "30D" | "ALL";

export interface WinRateStats {
  timeframe: Timeframe;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number; // 0 to 100%
  winRateFormatted: string; // e.g. "100.0%" or "0.0%"
  recentTrades: ActivityRecord[];
  chainsBreakdown: Record<string, { wins: number; total: number }>;
}

export interface WinRateTrendPoint {
  x: number;
  y: number;
  rate: number; // 0 to 100
  label: string;
  timestamp?: number;
  isWin?: boolean;
}

export interface WinRateTrendResult {
  currentWinRate: number;
  winRateFormatted: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnlEth: number;
  totalPnlUsd: number;
  points: WinRateTrendPoint[];
  strokePath: string;
  fillPath: string;
  strokeColor: string;
  gradientId: string;
  lastPoint: { x: number; y: number };
}

export function calculateWinRate(
  activities: ActivityRecord[],
  timeframe: Timeframe = "7D",
  positions?: TokenTradePosition[]
): WinRateStats {
  const allPositions = positions || getTradePositions();

  let wins = 0;
  let losses = 0;
  const chainsBreakdown: Record<string, { wins: number; total: number }> = {};

  for (const pos of allPositions) {
    const ch = (pos.chain || "all").toLowerCase();
    if (!chainsBreakdown[ch]) {
      chainsBreakdown[ch] = { wins: 0, total: 0 };
    }
    chainsBreakdown[ch].total++;

    const isWin = pos.pnlEth > 0 || pos.pnlUsd > 0;
    const isLoss = pos.pnlEth < 0 || pos.pnlUsd < 0;

    if (isWin) {
      wins++;
      chainsBreakdown[ch].wins++;
    } else if (isLoss) {
      losses++;
    }
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const winRateFormatted = totalTrades > 0 ? `${winRate.toFixed(1)}%` : "0.0%";

  return {
    timeframe,
    totalTrades,
    wins,
    losses,
    winRate,
    winRateFormatted,
    recentTrades: activities.slice(0, 10),
    chainsBreakdown,
  };
}

/**
 * Build smooth cubic bezier path for sparklines without overshoot or loops.
 */
export function buildSmoothSvgPath(
  points: { x: number; y: number }[],
  width = 320,
  height = 90
): { strokePath: string; fillPath: string } {
  if (points.length === 0) {
    return {
      strokePath: `M 0 45 L ${width} 45`,
      fillPath: `M 0 45 L ${width} 45 L ${width} ${height} L 0 ${height} Z`,
    };
  }

  if (points.length === 1) {
    const y = points[0].y;
    return {
      strokePath: `M 0 ${y.toFixed(1)} L ${width} ${y.toFixed(1)}`,
      fillPath: `M 0 ${y.toFixed(1)} L ${width} ${y.toFixed(1)} L ${width} ${height} L 0 ${height} Z`,
    };
  }

  let strokePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const dx = p1.x - p0.x;
    const cp1x = p0.x + dx * 0.5;
    const cp1y = p0.y;
    const cp2x = p0.x + dx * 0.5;
    const cp2y = p1.y;
    strokePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  const last = points[points.length - 1];
  const fillPath = `${strokePath} L ${last.x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  return { strokePath, fillPath };
}

/**
 * Calculate dynamic win rate trend line points and SVG paths
 * based on real token trade positions and PnL performance.
 */
export function calculateWinRateTrend(
  arg1?: TokenTradePosition[] | ActivityRecord[],
  arg2?: ActivityRecord[] | WalletView[],
  arg3?: WalletView[],
  viewBoxWidth = 320,
  viewBoxHeight = 90
): WinRateTrendResult {
  let positions: TokenTradePosition[] = [];
  let activeWallets: WalletView[] | undefined = undefined;

  if (Array.isArray(arg1) && arg1.length > 0 && "symbol" in arg1[0]) {
    positions = arg1 as TokenTradePosition[];
    activeWallets = arg3;
  } else if (Array.isArray(arg1) && arg1.length > 0 && "type" in arg1[0]) {
    activeWallets = arg2 as WalletView[];
    positions = getTradePositions();
  } else {
    positions = getTradePositions();
    activeWallets = Array.isArray(arg2) && arg2.length > 0 && "id" in arg2[0] ? (arg2 as WalletView[]) : arg3;
  }

  // 1. Identify active wallet IDs
  const activeIds = new Set<number>();
  if (activeWallets && activeWallets.length > 0) {
    for (const w of activeWallets) {
      activeIds.add(w.id);
    }
  }

  // 2. Filter positions matching active wallets
  const filtered = positions.filter((p) => {
    if (activeIds.size === 0) return true;
    if (!p.walletId) return true;
    return activeIds.has(p.walletId);
  });

  // Calculate cumulative trend from real token positions
  let wins = 0;
  let losses = 0;
  let totalPnlEth = 0;
  let totalPnlUsd = 0;
  const historyPoints: { rate: number; label: string; timestamp?: number; isWin?: boolean }[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const p = filtered[i];
    const isWin = p.pnlEth > 0 || p.pnlUsd > 0;
    const isLoss = p.pnlEth < 0 || p.pnlUsd < 0;

    totalPnlEth += p.pnlEth;
    totalPnlUsd += p.pnlUsd;

    if (isWin) {
      wins++;
    } else if (isLoss) {
      losses++;
    }

    const currentTotal = wins + losses;
    const rate = currentTotal > 0 ? (wins / currentTotal) * 100 : 0;
    historyPoints.push({
      rate,
      label: `${p.symbol}: ${p.pnlPercent >= 0 ? "+" : ""}${p.pnlPercent.toFixed(1)}% (${isWin ? "Profit" : "Loss"})`,
      isWin,
    });
  }

  const totalTrades = wins + losses;
  const currentWinRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const winRateFormatted = totalTrades > 0 ? `${currentWinRate.toFixed(1)}%` : "0.0%";

  // Determine vertical scale: rate 100% -> y=14, rate 0% -> y=76
  const yMin = 14;
  const yMax = 76;
  const mapY = (rate: number) => {
    const clamped = Math.max(0, Math.min(100, rate));
    return yMax - (clamped / 100) * (yMax - yMin);
  };

  // Generate trend points along X
  let points: WinRateTrendPoint[] = [];

  if (historyPoints.length === 0) {
    // If no execution history yet, display a neutral flat line across center
    points = [
      { x: 0, y: 45, rate: 0, label: "Belum ada riwayat transaksi trade", isWin: false },
      { x: viewBoxWidth, y: 45, rate: 0, label: "Belum ada riwayat transaksi trade", isWin: false },
    ];
  } else if (historyPoints.length === 1) {
    const single = historyPoints[0];
    points = [
      {
        x: 0,
        y: mapY(single.rate),
        rate: single.rate,
        label: `Start: ${single.label}`,
        isWin: single.isWin,
      },
      {
        x: viewBoxWidth,
        y: mapY(single.rate),
        rate: single.rate,
        label: single.label,
        timestamp: single.timestamp,
        isWin: single.isWin,
      },
    ];
  } else {
    points = historyPoints.map((p, idx) => {
      const x = (idx / (historyPoints.length - 1)) * viewBoxWidth;
      const y = mapY(p.rate);
      return {
        x,
        y,
        rate: p.rate,
        label: p.label,
        timestamp: p.timestamp,
        isWin: p.isWin,
      };
    });
  }

  const { strokePath, fillPath } = buildSmoothSvgPath(points, viewBoxWidth, viewBoxHeight);

  // Dynamic theme colors matching win rate
  let strokeColor = "#10b981"; // Emerald green for high winrate
  if (totalTrades === 0) {
    strokeColor = "#64748b"; // Neutral slate
  } else if (currentWinRate < 50) {
    strokeColor = "#f43f5e"; // Rose / red for loss or drawdown
  } else if (currentWinRate < 75) {
    strokeColor = "#f59e0b"; // Amber
  }

  const gradientId = `spgWinRate_${Math.floor(currentWinRate)}_${totalTrades}`;
  const lastPoint = points.length > 0 ? { x: points[points.length - 1].x, y: points[points.length - 1].y } : { x: viewBoxWidth, y: mapY(currentWinRate) };

  return {
    currentWinRate,
    winRateFormatted,
    totalTrades,
    wins,
    losses,
    totalPnlEth,
    totalPnlUsd,
    points,
    strokePath,
    fillPath,
    strokeColor,
    gradientId,
    lastPoint,
  };
}
