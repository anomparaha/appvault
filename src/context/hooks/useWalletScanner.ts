import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { rustScan } from '../../lib/scan';
import { getAllWallets } from '../../lib/db';
import { walletHasScanTarget } from '../../lib/wallet';
import { logActivity } from '../../lib/activity';
import type { ScanProgress, ToastType, WalletView } from '../../lib/types';

interface UseWalletScannerProps {
  toast: (text: string, type?: ToastType) => void;
  sessionToken: string;
  loadWallets: () => Promise<WalletView[]>;
  setLoadingBalances: (ids: number[]) => void;
  enrich: (records: any[]) => WalletView[];
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

  const [isAirGapped, setIsAirGapped] = useState<boolean>(() => {
    const saved = localStorage.getItem('plurivex_air_gapped');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    const saved = localStorage.getItem('plurivex_air_gapped');
    const initialVal = saved !== null ? saved === 'true' : true;
    invoke<boolean>('set_air_gapped_mode', { enabled: initialVal })
      .then((val) => {
        setIsAirGapped(val);
      })
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
    async (targets: WalletView[]) => {
      if (!targets.length) return { funded: 0, errors: 0 };
      scanCancelledRef.current = false;
      setScanning(true);

      const total = targets.length;
      let completed = 0;
      let totalFunded = 0;
      let totalErrors = 0;

      setScanProgress({
        total,
        completed: 0,
        funded: 0,
        isScanning: true,
      });

      // Single wallet fast path
      if (targets.length === 1) {
        setLoadingBalances([targets[0].id]);
        try {
          const summary = await rustScan(targets[0].id);
          await loadWallets();
          setScanning(false);
          setScanProgress(null);
          return { funded: summary.funded, errors: summary.errors };
        } catch (err) {
          setScanning(false);
          setScanProgress(null);
          throw err;
        }
      }

      // Chunked background scanning (batches of 15 wallets at a time)
      const CHUNK_SIZE = 15;
      const chunks: WalletView[][] = [];
      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        chunks.push(targets.slice(i, i + CHUNK_SIZE));
      }

      for (const chunk of chunks) {
        if (scanCancelledRef.current) break;

        const chunkIds = chunk.map((w) => w.id);
        setLoadingBalances(chunkIds);

        try {
          const summary = await rustScan(undefined, chunkIds);
          completed += chunk.length;
          totalFunded += summary.funded;
          totalErrors += summary.errors;

          await loadWallets();

          setScanProgress({
            total,
            completed: Math.min(completed, total),
            funded: totalFunded,
            isScanning: true,
          });
        } catch (err) {
          console.error('Chunk scan error:', err);
          totalErrors += 1;
        }
      }

      setScanning(false);
      setScanProgress(null);
      return { funded: totalFunded, errors: totalErrors };
    },
    [loadWallets, setLoadingBalances]
  );

  const scanAll = async () => {
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
      status: "success",
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
    const w = enrich(records).find((x) => x.id === id);
    if (!w || !walletHasScanTarget(w)) return;
    setScanning(true);
    setLoadingBalances([id]);
    try {
      const summary = await rustScan(id);
      await loadWallets();
      if (summary.errors > 0) {
        toast(`${summary.errors} chains failed to scan — please retry`, "error");
      } else {
        toast("Wallet balances updated successfully", "success");
      }
    } catch (err) {
      toast(`Scan failed: ${String(err)}`, "error");
    } finally {
      setScanning(false);
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
    scanAll,
    scanOne,
    stopScan,
  };
}
