import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from "react";
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
  removeWallet: (id: number, password: string) => Promise<{ success: boolean; error?: string }>;
  resetAllWallets: (password: string) => Promise<{ success: boolean; error?: string }>;
  exportWallets: (format: "txt" | "csv") => Promise<void>;
  exportWalletsWithOptions: (options: ExportOptions) => Promise<void>;
  revealSecret: (id: number) => Promise<string | null>;
  sessionToken: string;
  autoLockMinutes: number;
  setAutoLockMinutes: (mins: number) => void;
  isAirGapped: boolean;
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
  const pricing = useTokenPrices();

  // Mutable references for cross-hook synchronization without circular calls
  const loadWalletsRef = useRef<(tokenOverride?: string) => Promise<WalletView[]>>(async () => []);
  const scanWalletsRef = useRef<((targets: WalletView[]) => Promise<{ funded: number; errors: number }>) | undefined>(undefined);
  const setSelectedIdRef = useRef<React.Dispatch<React.SetStateAction<number | null>>>(() => {});
  const setSelectedSweepIdsRef = useRef<React.Dispatch<React.SetStateAction<Set<number>>>>(() => {});

  // 1. Auth, Database & Encryption Vault Hook
  const auth = useAuthVault({
    toast,
    loadWallets: (tokenOverride?: string) => loadWalletsRef.current(tokenOverride),
  });

  // 2. Core Wallet State & Operations Hook (Instantiated ONCE with live session token)
  const walletOps = useWalletOperations({
    toast,
    sessionToken: auth.sessionToken,
    setSelectedId: (action) => setSelectedIdRef.current(action),
    setSelectedSweepIds: (action) => setSelectedSweepIdsRef.current(action),
    scanWallets: (targets) => scanWalletsRef.current?.(targets) ?? Promise.resolve({ funded: 0, errors: 0 }),
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

  // ── Solana WebSocket Real-Time Balance Synchronization (Helius WSS) ──
  useEffect(() => {
    const solAddrs = walletOps.wallets
      .map((w) => w.solAddress)
      .filter((a): a is string => Boolean(a && a.length > 20));

    if (solAddrs.length > 0) {
      solanaWs.setWatchedAddresses(solAddrs);
    }
  }, [walletOps.wallets]);

  useEffect(() => {
    const unsub = solanaWs.subscribeAccountUpdates((update) => {
      walletOps.setWallets((prev) =>
        prev.map((w) => {
          if (w.solAddress !== update.address) return w;
          const currentSol = w.balances.sol;
          if (currentSol === update.solFormatted) return w;

          const updatedBalances = { ...w.balances, sol: update.solFormatted };
          const hasFunds = hasFundsForWallet(updatedBalances, w.type, w.tokens);
          const totalBalance = totalBalanceForWallet(updatedBalances, w.type);

          return {
            ...w,
            balances: updatedBalances,
            hasFunds,
            totalBalance,
          };
        })
      );
    });

    return unsub;
  }, [walletOps.setWallets]);

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
    removeWallet: walletOps.removeWallet,
    resetAllWallets: walletOps.resetAllWallets,
    exportWallets: walletOps.exportWallets,
    exportWalletsWithOptions: walletOps.exportWalletsWithOptions,
    revealSecret: auth.revealSecret,
    sessionToken: auth.sessionToken,
    autoLockMinutes: auth.autoLockMinutes,
    setAutoLockMinutes: auth.setAutoLockMinutes,
    isAirGapped: scanner.isAirGapped,
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
