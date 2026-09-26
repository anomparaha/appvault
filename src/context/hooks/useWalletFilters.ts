import { useCallback, useMemo, useState } from 'react';
import type { WalletView } from '../../lib/types';
import { hasFundsForWallet, hasFundsOnEvm, hasFundsOnSol } from '../../lib/chains';

export function useWalletFilters(wallets: WalletView[]) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedSweepIds, setSelectedSweepIds] = useState<Set<number>>(new Set());

  // Modal Visibility States
  const [isSweepModalOpen, setIsSweepModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const toggleSweepSelection = useCallback((id: number) => {
    setSelectedSweepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllFunded = useCallback(
    (filter: "all" | "evm" | "sol" = "all") => {
      const fundedWallets = wallets.filter((w) => {
        if (filter === "evm") return hasFundsOnEvm(w.balances, w.tokens);
        if (filter === "sol") return hasFundsOnSol(w.balances, w.tokens);
        return hasFundsForWallet(w.balances, w.type, w.tokens);
      });
      setSelectedSweepIds(new Set(fundedWallets.map((w) => w.id)));
    },
    [wallets]
  );

  const clearSweepSelection = useCallback(() => {
    setSelectedSweepIds(new Set());
  }, []);

  const filteredWallets = useMemo(() => {
    let list = wallets;
    if (tagFilter) {
      list = list.filter((w) => w.label === tagFilter);
    }
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((w) => {
      if (w.label && w.label.toLowerCase().includes(q)) return true;
      if (w.address && w.address.toLowerCase().includes(q)) return true;
      if (w.solAddress && w.solAddress.toLowerCase().includes(q)) return true;
      if (w.btcAddress && w.btcAddress.toLowerCase().includes(q)) return true;
      if (w.type.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [wallets, tagFilter, search]);

  const fundedCount = useMemo(
    () => wallets.filter((w) => hasFundsForWallet(w.balances, w.type, w.tokens)).length,
    [wallets]
  );

  return {
    selectedId,
    setSelectedId,
    search,
    setSearch,
    tagFilter,
    setTagFilter,
    selectedSweepIds,
    setSelectedSweepIds,
    toggleSweepSelection,
    selectAllFunded,
    clearSweepSelection,
    isSweepModalOpen,
    setIsSweepModalOpen,
    isExportModalOpen,
    setIsExportModalOpen,
    isResetModalOpen,
    setIsResetModalOpen,
    filteredWallets,
    fundedCount,
  };
}
