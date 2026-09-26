import React, { useState } from "react";
import { IconSearch } from "../../../icons";
import { useApp } from "../../../context/AppContext";
import { logActivity } from "../../../lib/services/activity";
import type { MnemonicRepairResult, SlotCandidateWord, ParsedSolution } from "../types";

interface RightCandidatesPanelProps {
  phrase: string;
  analysis: MnemonicRepairResult | null;
  activeSession?: import("../types").SessionStats | null;
  selectedSlot: number | "all" | null;
  filteredSolutions: string[];
  filteredAllCandidates: SlotCandidateWord[];
  filteredSingleCandidates: string[];
  parsedSolutions: ParsedSolution[];
  candidateSearch: string;
  setCandidateSearch: (val: string) => void;
  onApplySolution: (phrase: string) => void;
  onWordReplace: (index: number, word: string) => void;
}

export const RightCandidatesPanel: React.FC<RightCandidatesPanelProps> = ({
  phrase,
  analysis,
  activeSession,
  selectedSlot,
  filteredSolutions,
  filteredAllCandidates,
  filteredSingleCandidates,
  parsedSolutions,
  candidateSearch,
  setCandidateSearch,
  onApplySolution,
  onWordReplace,
}) => {
  const { toast } = useApp();
  const [candidatesLimit, setCandidatesLimit] = useState<number>(60);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setCandidatesLimit((prev) => prev + 60);
    }
  };

  const hasCandidates =
    Boolean(phrase.trim()) &&
    ((analysis?.isDualWordMissing && selectedSlot === "all" && parsedSolutions.length > 0) ||
      (selectedSlot === "all" && filteredAllCandidates.length > 0) ||
      filteredSingleCandidates.length > 0);

  const getRightHeader = () => {
    if (activeSession?.status === "completed") {
      return {
        title: `✨ Session Solutions Catalog #${activeSession.sessionId.slice(0, 8)} (${filteredSolutions.length} Valid Pairs)`,
        desc: "Click any pair or word to apply it directly into the editor:",
      };
    }
    if (activeSession?.status === "running") {
      return {
        title: `✨ Streaming Session Solutions #${activeSession.sessionId.slice(0, 8)} (${filteredSolutions.length} Found)`,
        desc: "Collecting valid word combinations live in background...",
      };
    }
    return {
      title: analysis?.isDualWordMissing && selectedSlot === "all"
        ? `✨ Auto-Discovery (${filteredSolutions.length} Pair Solutions)`
        : selectedSlot === "all"
        ? `✨ Auto-Discovery (${analysis?.allSlotCandidates?.length || analysis?.candidateValidWords?.length || 0} Candidates)`
        : typeof selectedSlot === "number"
        ? `✨ Slot #${selectedSlot + 1} Discovery (${filteredSingleCandidates.length || analysis?.candidateValidWords?.length || 0} Words)`
        : `✨ Auto-Discovery (${analysis?.candidateValidWords?.length || 0} Candidates)`,
      desc: analysis?.isDualWordMissing && selectedSlot === "all"
        ? "System is testing 2-word combinations via Rayon parallel threads. Click a pair to apply:"
        : selectedSlot === "all"
        ? "System is testing 12 positions (24,576 combinations). Click a word to complete phrase:"
        : typeof selectedSlot === "number"
        ? `System is testing possible valid words for Slot #${selectedSlot + 1}:`
        : "System is testing candidate words. Click a word to complete phrase:",
    };
  };

  const rightHeader = getRightHeader();

  return (
    <div className="triptych-panel triptych-right-panel">
      <div className="triptych-panel-header">
        <div className="triptych-header-titles">
          <h4 className="missing-solver-title text-emerald text-xs font-bold">
            {rightHeader.title}
          </h4>
          <p className="missing-solver-desc text-xxs text-dim">
            {rightHeader.desc}
          </p>
        </div>
        <div className="triptych-header-actions" style={{ width: "100%" }}>
          <div className="candidate-search-wrap-full" style={{ width: "100%", position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: "10px", color: "var(--text-dim, #64748b)", pointerEvents: "none", display: "flex", alignItems: "center" }}>
              <IconSearch size={13} />
            </span>
            <input
              type="text"
              className="candidate-search-input"
              style={{ width: "100%", height: "28px", paddingLeft: "30px", paddingRight: candidateSearch ? "26px" : "10px", fontSize: "11px", boxSizing: "border-box" }}
              placeholder={
                analysis?.isDualWordMissing && selectedSlot === "all"
                  ? "Search word pairs (e.g. 'abandon')..."
                  : "Search words (e.g. 'a', 'b', 'c')..."
              }
              value={candidateSearch}
              onChange={(e) => setCandidateSearch(e.target.value)}
            />
            {candidateSearch && (
              <button
                type="button"
                onClick={() => setCandidateSearch("")}
                style={{ position: "absolute", right: "8px", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "11px", padding: 0 }}
                data-tooltip="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="triptych-panel-body" onScroll={handleScroll}>
        {!hasCandidates ? (
          <div className="empty-panel-state">
            <span className="empty-state-icon">🔍</span>
            <h5>Auto-Discovery Standby</h5>
            <p>
              Lexically and mathematically valid BIP-39 words will appear automatically in this panel as you enter your phrase.
            </p>
          </div>
        ) : analysis?.isDualWordMissing && selectedSlot === "all" ? (
          <div className="candidate-pairs-grid">
            {parsedSolutions.slice(0, candidatesLimit).map((item, idx) => (
              <button
                key={`${item.phrase}-${idx}`}
                type="button"
                className="candidate-pair-card"
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
                  toast(`Solution ${item.slotLabel} applied: ${item.solvedWords}`, "success");
                }}
                data-tooltip={`Click to complete phrase with ${item.slotLabel} (${item.solvedWords})`}
              >
                <span className="pair-slots-badge">{item.slotLabel}</span>
                <span className="pair-words-text">{item.solvedWords}</span>
                <span className="pair-apply-indicator">Apply →</span>
              </button>
            ))}
            {parsedSolutions.length > candidatesLimit && (
              <button
                type="button"
                className="load-more-btn"
                onClick={() => setCandidatesLimit((prev) => prev + 40)}
              >
                + Load More ({candidatesLimit}/{parsedSolutions.length})
              </button>
            )}
          </div>
        ) : (
          <div className="candidate-words-cloud">
            {selectedSlot === "all" && filteredAllCandidates.length > 0 ? (
              <>
                {filteredAllCandidates.slice(0, candidatesLimit).map((item, idx) => (
                  <button
                    key={`${item.positionIndex}-${item.word}-${idx}`}
                    type="button"
                    className="candidate-word-btn"
                    onClick={() => {
                      onWordReplace(item.positionIndex, item.word);
                      toast(`Slot #${item.positionIndex + 1} filled with word '${item.word}'!`, "success");
                    }}
                    data-tooltip={`Fill Slot #${item.positionIndex + 1} with '${item.word}'`}
                  >
                    <span className="slot-badge">#{item.positionIndex + 1}</span> {item.word}
                  </button>
                ))}
                {filteredAllCandidates.length > candidatesLimit && (
                  <button
                    type="button"
                    className="load-more-btn"
                    onClick={() => setCandidatesLimit((prev) => prev + 120)}
                  >
                    + Load More ({candidatesLimit}/{filteredAllCandidates.length})
                  </button>
                )}
              </>
            ) : filteredSingleCandidates.length > 0 ? (
              <>
                {filteredSingleCandidates.slice(0, candidatesLimit).map((cand) => (
                  <button
                    key={cand}
                    type="button"
                    className="candidate-word-btn"
                    onClick={() => {
                      const targetSlot =
                        typeof selectedSlot === "number"
                           ? selectedSlot
                           : analysis?.missingWordIndex ?? ((analysis?.words?.length ?? 1) - 1);
                      onWordReplace(targetSlot, cand);
                      toast(`Slot #${targetSlot + 1} filled with word '${cand}'!`, "success");
                    }}
                  >
                    <span className="plus-sign">+</span> {cand}
                  </button>
                ))}
                {filteredSingleCandidates.length > candidatesLimit && (
                  <button
                    type="button"
                    className="load-more-btn"
                    onClick={() => setCandidatesLimit((prev) => prev + 120)}
                  >
                    + Load More ({candidatesLimit}/{filteredSingleCandidates.length})
                  </button>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
