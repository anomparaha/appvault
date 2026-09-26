import React, { useRef } from "react";
import { useApp } from "../../../context/AppContext";
import type { MnemonicRepairResult, WordAnalysis } from "../types";

interface CenterEditorPanelProps {
  phrase: string;
  setPhrase: (val: string) => void;
  targetAddress: string;
  setTargetAddress: (val: string) => void;
  analysis: MnemonicRepairResult | null;
  loading: boolean;
  selectedSlot: number | "all" | null;
  setSelectedSlot: (slot: number | "all" | null) => void;
  triggerAnalysis: (text: string, targetAddr?: string, slot?: number | "all" | null) => void;
  onWordReplace: (index: number, newWord: string) => void;
  onApplySolution: (phrase: string) => void;
  onDirectImport?: () => void;
  importing?: boolean;
}

export const CenterEditorPanel: React.FC<CenterEditorPanelProps> = ({
  phrase,
  setPhrase,
  targetAddress,
  setTargetAddress,
  analysis,
  loading,
  selectedSlot,
  setSelectedSlot,
  triggerAnalysis,
  onWordReplace,
  onApplySolution,
  onDirectImport,
  importing = false,
}) => {
  const { toast } = useApp();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayWords: WordAnalysis[] = analysis?.words || [];

  return (
    <div className="triptych-panel triptych-center-panel">
      <div className="triptych-panel-header">
        <div className="triptych-header-titles">
          <h4 className="missing-solver-title text-emerald text-xs font-bold">
            ✨ Word Matrix &amp; Phrase Input ({phrase.trim() ? phrase.trim().split(/\s+/).length : 0} Words Detected)
          </h4>
          <p className="missing-solver-desc text-xxs text-dim">
            Enter seed phrase words for automatic position forensics and BIP-39 lexical checksum diagnostics
          </p>
        </div>
        <div className="triptych-header-actions">
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            onClick={() => {
              setPhrase("");
              setSelectedSlot("all");
              triggerAnalysis("", targetAddress, "all");
            }}
            disabled={!phrase}
            data-tooltip="Clear mnemonic phrase input"
          >
            ↺ Clear Phrase
          </button>
          <button
            type="button"
            className="btn btn-xs btn-primary btn-apply-all"
            onClick={() => triggerAnalysis(phrase, targetAddress, selectedSlot)}
            disabled={!phrase.trim() || loading}
            data-tooltip="Re-run checksum diagnostics & candidate word search"
          >
            {loading ? "⚡ Analyzing…" : "⚡ Re-Analyze Phrase"}
          </button>
        </div>
      </div>

      <div className="triptych-panel-body p-3">
        {/* Raw Text Input Card */}
        <div className="repair-input-card compact">
          <div className="repair-input-header">
            <div className="flex items-center gap-2">
              <label className="input-label text-xs font-bold">Raw Mnemonic Recovery Phrase</label>
              <span className="mono text-xxs text-dim">
                ({phrase.trim() ? phrase.trim().split(/\s+/).length : 0} words)
              </span>
            </div>
          </div>
          <textarea
            className="repair-textarea compact"
            rows={2}
            placeholder="Example: license space law cash twice young book camera poverty energy..."
            value={phrase}
            onChange={(e) => {
              const val = e.target.value;
              setPhrase(val);
              setSelectedSlot("all");
              if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
              }
              if (!val.trim()) {
                triggerAnalysis("", targetAddress, "all");
                return;
              }
              debounceTimerRef.current = setTimeout(() => {
                triggerAnalysis(val, targetAddress, "all");
              }, 120);
            }}
          />
        </div>

        {/* Target Address Matcher Input */}
        <div className="target-address-box compact">
          <div className="target-address-header">
            <label className="input-label text-xxs flex items-center gap-1">
              🎯 Target Address <span className="text-dim">(Optional — BTC bc1q.../1..., EVM 0x..., or Solana)</span>
            </label>
            {targetAddress && (
              <button
                type="button"
                className="btn btn-xs btn-ghost text-xxs text-dim py-0 px-1"
                onClick={() => {
                  setTargetAddress("");
                  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                  triggerAnalysis(phrase, "", selectedSlot);
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>
          <input
            type="text"
            className="target-address-input compact"
            placeholder="Paste target wallet address (e.g. bc1q..., 1..., 0x..., or Solana) for 100% precision auto-match"
            value={targetAddress}
            onChange={(e) => {
              const val = e.target.value;
              setTargetAddress(val);
              if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
              }
              debounceTimerRef.current = setTimeout(() => {
                triggerAnalysis(phrase, val, selectedSlot);
              }, 200);
            }}
          />
        </div>

        {/* Victory Banner: Target Address Matched! */}
        {analysis?.targetMatch && (
          <div className="target-match-victory-card compact">
            <div className="target-match-header">
              <span className="victory-badge text-xs">🎯 100% EXACT FORENSIC MATCH FOUND!</span>
              <span className="victory-chain">{analysis.targetMatch.chainFamily.toUpperCase()}</span>
            </div>
            <div className="target-match-body compact">
              <div className="target-match-detail text-xs">
                <span className="text-dim">Position:</span>
                <strong className="text-accent">Slot #{analysis.targetMatch.positionIndex + 1}</strong>
                <span className="text-dim ml-2">Word:</span>
                <strong className="text-emerald mono font-bold">"{analysis.targetMatch.word}"</strong>
              </div>
            </div>
            <div className="target-match-footer">
              <button
                type="button"
                className="btn btn-xs btn-primary victory-apply-btn"
                onClick={() => {
                  onApplySolution(analysis.targetMatch!.phrase);
                  toast(`Phrase successfully restored with word '${analysis.targetMatch!.word}'!`, "success");
                }}
              >
                ⚡ Apply Word '{analysis.targetMatch.word}'
              </button>
            </div>
          </div>
        )}

        {/* All 12 Position Selector Tabs */}
        {analysis && (analysis.isSingleWordMissing || analysis.isDualWordMissing || (analysis.positionCandidates && analysis.positionCandidates.length > 0)) && (
          <div className="position-selector-box compact">
            <div className="position-selector-header">
              <span className="text-xxs font-semibold text-dim">
                📍 Missing Word Position ({analysis.isDualWordMissing ? "Select Slot to Test Word Pairs" : "Select Slot to Test Position"}):
              </span>
              {selectedSlot !== "all" && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost text-xxs text-accent py-0 px-1"
                  onClick={() => {
                    setSelectedSlot("all");
                    triggerAnalysis(phrase, targetAddress, "all");
                  }}
                >
                  ↺ All Positions
                </button>
              )}
            </div>
            <div className="position-tabs compact">
              <button
                type="button"
                className={`position-tab-btn compact ${selectedSlot === "all" ? "active" : ""}`}
                onClick={() => {
                  setSelectedSlot("all");
                  triggerAnalysis(phrase, targetAddress, "all");
                }}
                data-tooltip={analysis.isDualWordMissing ? "Test all possible position pairs" : "Test all 12 positions at once"}
              >
                🌐 All ({analysis.isDualWordMissing ? `${analysis.autoRepairedPhrases?.length || 0} Pairs` : (analysis.allSlotCandidates?.length || (12 * 128))})
              </button>
              {Array.from({ length: 12 }, (_, i) => {
                const candidateInfo = analysis.positionCandidates?.find((p) => p.positionIndex === i);
                const isCurrent = selectedSlot === i;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`position-tab-btn compact ${isCurrent ? "active" : ""}`}
                    onClick={() => {
                      setSelectedSlot(i);
                      triggerAnalysis(phrase, targetAddress, i);
                    }}
                    data-tooltip={`Slot #${i + 1} (${candidateInfo ? `${candidateInfo.candidateCount} solutions` : 'Select slot'})`}
                  >
                    #{i + 1}
                    {candidateInfo && (
                      <span className="tab-count">
                        {candidateInfo.candidateCount > 999
                          ? `${Math.round(candidateInfo.candidateCount / 1000)}k`
                          : candidateInfo.candidateCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Analysis Results Status Bar & Word Chips Grid */}
        {analysis && (
          <div className="repair-results-section">
            <div className="repair-status-bar">
              <div className="status-indicator-group">
                <span
                  className={`status-pill ${
                    analysis.isChecksumValid
                      ? "pill-success"
                      : (analysis.isSingleWordMissing || analysis.isDualWordMissing)
                      ? "pill-warning"
                      : analysis.isLengthValid
                      ? "pill-success"
                      : "pill-danger"
                  }`}
                >
                  {analysis.isDualWordMissing
                    ? "2 Words Missing (Dual Rayon) 🔍"
                    : analysis.isSingleWordMissing
                    ? (selectedSlot === "all"
                        ? "1 Word Missing (All Positions) 🔍"
                        : `Missing Word #${(typeof selectedSlot === "number" ? selectedSlot : (analysis.missingWordIndex ?? 0)) + 1} 🔍`)
                    : `${analysis.totalWords} Words ${analysis.isLengthValid ? "✓ (Standard)" : "✕ (Expected 12/24)"}`}
                </span>

                <span
                  className={`status-pill ${
                    analysis.isDualWordMissing || analysis.isSingleWordMissing
                      ? "pill-warning"
                      : !displayWords.some((w) => !w.isValidBip39 && !w.isPlaceholder)
                      ? "pill-success"
                      : "pill-danger"
                  }`}
                >
                  {analysis.isDualWordMissing
                    ? "2 Words Missing ❓❓"
                    : analysis.isSingleWordMissing
                    ? "1 Word Missing ❓"
                    : !displayWords.some((w) => !w.isValidBip39 && !w.isPlaceholder)
                    ? "All BIP-39 Valid ✓"
                    : "Typo Detected ⚠️"}
                </span>

                <span
                  className={`status-pill ${
                    analysis.isChecksumValid ? "pill-success" : "pill-danger"
                  }`}
                >
                  Checksum: {analysis.isChecksumValid ? "VALID ✓" : "INCOMPLETE / INVALID ✕"}
                </span>
              </div>
            </div>

            {/* Word Chips Grid */}
            <div className="repair-words-grid">
              {displayWords.map((w) => (
                <div
                  key={w.index}
                  className={`repair-word-card ${
                    w.isPlaceholder
                      ? "is-missing"
                      : w.isValidBip39
                      ? "is-valid"
                      : "is-typo"
                  } cursor-pointer`}
                  onClick={() => {
                    setSelectedSlot(w.index);
                    triggerAnalysis(phrase, targetAddress, w.index);
                  }}
                  data-tooltip={`Click to test Slot #${w.index + 1}`}
                >
                  <div className="word-card-top">
                    <span className="word-index">#{w.index + 1}</span>
                    <span className="word-badge">
                      {w.isPlaceholder
                        ? (selectedSlot === "all" ? "TEST SLOT" : "MISSING")
                        : w.isValidBip39 ? "✓" : "TYPO"}
                    </span>
                  </div>
                  <div className="word-val mono">
                    {w.isPlaceholder
                      ? (selectedSlot === "all" ? "🌐 (all)" : "❓ (missing)")
                      : w.rawWord}
                  </div>
                  {!w.isValidBip39 && !w.isPlaceholder && w.suggestions.length > 0 && (
                    <div className="word-suggestions">
                      <span className="text-xxs text-dim">Suggestions:</span>
                      <div className="suggestion-chips">
                        {w.suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="suggestion-chip"
                            onClick={(e) => {
                              e.stopPropagation();
                              onWordReplace(w.index, s);
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer Bar */}
      <div className="center-editor-footer">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => {
            if (!phrase.trim()) return;
            navigator.clipboard.writeText(phrase.trim());
            toast("Mnemonic phrase copied to clipboard!", "info");
          }}
          disabled={!phrase.trim()}
          data-tooltip="Copy phrase to clipboard"
        >
          📋 Copy Phrase
        </button>

        <button
          type="button"
          className={`btn btn-xs ${analysis?.isChecksumValid ? "btn-primary btn-import-repaired" : "btn-ghost text-dim cursor-not-allowed"}`}
          onClick={onDirectImport}
          disabled={
            !phrase.trim() ||
            importing ||
            (analysis !== null && !analysis.isChecksumValid)
          }
          data-tooltip={
            analysis?.isChecksumValid
              ? "Import wallet from this valid phrase directly to Vault"
              : "Phrase must pass BIP-39 SHA-256 Checksum first"
          }
        >
          {importing
            ? "⚡ Importing…"
            : analysis?.isChecksumValid
            ? "✨ Import to Vault →"
            : "Valid Checksum Required"}
        </button>
      </div>
    </div>
  );
};
