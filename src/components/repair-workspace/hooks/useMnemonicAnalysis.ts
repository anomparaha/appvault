import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../../../context/AppContext";
import type { MnemonicRepairResult } from "../types";

export function useMnemonicAnalysis() {
  const { toast } = useApp();
  const [analysis, setAnalysis] = useState<MnemonicRepairResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<number | "all" | null>("all");
  const reqIdRef = useRef<number>(0);

  const triggerAnalysis = useCallback(
    async (
      textToAnalyze: string,
      targetAddr = "",
      slot: number | "all" | null = "all"
    ) => {
      const trimmed = textToAnalyze.trim();
      if (!trimmed) {
        reqIdRef.current++;
        setAnalysis(null);
        setLoading(false);
        return;
      }

      const currentReqId = ++reqIdRef.current;

      const words = trimmed.split(/\s+/).filter(Boolean);
      const placeholderIdx = words.findIndex((w) =>
        ["?", "*", "_", "x", "missing", "unknown", "blank", "none", "null", "???"].includes(w.toLowerCase())
      );

      let effectiveSlot: number | null = null;

      if (placeholderIdx !== -1) {
        effectiveSlot = placeholderIdx;
        setSelectedSlot(effectiveSlot);
      } else if (typeof slot === "number") {
        effectiveSlot = slot;
        setSelectedSlot(slot);
      } else {
        // Default to "all" (All Positions Tested)
        effectiveSlot = null;
        setSelectedSlot("all");
      }

      setLoading(true);
      try {
        const res = await invoke<MnemonicRepairResult>("vault_repair_mnemonic", {
          phrase: trimmed,
          targetAddress: targetAddr.trim() || null,
          missingPosition: effectiveSlot,
        });

        // Ignore stale async response if another keystroke has already triggered a newer request
        if (currentReqId !== reqIdRef.current) return;

        setAnalysis(res);
      } catch (err) {
        if (currentReqId === reqIdRef.current) {
          console.error("Mnemonic repair error:", err);
          toast(`Repair analysis failed: ${String(err)}`, "error");
        }
      } finally {
        if (currentReqId === reqIdRef.current) {
          setLoading(false);
        }
      }
    },
    [toast]
  );

  return {
    analysis,
    setAnalysis,
    loading,
    selectedSlot,
    setSelectedSlot,
    triggerAnalysis,
  };
}
