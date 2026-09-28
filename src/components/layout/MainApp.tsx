import { useState, useMemo, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { Sidebar } from "./Sidebar";
import { WalletDetail } from "../wallet/WalletDetail";
import { TradingWorkspace, type TradingMode } from "../trade/TradingWorkspace";
import { ExportModal } from "../modals/ExportModal";
import { ResetAllWalletsModal } from "../modals/ResetAllWalletsModal";
import { PortfolioDirectory } from "../workspaces/PortfolioDirectory";
import { ActivityWorkspace } from "../workspaces/ActivityWorkspace";
import { RepairWorkspace } from "../repair-workspace/RepairWorkspace";
import { WindowControls } from "./WindowControls";
import { UpdateModal } from "../modals/UpdateModal";
import { WalletsDrawer } from "../wallet/WalletsDrawer";
import { useAppUpdater } from "../../context/hooks/useAppUpdater";
import { APP_VERSION } from "../../version";
import { IconLock, ChainIcon, TokenIcon, IconCoin } from "../../icons";
import { balanceAmount, chainsForWallet, CHAINS, tokenBalanceAmount } from "../../lib/chains/chains";
import { ImportWorkspace } from "../workspaces/ImportWorkspace";
import { AllowancesWorkspace } from "../workspaces/AllowancesWorkspace";
import { RpcManagerWorkspace } from "../workspaces/RpcManagerWorkspace";
import { ReceiveModal } from "../modals/ReceiveModal";
import { SendModal } from "../modals/SendModal";
import { BalanceCard } from "../wallet/detail/BalanceCard";
import { fetchLiveTokenPrice, TokenValuationBadge } from "../../services/tokenPriceService";
import { WinRateSparkline } from "../analytics/WinRateSparkline";
import { TokenTradeHistoryPanel } from "../analytics/TokenTradeHistoryPanel";
import { getTradePositions, subscribeTradePositions, type TokenTradePosition } from "../../services/tokenTradeHistoryService";

export function MainApp() {
  const [activeNav, setActiveNav] = useState<string>("dashboard");
  const [tradingMode, setTradingMode] = useState<TradingMode>("swap");
  const [isReceiveOpen, setIsReceiveOpen] = useState<boolean>(false);
  const [isSendOpen, setIsSendOpen] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return typeof window !== "undefined" && window.innerWidth <= 860;
  });
  const [isWalletsDrawerOpen, setIsWalletsDrawerOpen] = useState<boolean>(false);

  const handleOpenWalletsDrawer = () => {
    setIsWalletsDrawerOpen(true);
    setIsCollapsed(true);
  };

  const openTrading = (mode: TradingMode = "swap") => {
    setTradingMode(mode);
    setActiveNav("trading");
  };

  const handleToggleSidebar = (fnOrVal: boolean | ((prev: boolean) => boolean)) => {
    setIsCollapsed((prev) => {
      const next = typeof fnOrVal === "function" ? fnOrVal(prev) : fnOrVal;
      if (!next) {
        setIsWalletsDrawerOpen(false);
      }
      return next;
    });
  };

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 860px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsCollapsed(true);
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const {
    wallets,
    selectedId,
    setSelectedId,
    selectedSweepIds,
    clearSweepSelection,
    scanAll,
    lock,
    scanning,
    scanProgress,
    stopScan,
    fundedCount,
    toast,
    autoLockMinutes,
    setAutoLockMinutes,
    isAirGapped,
    toggleAirGapped,
    search,
    setSearch,
    pricing,
    sessionToken,
  } = useApp();

  const updater = useAppUpdater(isAirGapped, sessionToken);

  const selected = wallets.find((w) => w.id === selectedId) ?? null;
  const seedCount = wallets.filter((w) => w.type === "seed").length;

  const isFilteredByCheckbox = Boolean(selectedSweepIds && selectedSweepIds.size > 0);

  const [tradePositions, setTradePositions] = useState<TokenTradePosition[]>(() => getTradePositions());
  useEffect(() => {
    return subscribeTradePositions((latest) => setTradePositions(latest));
  }, []);

  const tradePositionsMap = useMemo(() => {
    const map = new Map<string, TokenTradePosition>();
    const scopedPositions = isFilteredByCheckbox
      ? tradePositions.filter((position) =>
          position.walletId !== undefined && selectedSweepIds.has(position.walletId),
        )
      : tradePositions;

    for (const position of scopedPositions) {
      const chain = position.chain.toLowerCase();
      if (position.contractAddress) {
        map.set(`${chain}_${position.contractAddress.toLowerCase()}`, position);
      }
      map.set(`${chain}_${position.symbol.toLowerCase()}`, position);
    }
    return map;
  }, [tradePositions, isFilteredByCheckbox, selectedSweepIds]);

  const activeWallets = useMemo(() => {
    if (isFilteredByCheckbox) {
      return wallets.filter((w) => selectedSweepIds.has(w.id));
    }
    return wallets;
  }, [wallets, selectedSweepIds, isFilteredByCheckbox]);
  const valuationWallets = activeWallets;
  const [liveTokenPrices, setLiveTokenPrices] = useState<Record<string, number>>({});
  const valuationTokens = useMemo(() => {
    const unique = new Map<string, { chain: string; contractAddress: string }>();
    for (const wallet of valuationWallets) {
      for (const token of wallet.tokens || []) {
        if (!token.contractAddress) continue;
        const chain = token.chain.toLowerCase();
        const contractAddress = token.contractAddress.toLowerCase();
        unique.set(`${chain}:${contractAddress}`, { chain, contractAddress });
      }
    }
    return Array.from(unique.entries()).map(([key, token]) => ({ key, ...token }));
  }, [valuationWallets]);

  useEffect(() => {
    if (!sessionToken || isAirGapped || valuationTokens.length === 0) return;
    let cancelled = false;
    let refreshInFlight = false;
    const controller = new AbortController();

    const refreshTokenPrices = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const nextPrices: Record<string, number> = {};
        for (let index = 0; index < valuationTokens.length; index += 20) {
          const batch = valuationTokens.slice(index, index + 20);
          const quotes = await Promise.all(batch.map(async (token) => {
            const nativeSymbol = token.chain === "sol" ? "SOL"
              : token.chain === "bsc" ? "BNB"
              : token.chain === "btc" ? "BTC"
              : "ETH";
            const quote = await fetchLiveTokenPrice(
              token.contractAddress,
              pricing.getUsd("ETH"),
              token.chain,
              pricing.getUsd(nativeSymbol),
              { sessionToken, isAirGapped, signal: controller.signal },
            );
            return quote ? [token.key, quote.usd] as const : null;
          }));
          for (const quote of quotes) {
            if (quote && quote[1] > 0) nextPrices[quote[0]] = quote[1];
          }
          if (cancelled) return;
        }
        if (!cancelled) setLiveTokenPrices((previous) => ({ ...previous, ...nextPrices }));
      } finally {
        refreshInFlight = false;
      }
    };

    void refreshTokenPrices();
    const interval = window.setInterval(() => void refreshTokenPrices(), 60_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [sessionToken, isAirGapped, valuationTokens, pricing.getUsd]);

  const activeFundedCount = useMemo(
    () => activeWallets.filter((wallet) => wallet.hasFunds).length,
    [activeWallets],
  );

  const activeTokens = useMemo(() => {
    interface MergedToken {
      chain: string;
      symbol: string;
      name: string;
      balance: string;
      amount: number;
      decimals?: number | null;
      contractAddress?: string;
      logoUrl?: string | null;
      walletCount: number;
      walletNames: string[];
    }

    const tokenMap = new Map<string, MergedToken>();

    for (const w of activeWallets) {
      if (!w.tokens || !Array.isArray(w.tokens)) continue;
      const wName = w.label || `Wallet #${w.id}`;

      for (const tok of w.tokens) {
        if (!tok || !tok.symbol) continue;
        const key = `${tok.chain.toLowerCase()}_${(tok.contractAddress || tok.symbol).toLowerCase()}`;
        const existing = tokenMap.get(key);

        if (!existing) {
          tokenMap.set(key, {
            chain: tok.chain,
            symbol: tok.symbol,
            name: tok.name,
            balance: tok.balance,
            amount: tokenBalanceAmount(tok),
            decimals: tok.decimals,
            contractAddress: tok.contractAddress,
            logoUrl: tok.logoUrl,
            walletCount: 1,
            walletNames: [wName],
          });
        } else {
          existing.amount += tokenBalanceAmount(tok);
          if (existing.decimals == null && tok.decimals != null) existing.decimals = tok.decimals;
          if (!existing.logoUrl && tok.logoUrl) existing.logoUrl = tok.logoUrl;
          const maxFractionDigits = Math.min(Math.max(existing.decimals ?? 8, 0), 18);
          const formattedAmount = existing.amount.toLocaleString(undefined, {
            maximumFractionDigits: maxFractionDigits,
          });
          existing.balance = `${formattedAmount} ${tok.symbol}`;
          existing.walletCount += 1;
          if (!existing.walletNames.includes(wName)) {
            existing.walletNames.push(wName);
          }
        }
      }
    }

    const list = Array.from(tokenMap.values());
    return list;
  }, [activeWallets]);

  const activeNativeBalances = useMemo(() => {
    const relevantChains =
      activeWallets.length === 1 ? chainsForWallet(activeWallets[0]) : CHAINS;

    return relevantChains.map((c) => {
      if (activeWallets.length === 1) {
        return {
          chain: c,
          value: activeWallets[0].balances?.[c.key] ?? null,
        };
      }

      let total = 0;
      let hasFunds = false;
      let isLoading = false;
      let isError = false;

      for (const w of activeWallets) {
        const val = w.balances?.[c.key];
        if (val === "loading") isLoading = true;
        if (val === "error") isError = true;
        const num = balanceAmount(val);
        if (num > 0) {
          total += num;
          hasFunds = true;
        }
      }

      let displayVal: string | null = null;
      if (isLoading) {
        displayVal = "loading";
      } else if (isError && !hasFunds) {
        displayVal = "error";
      } else if (hasFunds) {
        displayVal = `${total.toFixed(6).replace(/\.?0+$/, "")} ${c.symbol}`;
      } else {
        displayVal = `0 ${c.symbol}`;
      }

      return {
        chain: c,
        value: displayVal,
      };
    });
  }, [activeWallets]);

  const totalPortfolioUsd = useMemo(() => {
    let sum = 0;
    for (const w of valuationWallets) {
      const chains = chainsForWallet(w);
      for (const c of chains) {
        const val = w.balances?.[c.key];
        const num = balanceAmount(val);
        if (num > 0) {
          sum += num * pricing.getUsd(c.symbol);
        }
      }
      if (w.tokens) {
        for (const t of w.tokens) {
          const num = tokenBalanceAmount(t);
          if (num > 0) {
            const quoteKey = t.contractAddress
              ? `${t.chain.toLowerCase()}:${t.contractAddress.toLowerCase()}`
              : "";
            const unitUsd = quoteKey && liveTokenPrices[quoteKey] > 0
              ? liveTokenPrices[quoteKey]
              : pricing.getTokenUsd(t.symbol, t.chain, t.contractAddress);
            sum += num * unitUsd;
          }
        }
      }
    }
    return sum;
  }, [valuationWallets, liveTokenPrices, pricing.getUsd, pricing.getTokenUsd]);

  const unpricedTokenCount = useMemo(() => {
    const unpriced = new Set<string>();
    for (const wallet of valuationWallets) {
      for (const token of wallet.tokens || []) {
        if (tokenBalanceAmount(token) <= 0) continue;
        const key = token.contractAddress
          ? `${token.chain.toLowerCase()}:${token.contractAddress.toLowerCase()}`
          : `${token.chain.toLowerCase()}:${token.symbol.toLowerCase()}`;
        const livePrice = token.contractAddress ? liveTokenPrices[key] : undefined;
        const reportedPrice = pricing.getTokenUsd(token.symbol, token.chain, token.contractAddress);
        if (!(livePrice && livePrice > 0) && !(reportedPrice > 0)) unpriced.add(key);
      }
    }
    return unpriced.size;
  }, [valuationWallets, liveTokenPrices, pricing.getTokenUsd]);

  const portfolioValuation = useMemo(() => {
    return pricing.formatValuation(totalPortfolioUsd);
  }, [totalPortfolioUsd, pricing.formatValuation]);

  const pageTitle = useMemo(() => {
    switch (activeNav) {
      case "dashboard": return "Dashboard";
      case "wallets": return selected ? `Wallet #${selected.id}` : "Portfolio & Wallets";
      case "activity": return "Activity & Audit Log";
      case "trading": return "Trading";
      case "import": return "Import Wallet";
      case "repair": return "Mnemonic Typo Repair";
      case "allowance": return "Token Approvals & Allowances";
      case "rpc": return "RPC Manager";
      default: return "Vault";
    }
  }, [activeNav, selected]);

  return (
    <div className="app">
      <div className="app-mesh" aria-hidden />

      {/* ── Top Header (Single Clean Hairline Bar without Duplicate Tabs) ── */}
      <header className="app-header" data-tauri-drag-region>
        {/* 1. Left: Breadcrumbs */}
        <div className="crumb">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span
            className="crumb-link"
            onClick={() => {
              setActiveNav("wallets");
              setSelectedId(null);
            }}
            data-tooltip="Go to Vault Portfolio"
          >
            Vault
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
          <b>{pageTitle}</b>
        </div>

        {/* 2. Center: Global Search Input */}
        <div className="header-center-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
          <input
            type="text"
            className="header-search-input"
            placeholder="Search wallets, tokens, addresses, labels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* 3. Right: Status & Actions */}
        <div className="app-header-actions">
          {/* Network Connection Group */}
          <div className="header-group">
            <div className={`pill ${isAirGapped ? "warn" : "ok"}`} data-tooltip={isAirGapped ? "Safe Mode: gated app requests disabled" : "App network mode: online"}>
              <span className="pdot" />
              <span>{isAirGapped ? "Air-Gap" : "Online"}</span>
            </div>

            <button
              type="button"
              className={`btn-airgap-toggle ${isAirGapped ? "is-safe" : "is-online"}`}
              onClick={toggleAirGapped}
              role="switch"
              aria-checked={!isAirGapped}
              data-tooltip={
                isAirGapped
                  ? "Safe Mode: app-controlled network requests are disabled (Click to go Online)"
                  : "Online Mode: app-controlled network requests allowed (Click to activate Safe Mode)"
              }
              data-tooltip-pos="bottom"
            >
              <span>{isAirGapped ? "Safe" : "Online"}</span>
              <span className={`toggle-switch-track ${!isAirGapped ? "active" : "inactive"}`}>
                <span className="toggle-switch-thumb" />
              </span>
            </button>
          </div>

          <span className="header-divider" />

          {/* Security Group: Auto-lock & Manual Lock */}
          <div className="header-group">
            <select
              className="select-autolock-header"
              value={autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
              data-tooltip="Auto-Lock Timer: Set idle time before vault locks"
            >
              <option value={0}>⏱️ Off</option>
              <option value={1}>⏱️ 1m</option>
              <option value={5}>⏱️ 5m</option>
              <option value={15}>⏱️ 15m</option>
              <option value={30}>⏱️ 30m</option>
              <option value={60}>⏱️ 1h</option>
            </select>

            <button
              type="button"
              className="btn-lock-minimal"
              onClick={lock}
              data-tooltip="Lock Vault Immediately (Ctrl+L)"
            >
              <IconLock size={13} />
            </button>
          </div>

          {/* Update Available Notification Button */}
          {updater.updateAvailable && (
            <button
              type="button"
              className="btn-update-available"
              onClick={() => updater.setShowModal(true)}
              data-tooltip={`Plurivex update v${updater.newVersion} available! Click to view & install.`}
              data-tooltip-pos="bottom"
            >
              <span className="update-pulse-dot" />
              <span>🚀 Update v{updater.newVersion}</span>
            </button>
          )}

          <span className="header-divider" />

          {/* Window Controls */}
          <WindowControls />
        </div>
      </header>

      {/* ── Live Scan Progress Banner ── */}
      {scanProgress && scanProgress.isScanning && (
        <div className="scan-progress-banner">
          <div className="scan-progress-left">
            <div className="scan-progress-spinner" />
            <div className="scan-progress-text">
              <span className="scan-progress-title">
                Scanning Multi-Chain Balances ({scanProgress.completed}/{scanProgress.total})
                {scanProgress.currentLabel && (
                  <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 6, fontSize: "11px" }}>
                    · {scanProgress.currentLabel}
                  </span>
                )}
              </span>
              <span className="scan-progress-stats">
                {Math.round((scanProgress.completed / Math.max(scanProgress.total, 1)) * 100)}% completed · {scanProgress.funded} funded detected
              </span>
            </div>
          </div>
          <div className="scan-progress-bar-wrap">
            <div
              className="scan-progress-bar-fill"
              style={{
                width: `${Math.round((scanProgress.completed / Math.max(scanProgress.total, 1)) * 100)}%`,
              }}
            />
          </div>
          <button type="button" className="btn btn-ghost btn-sm scan-stop-btn" onClick={stopScan}>
            Stop
          </button>
        </div>
      )}

      {/* ── Main App Shell Body ── */}
      <div className="app-body">
        <Sidebar
          activeNav={activeNav}
          setActiveNav={(nav) => {
            setActiveNav(nav);
            if (nav === "wallets" && selectedId !== null) {
              setSelectedId(null);
            }
          }}
          isCollapsed={isCollapsed}
          setIsCollapsed={handleToggleSidebar}
        />

        <div className="main">
          <div className="detail-panel scrollable">
            {/* View Router */}
            {activeNav === "repair" ? (
              <RepairWorkspace
                onBackToVault={() => setActiveNav("dashboard")}
                onOpenInSweeper={() => openTrading("transfer")}
              />
            ) : activeNav === "trading" ? (
              <TradingWorkspace mode={tradingMode} onModeChange={setTradingMode} />
            ) : activeNav === "activity" ? (
              <ActivityWorkspace
                onBack={() => setActiveNav("dashboard")}
                onOpenSweeper={() => openTrading("transfer")}
              />
            ) : activeNav === "import" ? (
              <ImportWorkspace
                onBack={() => setActiveNav("dashboard")}
                onComplete={() => setActiveNav("wallets")}
              />
            ) : activeNav === "allowance" ? (
              <AllowancesWorkspace onBack={() => setActiveNav("dashboard")} />
            ) : activeNav === "rpc" ? (
              <RpcManagerWorkspace onBack={() => setActiveNav("dashboard")} />
            ) : activeNav === "wallets" ? (
              selected ? (
                <div style={{ minWidth: 0, width: "100%", overflowX: "hidden" }}>
                  <div style={{ padding: "14px 24px 0", display: "flex", alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelectedId(null)}
                      style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      ← Back to Portfolio &amp; Wallets
                    </button>
                  </div>
                  <WalletDetail key={selected.id} wallet={selected} />
                </div>
              ) : (
                <PortfolioDirectory
                  onOpenImport={() => setActiveNav("import")}
                  onOpenSweeper={() => openTrading("transfer")}
                />
              )
            ) : (
              /* Executive Dashboard View (Overview) */
              <div className="dashboard-overview" style={{ padding: "20px 24px" }}>
                {/* Mockup Page Head */}
                <div className="page-head">
                  <div className="grow">
                    <h1>Welcome to Plurivex Vault 👋</h1>
                    <p>Your vault overview today — everything is secure and protected.</p>
                  </div>
                  <div className="page-head-actions">
                    <span className="badge b-ghost" style={{ height: "26px", padding: "0 10px", fontSize: "10.5px" }}>
                      {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </span>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => scanAll()}
                      disabled={scanning}
                      style={{ height: "26px", padding: "0 10px", fontSize: "10.5px" }}
                    >
                      {scanning ? "Scanning…" : "Refresh"}
                    </button>
                  </div>
                </div>

                {/* Hero Net Worth Card */}
                <div className="hero">
                  <div>
                    <div className="label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                        <span>Total Monitored Balance</span>
                      </div>

                      {/* Live Currency Selector & Oracle Status */}
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <select
                          className="val-currency-select mono"
                          value={pricing.currency}
                          onChange={(e) => pricing.setCurrency(e.target.value)}
                          aria-label="Select valuation currency"
                          data-tooltip="Select currency valuation (Default: USD)"
                          style={{
                            background: "rgba(255, 255, 255, 0.08)",
                            color: "var(--accent, #7aa2f7)",
                            border: "1px solid var(--border, rgba(255, 255, 255, 0.12))",
                            borderRadius: "4px",
                            padding: "1px 6px",
                            fontSize: "10.5px",
                            fontWeight: 600,
                            cursor: "pointer",
                            outline: "none",
                          }}
                        >
                          {pricing.supportedCurrencies.map((c) => (
                            <option
                              key={c.code}
                              value={c.code}
                              style={{ background: "#1a1b26", color: "#c0caf5" }}
                            >
                              {c.code} ({c.symbol})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="amount" style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                      <span>{portfolioValuation.primary}</span>
                      {portfolioValuation.secondary && (
                        <small style={{ fontSize: "14px", color: "var(--text-dim)", fontWeight: 500 }}>
                          ({portfolioValuation.secondary})
                        </small>
                      )}
                      {pricing.priceReport?.stale && (
                        <span
                          className="val-offline-badge"
                          data-tooltip="Estimated value based on cached/offline exchange rates"
                          style={{
                            fontSize: "10.5px",
                            padding: "2px 7px",
                            borderRadius: "999px",
                            background: "rgba(245, 158, 11, 0.12)",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                            color: "#f59e0b",
                            fontWeight: 600,
                            letterSpacing: "0.02em",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            marginLeft: "4px",
                          }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                          Offline
                        </span>
                      )}
                    </div>
                    <div className="delta">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 15l-6-6-6 6"/>
                      </svg>
                      {activeFundedCount} of {activeWallets.length} wallets have active balances
                    </div>
                    {unpricedTokenCount > 0 && (
                      <div
                        style={{ color: "var(--text-dim)", fontSize: "10px", marginTop: "4px" }}
                        title="Token tanpa quote DEX yang cocok dengan chain + kontrak dikecualikan dari total nilai USD."
                      >
                        {unpricedTokenCount} token tidak masuk total USD (quote pasar belum tersedia)
                      </div>
                    )}
                    <div className="actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setIsReceiveOpen(true)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12l7 7 7-7"/>
                        </svg>
                        Receive
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          if (wallets.length === 0) {
                            toast("No active wallet in vault. Please import a wallet first.", "info");
                            setActiveNav("import");
                            return;
                          }
                          setIsSendOpen(true);
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 19V5M5 12l7-7 7 7"/>
                        </svg>
                        Send
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => openTrading("transfer")}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>
                        </svg>
                        Start Sweep
                      </button>
                    </div>
                  </div>

                  <WinRateSparkline
                    activeWallets={isFilteredByCheckbox ? activeWallets : undefined}
                    allWallets={wallets}
                    fundedCount={fundedCount}
                    seedCount={seedCount}
                    onViewActivity={() => setActiveNav("activity")}
                  />
                </div>


                {/* ── Conditional Dashboard Detail: Only display when wallet(s) are checked in sidebar ── */}
                {!isFilteredByCheckbox ? (
                  <div
                    className="wallet-unselected-prompt-container"
                    style={{
                      marginTop: "20px",
                      padding: "44px 24px",
                      background: "linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(0, 0, 0, 0.25) 100%)",
                      border: "1px dashed var(--border)",
                      borderRadius: "12px",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "52px",
                        height: "52px",
                        borderRadius: "12px",
                        background: "rgba(204, 255, 0, 0.08)",
                        border: "1px solid rgba(204, 255, 0, 0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--accent, #ccff00)",
                        boxShadow: "0 4px 18px rgba(0, 0, 0, 0.25)",
                      }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 11 12 14 22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>

                    <div style={{ maxWidth: "480px" }}>
                      <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: "750", color: "var(--text)", letterSpacing: "-0.01em" }}>
                        Pilih / Centang Wallet Terlebih Dahulu
                      </h3>
                      <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-dim)", lineHeight: "1.6" }}>
                        Belum ada wallet yang dicentang. Silakan centang satu atau beberapa wallet pada daftar di <b>sidebar sebelah kanan</b> untuk menampilkan rincian saldo native, token yang dimiliki, dan riwayat trade token.
                      </p>
                    </div>

                    {!isWalletsDrawerOpen && (
                      <button
                        type="button"
                        className="btn primary sm"
                        onClick={handleOpenWalletsDrawer}
                        style={{
                          marginTop: "4px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          padding: "6px 14px",
                          fontWeight: "600",
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <line x1="9" y1="3" x2="9" y2="21" />
                        </svg>
                        Buka Sidebar Wallet
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* ── Module B: Native Chain Gas & Reserves Grid ── */}
                    <div className="balance-section" style={{ padding: "16px 0 0 0" }}>
                  <div
                    className="balance-section-head"
                    style={{
                      marginBottom: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <h4
                          className="balance-section-title"
                          style={{ margin: 0, fontSize: "13px", fontWeight: "750", color: "var(--text)" }}
                        >
                          {activeWallets.length === 1 && activeWallets[0].type === "sol_pk"
                            ? "NATIVE SOLANA BALANCE"
                            : "MULTI-CHAIN NATIVE BALANCES"}
                        </h4>
                        {isFilteredByCheckbox ? (
                          <span
                            style={{
                              fontSize: "9.5px",
                              fontWeight: "750",
                              background: "rgba(204, 255, 0, 0.12)",
                              color: "var(--accent, #ccff00)",
                              border: "1px solid rgba(204, 255, 0, 0.35)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            ✓ {selectedSweepIds.size} Dompet Tercentang di Sidebar
                          </span>
                        ) : selectedId !== null ? (
                          <span
                            style={{
                              fontSize: "9.5px",
                              fontWeight: "700",

                              background: "var(--surface-3)",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            Dompet Aktif: {wallets.find((w) => w.id === selectedId)?.label || `Wallet #${selectedId}`}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "9.5px",
                              fontWeight: "600",
                              background: "var(--surface-2)",
                              color: "var(--text-dim)",
                              border: "1px solid var(--border)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            Semua Dompet Terdaftar
                          </span>
                        )}
                      </div>
                      <span className="balance-section-hint" style={{ display: "block", marginTop: "3px" }}>
                        {isFilteredByCheckbox
                          ? `Saldo koin gas native dari: ${activeWallets.map((w) => w.label || `Wallet #${w.id}`).join(", ")}`
                          : "Realtime RPC Gas Reserves & Native Liquid Assets"}
                      </span>
                    </div>

                    {isFilteredByCheckbox && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={clearSweepSelection}
                          style={{ fontSize: "10.5px", padding: "0 10px", height: "26px" }}
                          title="Hapus filter centang sidebar"
                        >
                          Reset Filter ({selectedSweepIds.size})
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="balance-cards">
                    {activeNativeBalances.map(({ chain, value }) => (
                      <BalanceCard key={chain.key} chain={chain} value={value} />
                    ))}
                  </div>
                </div>

                {/* ── Module C: Detected Token Holdings & Historical Traded Tokens P&L ── */}
                <div
                  className="token-holdings-dual-container"
                  style={{
                    borderTop: "1px dashed var(--border)",
                    padding: "16px 0 0 0",
                    marginTop: "16px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
                    gap: "20px",
                    alignItems: "start",
                  }}
                >
                  {/* Left Column: Detected Active Token Holdings */}
                  <div className="balance-section token-section" style={{ padding: 0, margin: 0, border: "none" }}>
                    <div className="token-section-header" style={{ marginBottom: "12px" }}>
                      <h4 className="balance-section-title" style={{ margin: 0, fontSize: "12.5px", fontWeight: "750", color: "var(--text)" }}>
                        DETECTED TOKEN HOLDINGS ({activeTokens.length})
                      </h4>
                      <span className="token-section-subtitle">ERC-20 &amp; SPL Tokens</span>
                    </div>

                    {activeTokens.length > 0 ? (
                      <div className="token-cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))" }}>
                        {activeTokens.map((tok, idx) => {
                          const tokenKey = tok.contractAddress
                            ? `${tok.chain.toLowerCase()}_${tok.contractAddress.toLowerCase()}`
                            : `${tok.chain.toLowerCase()}_${tok.symbol.toLowerCase()}`;
                          const tradePos = tradePositionsMap.get(tokenKey);

                          return (
                            <div
                              key={`${tok.chain}-${tok.symbol}-${idx}`}
                              className="token-card"
                            >
                              <div className="token-card-top">
                                <span className="token-symbol" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                  <TokenIcon
                                    chain={tok.chain}
                                    symbol={tok.symbol}
                                    contractAddress={tok.contractAddress}
                                    name={tok.name}
                                    logoUrl={tok.logoUrl}
                                    size={16}
                                  />
                                  {tok.symbol}

                                </span>
                                <span
                                  className={`token-chain-badge chain-${tok.chain}`}
                                  title={tok.chain.toUpperCase()}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: "2px 5px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  <ChainIcon chain={tok.chain} size={14} />
                                </span>
                              </div>
                              <div className="token-card-name">{tok.name}</div>
                              <div className="token-card-balance mono">{tok.balance}</div>
                              <TokenValuationBadge
                                token={tok}
                                ethUsdPrice={pricing.getUsd("ETH")}
                                getUsd={pricing.getUsd}
                                livePriceEnabled={Boolean(sessionToken) && !isAirGapped}
                                sessionToken={sessionToken}
                                isAirGapped={isAirGapped}
                              />

                              {/* Live Minus / P&L Badge */}
                              {tradePos && tradePos.priceDiffPercent !== 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "4px",
                                    marginTop: "5px",
                                    fontSize: "10px",
                                    fontFamily: "var(--mono)",
                                    color: tradePos.priceDiffPercent < 0 ? "#f43f5e" : "#10b981",
                                    background: tradePos.priceDiffPercent < 0 ? "rgba(244, 63, 94, 0.08)" : "rgba(16, 185, 129, 0.08)",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    border: tradePos.priceDiffPercent < 0 ? "1px solid rgba(244, 63, 94, 0.22)" : "1px solid rgba(16, 185, 129, 0.22)",
                                  }}
                                  title={`Harga Beli: $${tradePos.buyPriceUsd} | Sekarang: $${tradePos.currentPriceUsd}`}
                                >
                                  <span>{tradePos.priceDiffPercent < 0 ? "Minus Harga:" : "Profit Harga:"}</span>
                                  <span>{tradePos.priceDiffPercent < 0 ? "" : "+"}{tradePos.priceDiffPercent.toFixed(2)}%</span>
                                </div>
                              )}

                              {tok.contractAddress && (
                                <div
                                  style={{
                                    fontSize: "9px",
                                    color: "var(--text-dim)",
                                    fontFamily: "var(--mono)",
                                    marginTop: "4px",
                                  }}
                                >
                                  Contract: {tok.contractAddress.slice(0, 6)}...{tok.contractAddress.slice(-6)}
                                </div>
                              )}
                              {activeWallets.length > 1 && (
                                <div
                                  style={{
                                    fontSize: "9px",
                                    color: "var(--text-faint)",
                                    marginTop: "4px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={tok.walletNames.join(", ")}
                                >
                                  Dompet: {tok.walletNames.join(", ")}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        className="token-empty-notice"
                        style={{
                          padding: "28px 16px",
                          textAlign: "center",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <span className="notice-icon" style={{ display: "inline-flex", justifyContent: "center" }}>
                          <IconCoin size={24} />
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>
                          {isFilteredByCheckbox
                            ? `Belum ada token ERC-20 atau SPL yang terdeteksi pada dompet terpilih.`
                            : `Belum ada token ERC-20 atau SPL yang terdeteksi pada vault.`}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                          Centang dompet di sidebar kanan untuk melihat portofolio token spesifik per dompet.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Historical Traded Tokens & Minus Analysis */}
                  <TokenTradeHistoryPanel
                    activeWallets={isFilteredByCheckbox ? activeWallets : undefined}
                    ethUsdPrice={pricing.getUsd("ETH")}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>

        {/* Docked Wallets Directory Panel */}
        <WalletsDrawer
          isOpen={isWalletsDrawerOpen}
          onOpen={handleOpenWalletsDrawer}
          onClose={() => setIsWalletsDrawerOpen(false)}
          onSelectWallet={(w) => {
            setSelectedId(w.id);
            setActiveNav("wallets");
          }}
        />
      </div>

      {/* ── Realtime Status Footer ── */}
      <footer className="app-footer-bar">
        <div className="footer-left">
          {[
            { key: "btc", name: "BTC", fullName: "Bitcoin" },
            { key: "eth", name: "ETH", fullName: "Ethereum" },
            { key: "robinhood", name: "Robinhood", fullName: "Robinhood Chain" },
            { key: "base", name: "Base", fullName: "Base" },
            { key: "arb", name: "ARB", fullName: "Arbitrum" },
            { key: "bsc", name: "BSC", fullName: "BNB Smart Chain" },
            { key: "sol", name: "Solana", fullName: "Solana" },
          ].map((chain) => (
            <div
              key={chain.key}
              className="rpc-status-pill"
              title={`${chain.fullName} (${isAirGapped ? "Offline" : "Active"})`}
            >
              <span
                className={`pdot ${isAirGapped ? "warn" : "ok"}`}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: isAirGapped ? "var(--warning, #f59e0b)" : "var(--ok, #10b981)",
                }}
              />
              <span className="rpc-text">
                {chain.name} ({isAirGapped ? "Offline" : "Active"})
              </span>
            </div>
          ))}
        </div>

        <div className="footer-right">
          <span
            className="footer-meta mono footer-version-check"
            onClick={() => {
              updater.checkForUpdates(false);
              updater.setShowModal(true);
            }}
            data-tooltip="Check for Plurivex updates"
            data-tooltip-pos="top"
          >
            {wallets.length} Wallets Indexed · Local Database Encrypted · Plurivex v{APP_VERSION}
          </span>
        </div>
      </footer>

      {/* Flexible Vault Exporter Modal */}
      <ExportModal />

      {/* Security-Gated Reset All Wallets Modal */}
      <ResetAllWalletsModal />

      {/* High-Fidelity Receive & Deposit Modal (Mounted lazily on demand) */}
      {isReceiveOpen && (
        <ReceiveModal
          isOpen={isReceiveOpen}
          onClose={() => setIsReceiveOpen(false)}
          onOpenImport={() => {
            setIsReceiveOpen(false);
            setActiveNav("import");
          }}
        />
      )}

      {/* High-Fidelity Send & Single Transfer Modal (Mounted lazily on demand) */}
      {isSendOpen && (
        <SendModal
          isOpen={isSendOpen}
          onClose={() => setIsSendOpen(false)}
        />
      )}

      {/* Official Tauri v2 Auto-Updater Modal */}
      {updater.showModal && (
        <UpdateModal
          updater={updater}
          currentVersion={APP_VERSION}
          onClose={() => updater.setShowModal(false)}
        />
      )}
    </div>
  );
}
