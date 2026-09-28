import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../context/AppContext";
import { IconSearch, IconWallet, IconX, IconExport, IconTrash } from "../../icons";
import { SidebarFilterTabs } from "../sidebar/SidebarFilterTabs";
import { WalletRow, type Filter } from "../sidebar/WalletRow";
import type { WalletView } from "../../lib/types/index";
import { isEvmWallet, isSolanaWallet } from "../../lib/wallets/wallet";
import {
  balanceAmount,
  hasFundsOnChain,
  hasFundsOnEvm,
  hasFundsOnSol,
  totalBalanceOnEvm,
  totalBalanceOnSol,
} from "../../lib/chains/chains";

const ITEM_HEIGHT = 68;
const BUFFER_ITEMS = 5;

interface ListItem {
  type: "header" | "wallet";
  id: string | number;
  title?: string;
  count?: number;
  wallet: WalletView;
  index: number;
}

interface WalletsDrawerProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelectWallet?: (wallet: WalletView) => void;
}

export function WalletsDrawer({
  isOpen,
  onOpen,
  onClose,
  onSelectWallet,
}: WalletsDrawerProps) {
  const {
    filteredWallets,
    wallets,
    selectedId,
    setSelectedId,
    search,
    setSearch,
    selectedSweepIds,
    toggleSweepSelection,
    selectAllFunded,
    clearSweepSelection,
    tagFilter,
    setTagFilter,
    setIsExportModalOpen,
    setIsResetModalOpen,
  } = useApp();

  const [filter, setFilter] = useState<Filter>("all");
  const [chainFilter, setChainFilter] = useState<string>("all");

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const w of wallets) {
      if (w.label?.trim()) set.add(w.label.trim());
    }
    return Array.from(set);
  }, [wallets]);

  const evmWallets = useMemo(() => {
    const arr = filteredWallets.filter((w) => Boolean(w.address));
    return arr.slice().sort((a, b) => {
      const aFunds = hasFundsOnEvm(a.balances, a.tokens);
      const bFunds = hasFundsOnEvm(b.balances, b.tokens);
      if (aFunds !== bFunds) return bFunds ? 1 : -1;
      if (aFunds && bFunds) {
        const balA = totalBalanceOnEvm(a.balances, a.tokens);
        const balB = totalBalanceOnEvm(b.balances, b.tokens);
        if (balB !== balA) return balB - balA;
      }
      return a.id - b.id;
    });
  }, [filteredWallets]);

  const btcWallets = useMemo(() => {
    const arr = filteredWallets.filter((w) => Boolean(w.btcAddress));
    return arr.slice().sort((a, b) => {
      const aFunds = hasFundsOnChain("btc", a.balances, a.tokens);
      const bFunds = hasFundsOnChain("btc", b.balances, b.tokens);
      if (aFunds !== bFunds) return bFunds ? 1 : -1;
      if (aFunds && bFunds) {
        const balA = balanceAmount(a.balances["btc"]);
        const balB = balanceAmount(b.balances["btc"]);
        if (balB !== balA) return balB - balA;
      }
      return a.id - b.id;
    });
  }, [filteredWallets]);

  const solWallets = useMemo(() => {
    const arr = filteredWallets.filter((w) => Boolean(w.solAddress));
    return arr.slice().sort((a, b) => {
      const aFunds = hasFundsOnSol(a.balances, a.tokens);
      const bFunds = hasFundsOnSol(b.balances, b.tokens);
      if (aFunds !== bFunds) return bFunds ? 1 : -1;
      if (aFunds && bFunds) {
        const balA = totalBalanceOnSol(a.balances, a.tokens);
        const balB = totalBalanceOnSol(b.balances, b.tokens);
        if (balB !== balA) return balB - balA;
      }
      return a.id - b.id;
    });
  }, [filteredWallets]);

  const fundedCount = useMemo(() => wallets.filter((w) => w.hasFunds).length, [wallets]);
  const evmFundedCount = useMemo(
    () => wallets.filter((w) => Boolean(w.address) && hasFundsOnEvm(w.balances, w.tokens)).length,
    [wallets],
  );
  const solFundedCount = useMemo(
    () => wallets.filter((w) => Boolean(w.solAddress) && hasFundsOnSol(w.balances, w.tokens)).length,
    [wallets],
  );
  const btcFundedCount = useMemo(
    () => wallets.filter((w) => Boolean(w.btcAddress) && hasFundsOnChain("btc", w.balances, w.tokens)).length,
    [wallets],
  );
  const bscFundedCount = useMemo(
    () => wallets.filter((w) => hasFundsOnChain("bsc", w.balances, w.tokens)).length,
    [wallets],
  );
  const ethFundedCount = useMemo(
    () => wallets.filter((w) => hasFundsOnChain("eth", w.balances, w.tokens)).length,
    [wallets],
  );
  const baseFundedCount = useMemo(
    () => wallets.filter((w) => hasFundsOnChain("base", w.balances, w.tokens)).length,
    [wallets],
  );
  const arbFundedCount = useMemo(
    () => wallets.filter((w) => hasFundsOnChain("arb", w.balances, w.tokens)).length,
    [wallets],
  );
  const robinhoodFundedCount = useMemo(
    () => wallets.filter((w) => hasFundsOnChain("robinhood", w.balances, w.tokens)).length,
    [wallets],
  );

  const list: WalletView[] = useMemo(() => {
    if (filter === "funded") {
      let res = filteredWallets.filter((w) => w.hasFunds);
      if (chainFilter !== "all") {
        res = res.filter((w) => hasFundsOnChain(chainFilter, w.balances, w.tokens));
        if (chainFilter === "sol") {
          return res.slice().sort((a, b) => totalBalanceOnSol(b.balances, b.tokens) - totalBalanceOnSol(a.balances, a.tokens));
        } else {
          return res.slice().sort((a, b) => balanceAmount(b.balances[chainFilter]) - balanceAmount(a.balances[chainFilter]));
        }
      }
      return res;
    }
    if (filter === "btc") return btcWallets;
    if (filter === "evm") return evmWallets;
    if (filter === "sol") return solWallets;
    return filteredWallets;
  }, [filter, chainFilter, filteredWallets, btcWallets, evmWallets, solWallets]);

  const activeScopeFundedCount =
    filter === "btc"
      ? btcFundedCount
      : filter === "evm"
        ? evmFundedCount
        : filter === "sol"
          ? solFundedCount
          : fundedCount;

  const isAllFundedSelected = activeScopeFundedCount > 0 && selectedSweepIds.size >= activeScopeFundedCount;

  const selectedFamily = useMemo<"evm" | "sol" | null>(() => {
    if (selectedSweepIds.size === 0) return null;
    const firstSelectedId = Array.from(selectedSweepIds)[0];
    const firstWallet = wallets.find((w) => w.id === firstSelectedId);
    if (!firstWallet) return null;
    return isEvmWallet(firstWallet.type) ? "evm" : "sol";
  }, [selectedSweepIds, wallets]);

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    const w = wallets.find((item) => item.id === id);
    if (w && onSelectWallet) {
      onSelectWallet(w);
    }
  }, [setSelectedId, wallets, onSelectWallet]);

  const handleToggleSweep = useCallback((id: number) => {
    toggleSweepSelection(id);
  }, [toggleSweepSelection]);

  const items: ListItem[] = useMemo(() => {
    return list.map((w, i) => ({
      type: "wallet",
      id: w.id,
      wallet: w,
      index: i + 1,
    }));
  }, [list]);

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(750);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    setContainerHeight(el.clientHeight || 750);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setContainerHeight(entry.contentRect.height);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  const totalHeight = items.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_ITEMS);
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_ITEMS);
  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * ITEM_HEIGHT;

  return (
    <>
      {/* Edge Pull Tab (Opening tab on right edge) - ONLY when closed */}
      {!isOpen &&
        createPortal(
          <aside className="wallets-drawer-edge-tab-wrapper" aria-label="Wallets Drawer Handle">
            <button
              type="button"
              className="wallets-drawer-pull-tab"
              onClick={onOpen}
              data-tooltip={`Wallets Directory (${wallets.length.toLocaleString()} wallets) — Click to open`}
              data-tooltip-pos="left"
              aria-label="Open Wallets Drawer"
            >
              <div className="pull-tab-grip-bar" aria-hidden />
              <svg className="pull-tab-chevron" width="7" height="11" viewBox="0 0 7 11" fill="none">
                <path d="M5.5 9.5L1.5 5.5L5.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </aside>,
          document.body
        )}

      {/* Docked Right Sidebar Panel (Pushes workspace smoothly without overlapping) */}
      <aside
        className={`wallets-docked-drawer ${isOpen ? "is-open" : "is-closed"}`}
        role="complementary"
        aria-label="Wallets Directory"
      >
        {/* Edge Push Tab (Closing tab on drawer edge) - ONLY when open */}
        {isOpen && (
          <button
            type="button"
            className="wallets-drawer-edge-close"
            onClick={onClose}
            data-tooltip="Close Wallets Directory"
            aria-label="Close Wallets Drawer"
          >
            <svg className="edge-close-chevron" width="7" height="11" viewBox="0 0 7 11" fill="none">
              <path d="M1.5 1.5L5.5 5.5L1.5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="pull-tab-grip-bar" aria-hidden />
          </button>
        )}

        <div className="wallets-drawer-clip-wrap">
          <div className="wallets-drawer-inner">

        {/* Top Header Row */}
        <div className="wallets-drawer-header">
          <div className="wallets-drawer-badge">
            <IconWallet size={13} />
            <span className="mono">{wallets.length.toLocaleString()}</span>
            <span className="badge-unit">Wallets</span>
          </div>

          <div className="wallets-drawer-actions">
            <button
              type="button"
              className="btn-header-action"
              onClick={() => setIsExportModalOpen(true)}
              data-tooltip="Export Wallets (CSV / TXT)"
            >
              <IconExport size={12} />
              <span>Export</span>
            </button>

            <button
              type="button"
              className="btn-header-action btn-danger-action"
              onClick={() => setIsResetModalOpen(true)}
              data-tooltip="Reset All Wallets (Purge Database)"
            >
              <IconTrash size={12} />
              <span>Reset</span>
            </button>

            <button
              type="button"
              className="wallets-drawer-close-btn"
              onClick={onClose}
              data-tooltip="Close Wallets Directory"
              data-tooltip-pos="left"
              aria-label="Close Wallets Drawer"
            >
              <IconX size={13} />
            </button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="wallets-drawer-search">
          <div className="search-wrap">
            <IconSearch className="search-icon" />
            <input
              className="search-input"
              placeholder="Search address, label, secret…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearch("")}
                data-tooltip="Clear Search"
              >
                <IconX size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs & Scope Selectors */}
        <div className="wallets-drawer-filters">
          <SidebarFilterTabs
            totalCount={wallets.length}
            filter={filter}
            setFilter={setFilter}
            chainFilter={chainFilter}
            setChainFilter={setChainFilter}
            fundedCount={fundedCount}
            bscFundedCount={bscFundedCount}
            solFundedCount={solFundedCount}
            ethFundedCount={ethFundedCount}
            btcFundedCount={btcFundedCount}
            baseFundedCount={baseFundedCount}
            arbFundedCount={arbFundedCount}
            robinhoodFundedCount={robinhoodFundedCount}
            existingTags={existingTags}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            activeScopeFundedCount={activeScopeFundedCount}
            selectedSweepCount={selectedSweepIds.size}
            isAllFundedSelected={isAllFundedSelected}
            onSelectAllFunded={selectAllFunded}
            onClearSweepSelection={clearSweepSelection}
          />
        </div>

        {/* Virtualized Infinite Scrollable List */}
        <div
          className="wallets-drawer-list scrollable"
          ref={scrollRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {!items.length ? (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon">
                {filter === "funded" ? <IconWallet size={22} /> : <IconSearch size={22} />}
              </div>
              {filter === "funded" ? (
                <>No funded wallets detected in current filter.<br />Run <b>Scan All</b> to check live balances.</>
              ) : filter === "evm" ? (
                <>No EVM wallets found.</>
              ) : filter === "sol" ? (
                <>No Solana wallets found.</>
              ) : (
                <>No matching wallets found.</>
              )}
            </div>
          ) : (
            <div style={{ height: `${totalHeight}px`, position: "relative", width: "100%" }}>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${offsetY}px)`,
                  willChange: "transform",
                }}
              >
                {visibleItems.map((item) => {
                  const w = item.wallet;
                  return (
                    <WalletRow
                      key={w.id}
                      wallet={w}
                      index={item.index}
                      selected={selectedId === w.id}
                      sweepChecked={selectedSweepIds.has(w.id)}
                      filterScope={filter}
                      targetChain={filter === "funded" ? chainFilter : "all"}
                      hideCheckbox={
                        selectedFamily !== null &&
                        (selectedFamily === "evm" ? !isEvmWallet(w.type) : !isSolanaWallet(w.type))
                      }
                      onSelect={handleSelect}
                      onToggleSweep={handleToggleSweep}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Summary Bar */}
        <div className="wallets-drawer-footer">
          <span className="mono" style={{ fontSize: "11px", color: "var(--text-dim)" }}>
            Showing {items.length.toLocaleString()} of {wallets.length.toLocaleString()} wallets
          </span>
          {selectedSweepIds.size > 0 && (
            <span
              className="mono"
              style={{
                fontSize: "11px",
                color: "var(--accent)",
                fontWeight: 600,
                background: "var(--accent-soft)",
                padding: "2px 8px",
                borderRadius: "var(--r-sm)",
              }}
            >
              {selectedSweepIds.size} Selected
            </span>
          )}
        </div>
      </div>
    </div>
  </aside>
    </>
  );
}
