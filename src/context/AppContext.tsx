import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScanProgress, WalletView } from "../lib/types/index";
import type { ToastMessage, ToastType } from "./types/toast";
import { hasFundsForWallet, totalBalanceForWallet } from "../lib/chains/chains";
import { clearSweptBalanceDb } from "../lib/db/db";
import { solanaWs } from "../services/solanaWsService";
import { useToastState } from "./hooks/useToastState";
import { useWalletFilters } from "./hooks/useWalletFilters";
import { useWalletOperations, type ExportOptions } from "./hooks/useWalletOperations";
import { useWalletScanner } from "./hooks/useWalletScanner";
import { useAuthVault, type Screen } from "./hooks/useAuthVault";
import { useTokenPrices } from "./hooks/useTokenPrices";

export type { ExportOptions };

interface AppContextValue {
  screen: Screen;
  initError: string;
  wallets: WalletView[];
  selectedId: number | null;
  search: string;
  scanning: boolean;
  scanProgress: ScanProgress | null;
  selectedSweepIds: Set<number>;
  isSweepModalOpen: boolean;
  setIsSweepModalOpen: (open: boolean) => void;
  isExportModalOpen: boolean;
  setIsExportModalOpen: (open: boolean) => void;
  isResetModalOpen: boolean;
  setIsResetModalOpen: (open: boolean) => void;
  tagFilter: string | null;
  setTagFilter: (tag: string | null) => void;
  setWalletLabel: (id: number, label: string | null) => Promise<void>;
  toggleSweepSelection: (id: number) => void;
  selectAllFunded: (filter?: "all" | "evm" | "sol") => void;
  clearSweepSelection: () => void;
  stopScan: () => void;
  setSearch: (v: string) => void;
  setSelectedId: (id: number | null) => void;
  setupPassword: (pw: string, pin?: string) => Promise<void>;
  unlock: (pw: string) => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  resetVault: (confirmation: string) => Promise<void>;
  hasPin: boolean;
  lock: () => void;
  importWallets: (
    raw: string | string[],
    onProgress?: (current: number, total: number) => void
  ) => Promise<{ added: number; skipped: number }>;
  scanAll: () => Promise<void>;
  scanOne: (id: number) => Promise<void>;
  refreshWallets: (targets: WalletView[], chainKey?: string) => Promise<void>;
  removeWallet: (id: number, password: string) => Promise<{ success: boolean; error?: string }>;
  resetAllWallets: (password: string) => Promise<{ success: boolean; error?: string }>;
  exportWallets: (format: "txt" | "csv") => Promise<void>;
  exportWalletsWithOptions: (options: ExportOptions) => Promise<void>;
  revealSecret: (id: number) => Promise<string | null>;
  sessionToken: string;
  autoLockMinutes: number;
  setAutoLockMinutes: (mins: number) => void;
  isAirGapped: boolean;
  networkSessionReady: boolean;
  toggleAirGapped: () => void;
  optimisticClearSweptWalletBalance: (
    walletId: number,
    chainKey: string,
    tokenMintOrAddress?: string,
    symbol?: string
  ) => void;
  toast: (text: string, type?: ToastType) => void;
  toasts: ToastMessage[];
  filteredWallets: WalletView[];
  fundedCount: number;
  pricing: ReturnType<typeof useTokenPrices>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { toasts, toast } = useToastState();

  // Mutable references for cross-hook synchronization without circular calls
  const loadWalletsRef = useRef<(tokenOverride?: string) => Promise<WalletView[]>>(async () => []);
  const scanWalletsRef = useRef<((targets: WalletView[]) => Promise<{ funded: number; errors: number; started: boolean; cancelled: boolean }>) | undefined>(undefined);
  const setSelectedIdRef = useRef<React.Dispatch<React.SetStateAction<number | null>>>(() => {});
  const setSelectedSweepIdsRef = useRef<React.Dispatch<React.SetStateAction<Set<number>>>>(() => {});

  // 1. Auth, Database & Encryption Vault Hook
  const auth = useAuthVault({
    toast,
    loadWallets: (tokenOverride?: string) => loadWalletsRef.current(tokenOverride),
  });
  const pricing = useTokenPrices(auth.sessionToken, auth.screen === "app");

  // 2. Core Wallet State & Operations Hook (Instantiated ONCE with live session token)
  const walletOps = useWalletOperations({
    toast,
    sessionToken: auth.sessionToken,
    setSelectedId: (action) => setSelectedIdRef.current(action),
    setSelectedSweepIds: (action) => setSelectedSweepIdsRef.current(action),
    scanWallets: (targets) => scanWalletsRef.current?.(targets) ?? Promise.resolve({ funded: 0, errors: 0, started: false, cancelled: false }),
    getUsd: pricing.getUsd,
  });
  loadWalletsRef.current = walletOps.loadWallets;

  // 3. Filters, Search & Modal Visibility Hook
  const filters = useWalletFilters(walletOps.wallets);
  setSelectedIdRef.current = filters.setSelectedId;
  setSelectedSweepIdsRef.current = filters.setSelectedSweepIds;

  // 4. Multi-Chain Scanner Hook
  const scanner = useWalletScanner({
    toast,
    sessionToken: auth.sessionToken,
    loadWallets: walletOps.loadWallets,
    setLoadingBalances: walletOps.setLoadingBalances,
    enrich: walletOps.enrich,
  });
  scanWalletsRef.current = scanner.scanWallets;
  const [nativeOnlineSessionReady, setNativeOnlineSessionReady] = useState(false);

  const walletsRef = useRef(walletOps.wallets);
  const previousOnlineSessionRef = useRef(false);
  walletsRef.current = walletOps.wallets;
  const selectedIdsRef = useRef(filters.selectedSweepIds);
  selectedIdsRef.current = filters.selectedSweepIds;
  const refreshWalletsRef = useRef(scanner.refreshWallets);
  refreshWalletsRef.current = scanner.refreshWallets;
  const selectedWallets = useMemo(
    () => walletOps.wallets.filter((wallet) => filters.selectedSweepIds.has(wallet.id)),
    [walletOps.wallets, filters.selectedSweepIds],
  );
  const selectedSolWallets = useMemo(
    () => selectedWallets.filter((wallet) => Boolean(wallet.solAddress)),
    [selectedWallets],
  );
  const selectedSolAddressKey = useMemo(
    () => selectedSolWallets
      .map((wallet) => wallet.solAddress!)
      .filter(Boolean)
      .sort()
      .join(","),
    [selectedSolWallets],
  );

  // Reactive Multi-Chain Address Backfill (Native Scoped Rust Execution)
  useEffect(() => {
    if (!auth.sessionToken || !walletOps.wallets.length) return;
    const missing = walletOps.wallets.some(
      (w) =>
        (w.type === "seed" && (!w.address || !w.solAddress || !w.btcAddress)) ||
        (w.type === "pk" && !w.address) ||
        (w.type === "sol_pk" && !w.solAddress) ||
        (!w.address && !w.solAddress)
    );
    if (!missing) return;

    let cancelled = false;
    (async () => {
      try {
        const updatedCount = await invoke<number>("vault_backfill_addresses_scoped", {
          sessionToken: auth.sessionToken,
        });
        if (updatedCount > 0 && !cancelled) {
          await walletOps.loadWallets();
        }
      } catch (err) {
        console.warn("Scoped backfill warning:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth.sessionToken, walletOps.wallets, walletOps.loadWallets]);

  // Renderer WebSockets cannot consult the native gate on each frame, so keep
  // them behind a read-only native session/Safe Mode liveness check.
  useEffect(() => {
    let cancelled = false;
    let checking = false;
    setNativeOnlineSessionReady(false);

    if (
      auth.screen !== "app" ||
      !auth.sessionToken ||
      scanner.isAirGapped ||
      !scanner.networkGateReady
    ) {
      return () => {
        cancelled = true;
        setNativeOnlineSessionReady(false);
      };
    }

    const checkNativeSession = async () => {
      if (cancelled || checking) return;
      checking = true;
      try {
        await invoke("verify_online_network_access", { sessionToken: auth.sessionToken });
        if (!cancelled) setNativeOnlineSessionReady(true);
      } catch (error) {
        if (!cancelled) {
          setNativeOnlineSessionReady(false);
          if (!String(error).includes("Safe Mode is active")) auth.lock();
        }
      } finally {
        checking = false;
      }
    };

    void checkNativeSession();
    const interval = window.setInterval(() => void checkNativeSession(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      setNativeOnlineSessionReady(false);
    };
  }, [auth.screen, auth.sessionToken, auth.lock, scanner.networkGateReady, scanner.isAirGapped]);

  // Stale market snapshots are explicitly marked offline, and turning Online
  // back on refreshes them only after an authenticated vault session exists.
  useEffect(() => {
    const onlineSession = auth.screen === "app" && Boolean(auth.sessionToken) && scanner.networkGateReady &&
      nativeOnlineSessionReady && !scanner.isAirGapped;
    if (!onlineSession) {
      pricing.markStale();
    } else if (!previousOnlineSessionRef.current) {
      void pricing.refreshPrices();
    }
    previousOnlineSessionRef.current = onlineSession;
  }, [auth.screen, auth.sessionToken, scanner.networkGateReady, nativeOnlineSessionReady, scanner.isAirGapped, pricing.markStale, pricing.refreshPrices]);

  // Keep all network transports behind the same explicit online + unlocked gate.
  // The dashboard only opens subscriptions for wallets checked in the sidebar.
  useEffect(() => {
    const appIsOnline = auth.screen === "app" && Boolean(auth.sessionToken) && scanner.networkGateReady && nativeOnlineSessionReady && !scanner.isAirGapped;
    const selectedSolAddresses = selectedSolAddressKey ? selectedSolAddressKey.split(",") : [];
    solanaWs.setWatchedAddresses(appIsOnline ? selectedSolAddresses : []);
    solanaWs.setEnabled(appIsOnline && selectedSolAddresses.length > 0, appIsOnline ? auth.sessionToken : null);
  }, [auth.screen, auth.sessionToken, scanner.networkGateReady, nativeOnlineSessionReady, scanner.isAirGapped, selectedSolAddressKey]);

  useEffect(() => () => {
    solanaWs.setWatchedAddresses([]);
    solanaWs.setEnabled(false);
  }, []);

  // Subscribe once; address and wallet selection lookups use refs so reloading
  // wallet state after a scan does not churn subscriptions or lose queued events.
  useEffect(() => {
    const pendingRefreshes = new Map<string, number>();

    const queueWalletRefresh = (walletId: number, chainKey: string) => {
      const key = `${walletId}:${chainKey}`;
      const existing = pendingRefreshes.get(key);
      if (existing !== undefined) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        pendingRefreshes.delete(key);
        const wallet = walletsRef.current.find(
          (candidate) => candidate.id === walletId && selectedIdsRef.current.has(candidate.id),
        );
        if (wallet) void refreshWalletsRef.current([wallet], chainKey);
      }, 1_200);
      pendingRefreshes.set(key, timer);
    };

    const unsubscribeAccountUpdates = solanaWs.subscribeAccountUpdates((update) => {
      const wallet = walletsRef.current.find((candidate) => candidate.solAddress === update.address);
      if (!wallet || !selectedIdsRef.current.has(wallet.id)) return;

      walletOps.setWallets((previous) => previous.map((candidate) => {
        if (candidate.id !== wallet.id || candidate.balances.sol === update.solFormatted) return candidate;
        const balances = { ...candidate.balances, sol: update.solFormatted };
        return {
          ...candidate,
          balances,
          hasFunds: hasFundsForWallet(balances, candidate.type, candidate.tokens),
          totalBalance: totalBalanceForWallet(balances, candidate.type),
        };
      }));
      queueWalletRefresh(wallet.id, "sol");
    });

    const unsubscribeSolanaTransactions = solanaWs.subscribeTransactions((update) => {
      const wallet = walletsRef.current.find((candidate) => candidate.solAddress === update.address);
      if (wallet && selectedIdsRef.current.has(wallet.id)) queueWalletRefresh(wallet.id, "sol");
    });

    return () => {
      unsubscribeAccountUpdates();
      unsubscribeSolanaTransactions();
      for (const timer of pendingRefreshes.values()) window.clearTimeout(timer);
      pendingRefreshes.clear();
    };
  }, [walletOps.setWallets]);

  // Recovery path: refresh selected wallets after selection changes and poll every
  // 45 seconds. This recovers missed Solana WSS notices and is the update path for
  // Robinhood Chain, whose credentialed renderer WebSocket provider is disabled.
  useEffect(() => {
    if (
      auth.screen !== "app" || !auth.sessionToken || scanner.isAirGapped ||
      !scanner.networkGateReady || !nativeOnlineSessionReady || filters.selectedSweepIds.size === 0
    ) {
      return;
    }

    const refreshSelectedWallets = () => {
      const targets = walletsRef.current.filter(
        (wallet) => filters.selectedSweepIds.has(wallet.id),
      );
      if (targets.length > 0) void refreshWalletsRef.current(targets);
    };

    refreshSelectedWallets();
    const interval = window.setInterval(refreshSelectedWallets, 45_000);
    return () => window.clearInterval(interval);
  }, [auth.screen, auth.sessionToken, scanner.isAirGapped, scanner.networkGateReady, nativeOnlineSessionReady, filters.selectedSweepIds]);

  const optimisticClearSweptWalletBalance = useCallback(
    (walletId: number, chainKey: string, tokenMintOrAddress?: string, symbol?: string) => {
      walletOps.setWallets((prev) =>
        prev.map((w) => {
          if (w.id !== walletId) return w;
          const updatedBalances = { ...w.balances };
          let updatedTokens = w.tokens ? [...w.tokens] : [];

          if (tokenMintOrAddress) {
            const targetLower = tokenMintOrAddress.toLowerCase();
            updatedTokens = updatedTokens.filter(
              (t) =>
                t.chain.toLowerCase() !== chainKey.toLowerCase() ||
                (t.contractAddress?.toLowerCase() !== targetLower &&
                  t.symbol.toLowerCase() !== targetLower)
            );
          } else {
            const sym = symbol || (chainKey === "sol" ? "SOL" : chainKey === "bsc" ? "BNB" : "ETH");
            updatedBalances[chainKey.toLowerCase()] = `0 ${sym}`;
          }

          const hasFunds = hasFundsForWallet(updatedBalances, w.type, updatedTokens);
          const totalBalance = totalBalanceForWallet(updatedBalances, w.type);

          return {
            ...w,
            balances: updatedBalances,
            tokens: updatedTokens,
            hasFunds,
            totalBalance,
          };
        })
      );

      // Instantly clear from local SQLite database in the background
      clearSweptBalanceDb(walletId, chainKey, tokenMintOrAddress, symbol, auth.sessionToken);
    },
    [auth.sessionToken, walletOps.setWallets]
  );

  const value: AppContextValue = {
    screen: auth.screen,
    initError: auth.initError,
    wallets: walletOps.wallets,
    selectedId: filters.selectedId,
    search: filters.search,
    scanning: scanner.scanning,
    scanProgress: scanner.scanProgress,
    selectedSweepIds: filters.selectedSweepIds,
    isSweepModalOpen: filters.isSweepModalOpen,
    setIsSweepModalOpen: filters.setIsSweepModalOpen,
    isExportModalOpen: filters.isExportModalOpen,
    setIsExportModalOpen: filters.setIsExportModalOpen,
    isResetModalOpen: filters.isResetModalOpen,
    setIsResetModalOpen: filters.setIsResetModalOpen,
    tagFilter: filters.tagFilter,
    setTagFilter: filters.setTagFilter,
    setWalletLabel: walletOps.setWalletLabel,
    toggleSweepSelection: filters.toggleSweepSelection,
    selectAllFunded: filters.selectAllFunded,
    clearSweepSelection: filters.clearSweepSelection,
    stopScan: scanner.stopScan,
    setSearch: filters.setSearch,
    setSelectedId: filters.setSelectedId,
    setupPassword: auth.setupPassword,
    unlock: auth.unlock,
    unlockWithPin: auth.unlockWithPin,
    resetVault: auth.resetVault,
    hasPin: auth.hasPin,
    lock: auth.lock,
    importWallets: walletOps.importWallets,
    scanAll: scanner.scanAll,
    scanOne: scanner.scanOne,
    refreshWallets: scanner.refreshWallets,
    removeWallet: walletOps.removeWallet,
    resetAllWallets: walletOps.resetAllWallets,
    exportWallets: walletOps.exportWallets,
    exportWalletsWithOptions: walletOps.exportWalletsWithOptions,
    revealSecret: auth.revealSecret,
    sessionToken: auth.sessionToken,
    autoLockMinutes: auth.autoLockMinutes,
    setAutoLockMinutes: auth.setAutoLockMinutes,
    isAirGapped: scanner.isAirGapped,
    networkSessionReady: nativeOnlineSessionReady,
    toggleAirGapped: scanner.toggleAirGapped,
    optimisticClearSweptWalletBalance,
    toast,
    toasts,
    filteredWallets: filters.filteredWallets,
    fundedCount: filters.fundedCount,
    pricing,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
