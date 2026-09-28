import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../../../context/AppContext";
import { sound } from "../../../lib/utils/audio";
import type { FundedWalletData } from "../../modals/FundedWalletModal";

export function useOnTheFlyScan() {
  const { toast, isAirGapped, sessionToken, importWallets } = useApp();
  const [isOnTheFlyScanning, setIsOnTheFlyScanning] = useState<boolean>(false);
  const [scanProgressInfo, setScanProgressInfo] = useState<{ current: number; total: number; funded: number } | null>(null);
  const [isFundedWalletOpen, setIsFundedWalletOpen] = useState<boolean>(false);
  const [fundedWalletData, setFundedWalletData] = useState<FundedWalletData | null>(null);

  const cancelScanRef = useRef<boolean>(false);
  const queueRef = useRef<string[]>([]);
  const seenSetRef = useRef<Set<string>>(new Set());
  const isWorkerRunningRef = useRef<boolean>(false);
  const fundedCountRef = useRef<number>(0);
  const processedCountRef = useRef<number>(0);
  const isAwaitingConfirmationRef = useRef<boolean>(false);
  const isAirGappedRef = useRef(isAirGapped);
  const sessionTokenRef = useRef(sessionToken);
  isAirGappedRef.current = isAirGapped;
  sessionTokenRef.current = sessionToken;

  useEffect(() => {
    if (sessionToken && !isAirGapped) return;
    cancelScanRef.current = true;
    queueRef.current = [];
    seenSetRef.current.clear();
    processedCountRef.current = 0;
    fundedCountRef.current = 0;
    isAwaitingConfirmationRef.current = false;
    setIsOnTheFlyScanning(false);
    setScanProgressInfo(null);
    if (!sessionToken) {
      setFundedWalletData(null);
      setIsFundedWalletOpen(false);
    }
  }, [sessionToken, isAirGapped]);

  const processQueueWorker = useCallback(async () => {
    if (isWorkerRunningRef.current || !sessionTokenRef.current || isAirGappedRef.current) return;
    isWorkerRunningRef.current = true;
    setIsOnTheFlyScanning(true);

    try {
      while (queueRef.current.length > 0 && !cancelScanRef.current) {
        if (!sessionTokenRef.current || isAirGappedRef.current) {
          cancelScanRef.current = true;
          queueRef.current = [];
          break;
        }
      if (isAwaitingConfirmationRef.current) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }

      const phrase = queueRef.current.shift()!;
      processedCountRef.current += 1;

      setScanProgressInfo({
        current: processedCountRef.current,
        total: seenSetRef.current.size,
        funded: fundedCountRef.current,
      });

      try {
        const activeSessionToken = sessionTokenRef.current;
        if (!activeSessionToken || isAirGappedRef.current) break;
        const result = await invoke<{
          phrase: string;
          btcAddress?: string | null;
          btcBalance?: string | null;
          evmAddress?: string | null;
          evmBalances?: Record<string, string>;
          solAddress?: string | null;
          solBalance?: string | null;
          hasFunds: boolean;
          totalUsdEstimate: number;
        }>("scan_phrase_on_the_fly", { sessionToken: activeSessionToken, phrase });

        if (!sessionTokenRef.current || isAirGappedRef.current) continue;
        if (result.hasFunds) {
          fundedCountRef.current += 1;
          setScanProgressInfo({
            current: processedCountRef.current,
            total: seenSetRef.current.size,
            funded: fundedCountRef.current,
          });

          // Play victory chime sound
          sound.playSuccessChime();

          // Guardrail: Pause worker loop to await user explicit confirmation
          isAwaitingConfirmationRef.current = true;

          // Trigger Funded Wallet Celebration Modal (Pending user confirmation)
          setFundedWalletData({
            phrase: result.phrase,
            btcAddress: result.btcAddress,
            btcBalance: result.btcBalance,
            evmAddress: result.evmAddress,
            evmBalances: result.evmBalances,
            solAddress: result.solAddress,
            solBalance: result.solBalance,
            totalUsdEstimate: result.totalUsdEstimate,
          });
          setIsFundedWalletOpen(true);
          toast(`🎉 FUNDED WALLET DISCOVERED! Confirm to store in Vault.`, "success");
        }
      } catch (err) {
        console.warn("Scan phrase on the fly error:", err);
      }
      }
    } finally {
      isWorkerRunningRef.current = false;
      setIsOnTheFlyScanning(false);
      if (queueRef.current.length === 0 || cancelScanRef.current) setScanProgressInfo(null);
    }
  }, [toast]);

  // Explicit confirmation import guarded by user interaction
  const confirmImportFundedWallet = useCallback(
    async (phrase: string): Promise<boolean> => {
      try {
        const { added, skipped } = await importWallets([phrase]);
        if (added > 0) {
          toast("🎉 Funded wallet successfully secured to local encrypted Vault!", "success");
        } else if (skipped > 0) {
          toast("This wallet is already in your Vault.", "info");
        }
        return true;
      } catch (e) {
        console.error("Import jackpot wallet error:", e);
        toast(`Failed to save wallet to Vault: ${String(e)}`, "error");
        return false;
      }
    },
    [importWallets, toast]
  );

  const dismissFundedWallet = useCallback(() => {
    isAwaitingConfirmationRef.current = false;
    setIsFundedWalletOpen(false);
  }, []);

  // Feed phrases continuously during the search loop
  const enqueuePhrases = useCallback((phrases: string[]) => {
    if (!phrases || phrases.length === 0) return;
    if (isAirGapped || !sessionToken) return;

    let added = false;
    for (const p of phrases) {
      const clean = p.trim();
      if (clean && !seenSetRef.current.has(clean)) {
        seenSetRef.current.add(clean);
        queueRef.current.push(clean);
        added = true;
      }
    }

    if (added) {
      cancelScanRef.current = false;
      setScanProgressInfo({
        current: processedCountRef.current,
        total: seenSetRef.current.size,
        funded: fundedCountRef.current,
      });
      processQueueWorker();
    }
  }, [isAirGapped, sessionToken, processQueueWorker]);

  const resetScanQueue = useCallback(() => {
    cancelScanRef.current = false;
    isAwaitingConfirmationRef.current = false;
    queueRef.current = [];
    seenSetRef.current.clear();
    processedCountRef.current = 0;
    fundedCountRef.current = 0;
    setIsOnTheFlyScanning(false);
    setScanProgressInfo(null);
  }, []);

  const stopScan = useCallback(() => {
    cancelScanRef.current = true;
    isAwaitingConfirmationRef.current = false;
    queueRef.current = [];
    setIsOnTheFlyScanning(false);
    setScanProgressInfo(null);
  }, []);

  return {
    isOnTheFlyScanning,
    scanProgressInfo,
    isFundedWalletOpen,
    setIsFundedWalletOpen,
    fundedWalletData,
    confirmImportFundedWallet,
    dismissFundedWallet,
    enqueuePhrases,
    resetScanQueue,
    stopScan,
  };
}
