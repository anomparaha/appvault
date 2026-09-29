import React from "react";
import type { SessionStats } from "../types";

interface SessionTrackerCardProps {
  activeSession: SessionStats | null;
  selectedSlot: number | "all" | null;
  dualWordSolutionsCount?: number;
  onStartSession: () => void;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onCancelSession: () => void;
  onClosePanel?: () => void;
  onStopScan?: () => void;
  isOnTheFlyScanning?: boolean;
  scanProgressInfo?: { current: number; total: number; funded: number } | null;
  isSingleWordMissing?: boolean;
}

export const SessionTrackerCard: React.FC<SessionTrackerCardProps> = ({
  activeSession,
  selectedSlot,
  dualWordSolutionsCount,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onCancelSession,
  onClosePanel,
  onStopScan,
  isOnTheFlyScanning = false,
  scanProgressInfo,
  isSingleWordMissing = false,
}) => {
  return (
    <div className={`session-tracker-card ${activeSession ? `is-${activeSession.status}` : "is-idle"}`}>
      <div className="session-tracker-card-header">
        <div className="session-tracker-title-wrap">
          <span
            className={`session-pulse-dot ${
              activeSession?.status === "running"
                ? "dot-running"
                : activeSession?.status === "paused"
                ? "dot-paused"
                : "dot-idle"
            }`}
          />
          <div className="session-title-content">
            <div className="session-title-line">
              <span className="session-title-text">Rayon Multi-Core Hardware Acceleration</span>
              {activeSession ? (
                <span className={`session-status-badge status-${activeSession.status}`}>
                  {activeSession.status === "running"
                    ? "⚡ Running"
                    : activeSession.status === "paused"
                    ? "⏸ Paused"
                    : activeSession.status === "completed"
                    ? "✓ Complete"
                    : "✕ Cancelled"}
                </span>
              ) : (
                <span className="session-status-badge status-idle">STANDBY IN RAM</span>
              )}
            </div>
          </div>
        </div>

        <div className="session-controls-row">
          {(!activeSession || activeSession.status === "completed" || activeSession.status === "cancelled") && (
            isSingleWordMissing ? (
              <span
                className="session-status-badge status-completed"
                data-tooltip="All 2,048 candidates analyzed instantly live in memory"
              >
                ✓ Live Completed (2,048 words)
              </span>
            ) : (
              <button
                type="button"
                className="session-btn session-btn-resume"
                onClick={onStartSession}
                data-tooltip="Start background multi-threaded brute-force search session with auto-checkpoint to local database"
              >
                🚀 Start New Session
              </button>
            )
          )}

          {activeSession?.status === "running" && (
            <>
              <button
                type="button"
                className="session-btn session-btn-pause"
                onClick={onPauseSession}
                data-tooltip="Pause Rayon computation and save index checkpoint to local database"
              >
                ⏸ Pause
              </button>
              <button
                type="button"
                className="session-btn session-btn-cancel"
                onClick={onCancelSession}
                data-tooltip="Cancel this search session"
              >
                ✕ Cancel
              </button>
            </>
          )}

          {activeSession?.status === "paused" && (
            <>
              <button
                type="button"
                className="session-btn session-btn-resume"
                onClick={onResumeSession}
                data-tooltip="Resume combination search from last checkpoint index"
              >
                ▶ Resume
              </button>
              <button
                type="button"
                className="session-btn session-btn-cancel"
                onClick={onCancelSession}
                data-tooltip="Cancel this search session"
              >
                ✕ Cancel
              </button>
            </>
          )}

          {isOnTheFlyScanning && (
            <button
              type="button"
              className="session-btn session-btn-cancel"
              onClick={() => onStopScan?.()}
              data-tooltip="Stop on-the-fly balance scanning"
            >
              ⏹ Stop Balance Scan
            </button>
          )}

          {onClosePanel && (
            <button
              type="button"
              className="session-btn session-btn-close"
              onClick={onClosePanel}
              data-tooltip="Close session panel"
            >
              ✕ Close Panel
            </button>
          )}
        </div>
      </div>

      {/* Progress bar section with meta header */}
      <div className="session-progress-section">
        <div className="session-progress-meta">
          <span className="session-progress-label">
            {activeSession
              ? `Progress: ${activeSession.currentIndex.toLocaleString()} / ${activeSession.totalCombinations.toLocaleString()} combinations`
              : selectedSlot === "all"
              ? "Compute Capacity: 66 Position Pairs (276.8M Combinations)"
              : "Compute Capacity: 4,194,304 word-pair combinations"}
          </span>
          <span className="session-progress-percent">
            {activeSession ? `${activeSession.percent.toFixed(1)}%` : "0.0%"}
          </span>
        </div>
        <div className="session-progress-bar-container">
          <div
            className={`session-progress-bar-fill ${activeSession?.status === "paused" ? "fill-paused" : ""}`}
            style={{ width: `${activeSession ? Math.max(activeSession.percent, 0.5).toFixed(1) : "0"}%` }}
          />
        </div>
      </div>

      {/* Metrics 2x2 Grid */}
      <div className="session-metrics-grid">
        <div className="session-metric-box">
          <span className="session-metric-label">Combination Progress</span>
          <div className="session-metric-val-wrap">
            <span className="session-metric-value text-emerald">
              {activeSession
                ? `${activeSession.currentIndex.toLocaleString()} / ${
                    activeSession.totalCombinations >= 1_000_000
                      ? `${(activeSession.totalCombinations / 1_000_000).toFixed(2)}M`
                      : activeSession.totalCombinations.toLocaleString()
                  }`
                : selectedSlot === "all"
                ? "66 Position Pairs"
                : "0 / 4,194,304 pairs"}
            </span>
            <span className="session-metric-sub">
              {activeSession
                ? `${activeSession.percent.toFixed(1)}% tested`
                : selectedSlot === "all"
                ? "276.8M Combinations"
                : "Dual-Word Rayon"}
            </span>
          </div>
        </div>

        <div className="session-metric-box">
          <span className="session-metric-label">CPU Speed</span>
          <div className="session-metric-val-wrap">
            <span className="session-metric-value text-cyan">
              {activeSession?.status === "completed"
                ? "Completed (Standby)"
                : activeSession?.status === "paused"
                ? "Paused (Standby)"
                : activeSession && activeSession.speedCps > 0
                ? `${Math.round(activeSession.speedCps).toLocaleString()} pairs/sec`
                : "Multi-Core Rayon"}
            </span>
            <span className="session-metric-sub">8–16 Parallel Threads</span>
          </div>
        </div>

        <div className="session-metric-box">
          <span className="session-metric-label">Estimated Time Remaining (ETA)</span>
          <div className="session-metric-val-wrap">
            <span className="session-metric-value text-amber">
              {activeSession?.status === "completed"
                ? "✓ Completed"
                : activeSession?.status === "cancelled"
                ? "✕ Cancelled"
                : activeSession?.status === "paused"
                ? "⏸ Session Paused"
                : activeSession?.etaSeconds != null
                ? `${activeSession.etaSeconds < 60 ? `${activeSession.etaSeconds.toFixed(1)}s` : `${(activeSession.etaSeconds / 60).toFixed(1)}m`}`
                : activeSession?.status === "running"
                ? "Calculating..."
                : "Standby"}
            </span>
            <span className="session-metric-sub">
              {activeSession?.status === "completed"
                ? "Search complete"
                : activeSession?.status === "paused"
                ? "Session paused"
                : "Process-memory session"}
            </span>
          </div>
        </div>

        <div className="session-metric-box">
          <span className="session-metric-label">
            {isOnTheFlyScanning ? "⚡ Live Balance Auto-Scan" : "Valid Checksum Solutions"}
          </span>
          <div className="session-metric-val-wrap">
            <span className="session-metric-value text-accent">
              {isOnTheFlyScanning && scanProgressInfo
                ? `${scanProgressInfo.current}/${scanProgressInfo.total} Scanned`
                : activeSession
                ? `${activeSession.solutionsCount.toLocaleString()} phrases`
                : `${dualWordSolutionsCount?.toLocaleString() || 0} phrases`}
            </span>
            <span className="session-metric-sub">
              {isOnTheFlyScanning && scanProgressInfo
                ? (scanProgressInfo.funded > 0
                    ? `🎉 ${scanProgressInfo.funded} FUNDED FOUND!`
                    : "RPC Balance Scan on RAM")
                : "BIP-39 SHA-256 Valid"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
