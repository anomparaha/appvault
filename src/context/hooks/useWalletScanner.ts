import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { rustScan } from '../../lib/services/scan';
import { getAllWallets } from '../../lib/db/db';
import { walletHasScanTarget } from '../../lib/wallets/wallet';
import { logActivity } from '../../lib/services/activity';
import type { ScanProgress, WalletView } from '../../lib/types/index';
import type { ToastType } from '../types/toast';

interface UseWalletScannerProps {
  toast: (text: string, type?: ToastType) => void;
  sessionToken: string;
  loadWallets: () => Promise<WalletView[]>;
  setLoadingBalances: (ids: number[]) => void;
  enrich: (records: any[]) => WalletView[];
}

const SCAN_CHUNK_SIZE = 15;
type ScanResult = { funded: number; errors: number };

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
  const scanInProgressRef = useRef(false);

  const [isAirGapped, setIsAirGapped] = useState<boolean>(() => {
    const saved = localStorage.getItem('plurivex_air_gapped');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    const saved = localStorage.getItem('plurivex_air_gapped');
    const initialVal = saved !== null ? saved === 'true' : true;
    invoke<boolean>('set_air_gapped_mode', { enabled: initialVal })
      .then((val) => setIsAirGapped(val))
      .catch(() => {
        invoke<boolean>('get_air_gapped_mode')
          .then((val) => setIsAirGapped(val))
          .catch(() => {});
      });
  }, []);

  const toggleAirGapped = useCallback(async () => {
    const nextVal = !isAirGapped;
    try {
      await invoke('set_air_gapped_mode', { enabled: nextVal });
    } catch (err) {
      console.warn('Failed to update air-gapped mode in Rust core:', err);
    }
    setIsAirGapped(nextVal);
    localStorage.setItem('plurivex_air_gapped', String(nextVal));
    logActivity({
      type: "security",
      title: nextVal ? "Air-Gapped Safe Mode Enabled" : "Online Mode Enabled",
      desc: nextVal
        ? "Kernel-level execution gate active — RPC queries blocked"
        : "Direct RPC multi-chain network connectivity restored",
      amount: nextVal ? "Air-Gap" : "Online",
      amountColor: nextVal ? "var(--warning)" : "var(--ok)",
      status: nextVal ? "warning" : "info",
    });
    toast(
      nextVal
        ? '🛡️ Safe Mode Activated (RPC Network Blocked)'
        : '🌐 Online Mode Activated (RPC Network Connected)',
      nextVal ? 'info' : 'success'
    );
  }, [isAirGapped, toast]);

  const stopScan = useCallback(() => {
    scanCancelledRef.current = true;
    setScanning(false);
    setScanProgress(null);
    toast('Balance scan stopped', 'info');
  }, [toast]);

  const scanWallets = useCallback(
    async (targets: WalletView[], chainKey?: string): Promise<ScanResult> => {
      if (!targets.length) return { funded: 0, errors: 0 };
      if (!sessionToken) {
        toast("Authentication required: Vault session is locked.", "error");
        return { funded: 0, errors: 1 };
      }
      if (scanInProgressRef.current) {
        toast('A balance sync is already running. Please try again shortly.', 'info');
        return { funded: 0, errors: 1 };
      }

      scanInProgressRef.current = true;
      scanCancelledRef.current = false;
      setScanning(true);

      const total = targets.length;
      let completed = 0;
      let totalFunded = 0;
      let totalErrors = 0;
      setScanProgress({ total, completed: 0, funded: 0, isScanning: true });

      try {
        for (const chunk of chunksOf(targets, SCAN_CHUNK_SIZE)) {
          if (scanCancelledRef.current) break;
          const chunkIds = chunk.map((wallet) => wallet.id);
          setLoadingBalances(chunkIds);

          try {
            const summary = chunk.length === 1
              ? await rustScan(sessionToken, chunk[0].id, undefined, chainKey)
              : await rustScan(sessionToken, undefined, chunkIds, chainKey);
            completed += chunk.length;
            totalFunded += summary.funded;
            totalErrors += summary.errors;
            await loadWallets();
          } catch (err) {
            console.error('Balance scan chunk failed:', err);
            totalErrors += 1;
          }

          setScanProgress({
            total,
            completed: Math.min(completed, total),
            funded: totalFunded,
            isScanning: true,
          });
        }
      } finally {
        scanInProgressRef.current = false;
        setScanning(false);
        setScanProgress(null);
      }

      return { funded: totalFunded, errors: totalErrors };
    },
    [loadWallets, setLoadingBalances, toast, sessionToken]
  );

  /**
   * Quiet, serialized background synchronization used by WSS events and the
   * periodic recovery poll. It persists RPC results to SQLite then reloads the
   * wallet state, but does not show a manual-scan spinner or toast on every tick.
   */
  const refreshWallets = useCallback(
    async (targets: WalletView[], chainKey?: string): Promise<void> => {
      if (!targets.length || isAirGapped || !sessionToken || scanInProgressRef.current) return;
      scanInProgressRef.current = true;
      let shouldReload = false;

      try {
        for (const chunk of chunksOf(targets, SCAN_CHUNK_SIZE)) {
          const ids = chunk.map((wallet) => wallet.id);
          try {
            const summary = chunk.length === 1
              ? await rustScan(sessionToken, chunk[0].id, undefined, chainKey)
              : await rustScan(sessionToken, undefined, ids, chainKey);
            shouldReload = shouldReload || summary.scanned > 0;
            if (summary.errors > 0) {
              console.warn(`[Live wallet sync] ${summary.errors} RPC checks failed`, { chainKey, ids });
            }
          } catch (err) {
            console.warn('[Live wallet sync] RPC scan failed:', err);
          }
        }

        if (shouldReload) await loadWallets();
      } finally {
        scanInProgressRef.current = false;
      }
    },
    [isAirGapped, sessionToken, loadWallets]
  );

  const scanAll = async () => {
    if (!sessionToken) {
      toast("Authentication required: Vault session is locked.", "error");
      return;
    }
    if (isAirGapped) {
      toast(
        '🛡️ Air-Gapped Safe Mode Active: Network scanning is blocked for security. Disable Safe Mode in the header if you want to scan on-chain balances.',
        'error'
      );
      return;
    }
    const list = await loadWallets();
    const targets = list.filter(walletHasScanTarget);
    if (!targets.length) return;
    const { funded, errors } = await scanWallets(targets);
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
        "🛡️ Air-Gapped Safe Mode Active: Network scanning is blocked for security. Disable Safe Mode in the header if you want to scan on-chain balances.",
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
    toggleAirGapped,
    scanWallets,
    refreshWallets,
    scanAll,
    scanOne,
    stopScan,
  };
}
