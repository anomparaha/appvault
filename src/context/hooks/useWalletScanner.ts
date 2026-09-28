import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { rustScan } from '../../lib/services/scan';
import { getAllWallets } from '../../lib/db/db';
import { cancelActiveAddressInspections } from '../../lib/services/addressInspector';
import { cancelActiveTokenPriceRequests } from '../../services/tokenPriceService';
import { walletHasScanTarget } from '../../lib/wallets/wallet';
import { logActivity } from '../../lib/services/activity';
import { solanaWs } from '../../services/solanaWsService';
import type { ScanProgress, WalletView } from '../../lib/types/index';
import type { ToastType } from '../types/toast';

interface UseWalletScannerProps {
  toast: (text: string, type?: ToastType) => void;
  sessionToken: string;
  loadWallets: () => Promise<WalletView[]>;
  setLoadingBalances: (ids: number[]) => void;
  enrich: (records: any[]) => WalletView[];
}

const SCAN_CHUNK_SIZE = 1;
type ScanResult = { funded: number; errors: number; started: boolean; cancelled: boolean };
type PendingWalletRefresh = { wallet: WalletView; chainKey?: string };

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function useWalletScanner({
  toast,
  sessionToken,
  loadWallets,
  setLoadingBalances,
  enrich,
}: UseWalletScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const scanCancelledRef = useRef(false);
  const manualScanInProgressRef = useRef(false);
  const bgSyncInProgressRef = useRef(false);
  const airGapToggleInProgressRef = useRef(false);
  const pendingRefreshesRef = useRef(new Map<string, PendingWalletRefresh>());
  const refreshWalletsRef = useRef<(targets: WalletView[], chainKey?: string) => Promise<void>>(async () => {});
  const drainPendingRefreshesRef = useRef<() => void>(() => {});

  // Start fail-closed; persisted Online Mode is not honored until the native
  // gate confirms the same state over IPC.
  const [isAirGapped, setIsAirGapped] = useState(true);
  const [networkGateReady, setNetworkGateReady] = useState(false);
  const isAirGappedRef = useRef(true);
  const sessionTokenRef = useRef(sessionToken);
  const previousSessionTokenRef = useRef(sessionToken);
  isAirGappedRef.current = isAirGapped;
  sessionTokenRef.current = sessionToken;
  if (previousSessionTokenRef.current !== sessionToken) {
    previousSessionTokenRef.current = sessionToken;
    pendingRefreshesRef.current.clear();
  }

  useEffect(() => {
    pendingRefreshesRef.current.clear();
    if (!sessionToken && manualScanInProgressRef.current) scanCancelledRef.current = true;
  }, [sessionToken]);

  useEffect(() => {
    airGapToggleInProgressRef.current = true;
    const saved = localStorage.getItem('plurivex_air_gapped');
    const initialVal = saved !== null ? saved === 'true' : true;
    invoke<boolean>('set_air_gapped_mode', { enabled: initialVal })
      .then((val) => {
        isAirGappedRef.current = val;
        setIsAirGapped(val);
        setNetworkGateReady(true);
      })
      .catch(() => {
        isAirGappedRef.current = true;
        setIsAirGapped(true);
        localStorage.setItem('plurivex_air_gapped', 'true');
        setNetworkGateReady(false);
      })
      .finally(() => {
        airGapToggleInProgressRef.current = false;
      });
  }, []);

  const toggleAirGapped = useCallback(async () => {
    if (airGapToggleInProgressRef.current) return;
    airGapToggleInProgressRef.current = true;
    const nextVal = !isAirGappedRef.current;

    try {
      if (nextVal) {
        // Make the renderer fail closed synchronously before aborting requests or awaiting IPC.
        isAirGappedRef.current = true;
        setIsAirGapped(true);
        localStorage.setItem('plurivex_air_gapped', 'true');
        pendingRefreshesRef.current.clear();
        cancelActiveAddressInspections();
        cancelActiveTokenPriceRequests();
        solanaWs.setWatchedAddresses([]);
        solanaWs.setEnabled(false);
        if (manualScanInProgressRef.current) {
          // The active native RPC may already have been accepted; stop before another wallet.
          scanCancelledRef.current = true;
        }
      }

      try {
        await invoke('set_air_gapped_mode', { enabled: nextVal });
      } catch (err) {
        console.warn('Failed to update Safe Mode in the Rust command layer:', err);
        setNetworkGateReady(false);
        if (!nextVal) {
          // Fail closed in the UI if Online Mode cannot be confirmed by the native layer.
          isAirGappedRef.current = true;
          setIsAirGapped(true);
          localStorage.setItem('plurivex_air_gapped', 'true');
          solanaWs.setWatchedAddresses([]);
          solanaWs.setEnabled(false);
          toast('Could not confirm Online Mode; Safe Mode remains active.', 'error');
        } else {
          toast('Safe Mode is enabled in the UI, but the native gate could not be confirmed.', 'error');
        }
        return;
      }

      isAirGappedRef.current = nextVal;
      setIsAirGapped(nextVal);
      setNetworkGateReady(true);
      localStorage.setItem('plurivex_air_gapped', String(nextVal));
      logActivity({
        type: "security",
        title: nextVal ? "Safe Mode Enabled" : "Online Mode Enabled",
        desc: nextVal
          ? "App-level Safe Mode gate enabled for gated network requests"
          : "App-controlled RPC requests enabled",
        amount: nextVal ? "Safe Mode" : "Online",
        amountColor: nextVal ? "var(--warning)" : "var(--ok)",
        status: nextVal ? "warning" : "info",
      });
      toast(
        nextVal
          ? '🛡️ Safe Mode enabled (app network gate active)'
          : '🌐 Online Mode enabled (app network paths available)',
        nextVal ? 'info' : 'success'
      );
    } finally {
      airGapToggleInProgressRef.current = false;
    }
  }, [toast]);

  const stopScan = useCallback(() => {
    if (!manualScanInProgressRef.current) return;
    scanCancelledRef.current = true;
    // Native RPC calls are not cancellable mid-wallet. Keep the busy state until
    // the current wallet scan unwinds, then stop before starting another wallet.
    setScanProgress((current) => current
      ? { ...current, currentLabel: "Stopping after the current wallet scan…" }
      : current);
    toast('Balance scan will stop after the current wallet scan finishes', 'info');
  }, [toast]);

  const scanWallets = useCallback(
    async (targets: WalletView[], chainKey?: string): Promise<ScanResult> => {
      if (!targets.length) return { funded: 0, errors: 0, started: false, cancelled: false };
      const activeSessionToken = sessionTokenRef.current;
      if (!activeSessionToken) {
        toast("Authentication required: Vault session is locked.", "error");
        return { funded: 0, errors: 1, started: false, cancelled: false };
      }
      if (isAirGappedRef.current) {
        toast("Safe Mode blocks network balance scans.", "error");
        return { funded: 0, errors: 0, started: false, cancelled: false };
      }
      if (manualScanInProgressRef.current || bgSyncInProgressRef.current) {
        toast('A balance scan or live sync is already in progress. Please wait before starting another scan.', 'info');
        return { funded: 0, errors: 0, started: false, cancelled: false };
      }

      manualScanInProgressRef.current = true;
      scanCancelledRef.current = false;
      setScanning(true);

      const total = targets.length;
      let completed = 0;
      let totalFunded = 0;
      let totalErrors = 0;
      setScanProgress({ total, completed: 0, funded: 0, isScanning: true });

      try {
        for (const chunk of chunksOf(targets, SCAN_CHUNK_SIZE)) {
          if (
            scanCancelledRef.current ||
            isAirGappedRef.current ||
            sessionTokenRef.current !== activeSessionToken
          ) {
            scanCancelledRef.current = true;
            break;
          }
          const chunkIds = chunk.map((wallet) => wallet.id);
          setLoadingBalances(chunkIds);

          const target = chunk[0];
          const rawAddr = target?.label || target?.address || target?.solAddress || target?.btcAddress || `Wallet #${target?.id}`;
          const currentLabel = rawAddr.length > 16 ? `${rawAddr.slice(0, 6)}...${rawAddr.slice(-4)}` : rawAddr;

          setScanProgress({
            total,
            completed: Math.min(completed, total),
            funded: totalFunded,
            isScanning: true,
            currentLabel,
          });

          try {
            const summary = chunk.length === 1
              ? await rustScan(activeSessionToken, chunk[0].id, undefined, chainKey)
              : await rustScan(activeSessionToken, undefined, chunkIds, chainKey);
            completed += chunk.length;
            totalFunded += summary.funded;
            totalErrors += summary.errors;
            if (sessionTokenRef.current === activeSessionToken) await loadWallets();
          } catch (err) {
            console.error('Balance scan chunk failed:', err);
            totalErrors += 1;
            completed += chunk.length;
          }

          if (sessionTokenRef.current !== activeSessionToken || isAirGappedRef.current) {
            scanCancelledRef.current = true;
          }

          setScanProgress({
            total,
            completed: Math.min(completed, total),
            funded: totalFunded,
            isScanning: true,
            currentLabel,
          });
        }
      } finally {
        manualScanInProgressRef.current = false;
        setScanning(false);
        setScanProgress(null);
        drainPendingRefreshesRef.current();
      }

      return {
        funded: totalFunded,
        errors: totalErrors,
        started: true,
        cancelled: scanCancelledRef.current,
      };
    },
    [loadWallets, setLoadingBalances, toast]
  );

  /**
   * Quiet, serialized background synchronization used by WSS events and the
   * periodic recovery poll. It persists RPC results to SQLite then reloads the
   * wallet state, but does not show a manual-scan spinner or toast on every tick.
   */
  const refreshWallets = useCallback(
    async (targets: WalletView[], chainKey?: string): Promise<void> => {
      const activeSessionToken = sessionTokenRef.current;
      if (!targets.length || isAirGappedRef.current || !activeSessionToken) return;
      if (manualScanInProgressRef.current || bgSyncInProgressRef.current) {
        for (const wallet of targets) {
          pendingRefreshesRef.current.set(`${chainKey ?? "all"}:${wallet.id}`, { wallet, chainKey });
        }
        return;
      }
      // The checks and lock assignment are synchronous, so a manual/background
      // scan cannot start between them on the single JavaScript event loop.
      bgSyncInProgressRef.current = true;
      let shouldReload = false;

      try {
        for (const chunk of chunksOf(targets, SCAN_CHUNK_SIZE)) {
          if (
            manualScanInProgressRef.current ||
            isAirGappedRef.current ||
            sessionTokenRef.current !== activeSessionToken
          ) break;
          const ids = chunk.map((wallet) => wallet.id);
          try {
            const summary = chunk.length === 1
              ? await rustScan(activeSessionToken, chunk[0].id, undefined, chainKey)
              : await rustScan(activeSessionToken, undefined, ids, chainKey);
            shouldReload = shouldReload || summary.scanned > 0;
            if (summary.errors > 0) {
              console.warn(`[Live wallet sync] ${summary.errors} RPC checks failed`, { chainKey, ids });
            }
          } catch (err) {
            console.warn('[Live wallet sync] RPC scan failed:', err);
          }
        }

        if (shouldReload && sessionTokenRef.current === activeSessionToken && !isAirGappedRef.current) {
          await loadWallets();
        }
      } finally {
        bgSyncInProgressRef.current = false;
        drainPendingRefreshesRef.current();
      }
    },
    [loadWallets]
  );
  refreshWalletsRef.current = refreshWallets;

  const drainPendingRefreshes = useCallback(() => {
    if (isAirGappedRef.current || !sessionTokenRef.current) {
      pendingRefreshesRef.current.clear();
      return;
    }
    if (manualScanInProgressRef.current || bgSyncInProgressRef.current || pendingRefreshesRef.current.size === 0) return;

    const grouped = new Map<string, { chainKey?: string; targets: Map<number, WalletView> }>();
    for (const pending of pendingRefreshesRef.current.values()) {
      const key = pending.chainKey ?? "all";
      let group = grouped.get(key);
      if (!group) {
        group = { chainKey: pending.chainKey, targets: new Map() };
        grouped.set(key, group);
      }
      group.targets.set(pending.wallet.id, pending.wallet);
    }
    pendingRefreshesRef.current.clear();

    window.setTimeout(() => {
      for (const group of grouped.values()) {
        void refreshWalletsRef.current(Array.from(group.targets.values()), group.chainKey);
      }
    }, 0);
  }, []);
  drainPendingRefreshesRef.current = drainPendingRefreshes;

  const scanAll = async () => {
    if (!sessionToken) {
      toast("Authentication required: Vault session is locked.", "error");
      return;
    }
    if (isAirGapped) {
      toast(
        '🛡️ Safe Mode is active: app-controlled network scanning is disabled. Disable Safe Mode in the header to scan on-chain balances.',
        'error'
      );
      return;
    }
    const list = await loadWallets();
    const targets = list.filter(walletHasScanTarget);
    if (!targets.length) return;
    const { funded, errors, started, cancelled } = await scanWallets(targets);
    if (!started || cancelled) return;
    logActivity({
      type: "scan",
      title: "Multi-Chain Balance Scan Completed",
      desc: `Scanned ${targets.length} wallets across all networks · ${funded} funded addresses found`,
      amount: `${funded} Funded`,
      amountColor: funded > 0 ? "var(--ok)" : "var(--text-dim)",
      status: errors > 0 ? "warning" : "success",
      metadata: { totalScanned: targets.length, funded, errors },
    });
    if (errors > 0) {
      toast(
        `Scan complete · ${funded} funded · ${errors} chains failed`,
        funded > 0 ? "success" : "error"
      );
    } else {
      toast(`Scan complete · ${funded} funded wallets`, "success");
    }
  };

  const scanOne = async (id: number) => {
    if (isAirGapped) {
      toast(
        "🛡️ Safe Mode is active: app-controlled network scanning is disabled. Disable Safe Mode in the header to scan on-chain balances.",
        "error"
      );
      return;
    }
    if (!sessionToken) {
      toast("Authentication required: Vault session is locked.", "error");
      return;
    }
    const records = await getAllWallets(sessionToken);
    const wallet = enrich(records).find((candidate) => candidate.id === id);
    if (!wallet || !walletHasScanTarget(wallet)) return;

    const summary = await scanWallets([wallet]);
    if (!summary.started) return;
    if (summary.cancelled) return;
    if (summary.errors > 0) {
      toast(`${summary.errors} chains failed to scan — please retry`, "error");
    } else {
      toast("Wallet balances updated successfully", "success");
    }
  };

  return {
    scanning,
    setScanning,
    scanProgress,
    setScanProgress,
    isAirGapped,
    networkGateReady,
    toggleAirGapped,
    scanWallets,
    refreshWallets,
    scanAll,
    scanOne,
    stopScan,
  };
}
