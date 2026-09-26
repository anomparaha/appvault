import React, { useState } from "react";
import { useApp } from "../../../context/AppContext";
import { logActivity } from "../../../lib/services/activity";
import type { MnemonicRepairResult, ParsedSolution } from "../types";

interface LeftSolutionsPanelProps {
  analysis: MnemonicRepairResult | null;
  activeSession?: import("../types").SessionStats | null;
  filteredSolutions: string[];
  parsedSolutions: ParsedSolution[];
  selectedSlot: number | "all" | null;
  isOnTheFlyScanning: boolean;
  scanProgressInfo: { current: number; total: number; funded: number } | null;
  onApplySolution: (phrase: string) => void;
  onApplyAll: (solutions: string[]) => void;
  importing: boolean;
  importProgress: { current: number; total: number } | null;
}

export const LeftSolutionsPanel: React.FC<LeftSolutionsPanelProps> = ({
  analysis,
  activeSession,
  filteredSolutions,
  parsedSolutions,
  selectedSlot,
  isOnTheFlyScanning,
  scanProgressInfo,
  onApplySolution,
  onApplyAll,
  importing,
  importProgress,
}) => {
  const { toast } = useApp();
  const [solutionsLimit, setSolutionsLimit] = useState<number>(35);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setSolutionsLimit((prev) => Math.min(prev + 35, filteredSolutions.length));
    }
  };

  const isDualAll = analysis?.isDualWordMissing && selectedSlot === "all";

  // Dynamic titles reflecting persistent session vs instant preview
  const getPanelHeader = () => {
    if (activeSession?.status === "completed") {
      const isScanFinished = !isOnTheFlyScanning || (scanProgressInfo && scanProgressInfo.current >= scanProgressInfo.total);
      return {
        title: `⚡ Persistent Session Results #${activeSession.sessionId.slice(0, 8)} (${filteredSolutions.length} Solutions · Completed)`,
        desc: isScanFinished
          ? `Showing all ${filteredSolutions.length} verified phrases · Auto Scan Completed`
          : `Showing all ${filteredSolutions.length} verified phrases · On-chain balance auto-scan running in RAM (${scanProgressInfo?.current || 0}/${scanProgressInfo?.total || 0})...`,
        badgeClass: "text-emerald",
      };
    }
    if (activeSession?.status === "running") {
      return {
        title: `⚡ Active Persistent Session #${activeSession.sessionId.slice(0, 8)} (${activeSession.percent.toFixed(1)}% · ${filteredSolutions.length} Solutions)`,
        desc: `Multi-threaded Rayon compute & live on-chain balance scan running in RAM...`,
        badgeClass: "text-cyan",
      };
    }
    if (activeSession?.status === "paused") {
      return {
        title: `⏸ Persistent Session Paused #${activeSession.sessionId.slice(0, 8)} (${filteredSolutions.length} Solutions)`,
        desc: `Displaying candidate phrases from the last local database checkpoint.`,
        badgeClass: "text-amber",
      };
    }
    return {
      title: `✨ Lexical Quick Preview (${filteredSolutions.length} Initial Solutions${typeof selectedSlot === "number" ? ` · Slot #${selectedSlot + 1}` : ""})`,
      desc: isDualAll
        ? "Initial preview in RAM. Click 'Start New Session' for full computation & live balance auto-scan."
        : "Passed BIP-39 SHA-256 cryptographic checksum verification.",
      badgeClass: "text-emerald",
    };
  };

  const headerInfo = getPanelHeader();

  return (
    <div className="triptych-panel triptych-left-panel">
      <div className="triptych-panel-header">
        <div className="triptych-header-titles">
          <h4 className={`missing-solver-title ${headerInfo.badgeClass} text-xs font-bold`}>
            {headerInfo.title}
          </h4>
          <p className="missing-solver-desc text-xxs text-dim">
            {headerInfo.desc}
          </p>
        </div>
        <div className="triptych-header-actions">
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            onClick={() => {
              navigator.clipboard.writeText(filteredSolutions.join("\n"));
              toast(`Copied all ${filteredSolutions.length} candidate phrases to clipboard!`, "info");
            }}
            data-tooltip="Copy all candidate phrases to clipboard"
          >
            📋 Copy All
          </button>
          <button
            type="button"
            className="btn btn-xs btn-primary btn-apply-all"
            onClick={() => onApplyAll(filteredSolutions)}
            disabled={importing || filteredSolutions.length === 0}
            data-tooltip="Batch import all candidate wallets to vault"
          >
            {importing
              ? `⚡ Importing ${importProgress ? `${importProgress.current}/${importProgress.total}` : "…"}`
              : `⚡ Apply All (${filteredSolutions.length})`}
          </button>
        </div>
      </div>

      {/* On-The-Fly Balance Scanner Progress Bar */}
      {isOnTheFlyScanning && scanProgressInfo && (
        <div className="onthefly-scan-banner">
          <div className="onthefly-scan-info">
            <span className="onthefly-spin-icon">🔄</span>
            <span className="onthefly-text">
              RAM Balance Scanning: <strong>{scanProgressInfo.current}/{scanProgressInfo.total}</strong> · Found: <strong className="text-emerald">{scanProgressInfo.funded} funded</strong>
            </span>
          </div>
          <div className="onthefly-progress-bar">
            <div
              className="onthefly-progress-fill"
              style={{ width: `${(scanProgressInfo.current / scanProgressInfo.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="triptych-panel-body" onScroll={handleScroll}>
        {analysis?.isChecksumValid ? (
          <div className="empty-panel-state valid-checksum-confirmed">
            <span className="empty-state-icon text-emerald">✅</span>
            <h5 className="text-emerald font-bold">BIP-39 Checksum Valid!</h5>
            <p>
              This phrase is 100% valid and passed cryptographic SHA-256 checksum verification. No missing words or typos detected.
            </p>
            <div className="valid-phrase-info-box">
              <span className="badge badge-accent">WALLET READY TO USE</span>
              <p className="text-xxs text-dim mt-2">
                Use the <strong>Import to Vault →</strong> button below the editor to store this wallet directly into your Vault.
              </p>
            </div>
          </div>
        ) : parsedSolutions.length === 0 ? (
          <div className="empty-panel-state">
            <span className="empty-state-icon">✨</span>
            <h5>Valid Checksum Solutions</h5>
            <p>
              Enter a seed phrase in the center panel. The system will verify SHA-256 checksum cryptography and display valid combinations here.
            </p>
          </div>
        ) : (
          <div className="solutions-list">
          {parsedSolutions.slice(0, solutionsLimit).map((item, idx) => (
            <div key={idx} className="solution-item">
              <div className="solution-item-header">
                <div className="solution-badges-wrap">
                  <span className="solution-slot-tag">{item.slotLabel}</span>
                  <span className="solution-target-word">{item.solvedWords}</span>
                </div>
                <button
                  type="button"
                  className="solution-apply-btn"
                  onClick={() => {
                    onApplySolution(item.phrase);
                    logActivity({
                      type: "security",
                      title: "Mnemonic Seed Recovered",
                      desc: `Forensic Rayon solver reconstructed missing words (${item.solvedWords}) into valid BIP-39 mnemonic`,
                      amount: "Recovered",
                      amountColor: "var(--ok)",
                      status: "success",
                    });
                  }}
                  data-tooltip={`Apply solution (${item.solvedWords})`}
                >
                  Apply
                </button>
              </div>
              <div className="solution-text mono">
                {item.words.map((w, wIdx) => {
                  const isSolved = item.diffIndices.includes(wIdx);
                  return (
                    <span
                      key={wIdx}
                      className={isSolved ? "solution-word-solved" : undefined}
                    >
                      {w}{wIdx < item.words.length - 1 ? " " : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredSolutions.length > solutionsLimit && (
            <button
              type="button"
              className="load-more-btn"
              onClick={() => setSolutionsLimit((prev) => Math.min(prev + 35, filteredSolutions.length))}
            >
              Showing {solutionsLimit} of {filteredSolutions.length} solutions (Scroll down or click to load more ↓)
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
