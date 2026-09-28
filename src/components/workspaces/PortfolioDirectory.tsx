import { useState, useMemo, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { IconWallet, IconScan, IconSearch, ChainIcon, IconTrendingUp } from "../../icons";
import { WinRateCard } from "../analytics/WinRateCard";

interface PortfolioDirectoryProps {
  onOpenImport?: () => void;
  onOpenSweeper?: () => void;
}

export function PortfolioDirectory({ onOpenImport }: PortfolioDirectoryProps) {
  const {
    wallets,
    setSelectedId,
    scanAll,
    scanning,
    fundedCount,
    toast,
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<"all" | "funded" | "evm" | "sol" | "btc">("all");
  const [localSearch, setLocalSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showWinRate, setShowWinRate] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const evmCount = useMemo(() => wallets.filter((w) => Boolean(w.address)).length, [wallets]);
  const solCount = useMemo(() => wallets.filter((w) => Boolean(w.solAddress)).length, [wallets]);
  const btcCount = useMemo(() => wallets.filter((w) => Boolean(w.btcAddress)).length, [wallets]);

  // Reset page to 1 whenever active filter or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, localSearch]);

  const filteredList = useMemo(() => {
    return wallets.filter((w) => {
      // 1. Category Filter
      if (activeFilter === "funded" && !w.hasFunds) return false;
      if (activeFilter === "evm" && !w.address) return false;
      if (activeFilter === "sol" && !w.solAddress) return false;
      if (activeFilter === "btc" && !w.btcAddress) return false;

      // 2. Search Filter
      if (localSearch.trim()) {
        const q = localSearch.toLowerCase().trim();
        const idMatch = `#${w.id}`.includes(q) || String(w.id) === q;
        const addrMatch =
          Boolean(w.address?.toLowerCase().includes(q)) ||
          Boolean(w.solAddress?.toLowerCase().includes(q)) ||
          Boolean(w.btcAddress?.toLowerCase().includes(q));
        const labelMatch = Boolean(w.label?.toLowerCase().includes(q));
        if (!idMatch && !addrMatch && !labelMatch) return false;
      }
      return true;
    });
  }, [wallets, activeFilter, localSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  const copyToClipboard = (text: string, id: string, networkLabel = "Address") => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast(`${networkLabel} copied to clipboard`, "success");
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="portfolio-directory-view" style={{ padding: "20px 24px" }}>
      {/* ── Portfolio Header Hero ── */}
      <div
        className="portfolio-hero-bar"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "20px 24px",
          marginBottom: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-border)",
                display: "grid",
                placeItems: "center",
                color: "var(--accent)",
              }}
            >
              <IconWallet size={15} />
            </span>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", margin: 0 }}>
              Portfolio &amp; Wallet Inventory
            </h2>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: 0 }}>
            Manage {wallets.length} encrypted multi-chain wallet addresses on your local device.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            className={`btn ${showWinRate ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setShowWinRate(!showWinRate)}
            style={{ height: "36px", fontSize: "11.5px", gap: "6px" }}
          >
            <IconTrendingUp size={13} />
            <span>{showWinRate ? "Hide Performance" : "Win Rate & Stats"}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => scanAll()}
            disabled={scanning || wallets.length === 0}
            style={{ height: "36px", fontSize: "11.5px" }}
          >
            <IconScan size={14} />
            <span>{scanning ? "Scanning…" : "Scan Balances"}</span>
          </button>

          {onOpenImport && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onOpenImport}
              style={{ height: "36px", fontSize: "11.5px" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Import Wallet</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Binance Web3 Style Win Rate & Analytics Section ── */}
      {showWinRate && <WinRateCard />}

      {/* ── Filter & Search Control Bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "14px",
          flexWrap: "wrap",
        }}
      >
        {/* Filter Pills */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            background: "var(--surface-inset)",
            padding: "4px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className={`btn-filter-pill ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span>All ({wallets.length})</span>
          </button>
          <button
            type="button"
            className={`btn-filter-pill ${activeFilter === "funded" ? "active" : ""}`}
            onClick={() => setActiveFilter("funded")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={activeFilter === "funded" ? "currentColor" : "#f59e0b"} style={{ flexShrink: 0 }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Funded ({fundedCount})</span>
          </button>
          <button
            type="button"
            className={`btn-filter-pill ${activeFilter === "evm" ? "active" : ""}`}
            onClick={() => setActiveFilter("evm")}
          >
            <ChainIcon chain="eth" size={14} />
            <span>EVM ({evmCount})</span>
          </button>
          <button
            type="button"
            className={`btn-filter-pill ${activeFilter === "sol" ? "active" : ""}`}
            onClick={() => setActiveFilter("sol")}
          >
            <ChainIcon chain="sol" size={14} />
            <span>Solana ({solCount})</span>
          </button>
          {btcCount > 0 && (
            <button
              type="button"
              className={`btn-filter-pill ${activeFilter === "btc" ? "active" : ""}`}
              onClick={() => setActiveFilter("btc")}
            >
              <ChainIcon chain="btc" size={14} />
              <span>Bitcoin ({btcCount})</span>
            </button>
          )}
        </div>

        {/* Local Search Input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "4px 10px",
            minWidth: "220px",
          }}
        >
          <span style={{ color: "var(--text-dim)", display: "flex", alignItems: "center" }}>
            <IconSearch size={13} />
          </span>
          <input
            type="text"
            placeholder="Search ID, address, or label..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              padding: "0",
              fontSize: "11.5px",
              color: "var(--text)",
              outline: "none",
              width: "100%",
            }}
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => setLocalSearch("")}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: "0" }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Wallets Table ── */}
      {filteredList.length === 0 ? (
        <div className="sweeper-empty-notice" style={{ marginTop: "12px", textAlign: "center", justifyContent: "center", padding: "40px 20px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>📭</div>
            <strong style={{ fontSize: "14px", color: "var(--text)" }}>No Wallets Found</strong>
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>
              {wallets.length === 0
                ? "Your vault is currently empty. Import a Seed Phrase or Private Key to get started."
                : "No wallets match your filter or search query."}
            </p>
            {wallets.length === 0 && onOpenImport && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onOpenImport}
                style={{ marginTop: "16px", height: "38px" }}
              >
                Import Wallet Now →
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="sweeper-table-wrap" style={{ maxHeight: "calc(100vh - 280px)" }}>
            <table className="sweeper-table">
              <thead>
                <tr>
                  <th style={{ width: "36px", textAlign: "center" }}>#</th>
                  <th style={{ width: "85px" }}>Type</th>
                  <th>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {activeFilter === "sol" && <ChainIcon chain="sol" size={13} />}
                      {activeFilter === "btc" && <ChainIcon chain="btc" size={13} />}
                      {activeFilter === "evm" && <ChainIcon chain="eth" size={13} />}
                      <span>
                        {activeFilter === "sol"
                          ? "Solana Address (Base58)"
                          : activeFilter === "btc"
                          ? "Bitcoin Address (Native SegWit)"
                          : activeFilter === "evm"
                          ? "EVM Address (0x)"
                          : "Public Address"}
                      </span>
                    </div>
                  </th>
                  <th style={{ width: "170px" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {activeFilter === "sol" && <ChainIcon chain="sol" size={13} />}
                      {activeFilter === "btc" && <ChainIcon chain="btc" size={13} />}
                      <span>
                        {activeFilter === "sol"
                          ? "Solana Balances"
                          : activeFilter === "btc"
                          ? "Bitcoin Balances"
                          : "Detected Balances"}
                      </span>
                    </div>
                  </th>
                  <th style={{ width: "110px" }}>Label</th>
                  <th style={{ width: "110px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedList.map((w) => {
                  const isSolWallet = w.type === "sol_pk" || (!w.address && !w.btcAddress && !!w.solAddress);
                  const isBtcWallet = !w.address && !w.solAddress && !!w.btcAddress;

                  const targetAddr =
                    activeFilter === "sol" || isSolWallet
                      ? (w.solAddress || "")
                      : activeFilter === "btc" || isBtcWallet
                      ? (w.btcAddress || "")
                      : (w.address || w.solAddress || w.btcAddress || "");

                  const networkLabel =
                    activeFilter === "sol" || isSolWallet
                      ? "Solana address"
                      : activeFilter === "btc" || isBtcWallet
                      ? "Bitcoin address"
                      : "EVM address";

                  const isEvm = Boolean(w.address);

                  // Format balances summary prioritized by active filter
                  interface BalanceItemEntry {
                    display: string;
                    name?: string;
                    symbol: string;
                  }
                  const balanceItems: BalanceItemEntry[] = [];
                  if (w.balances) {
                    const sortedKeys =
                      activeFilter === "sol"
                        ? ["sol", ...Object.keys(w.balances).filter((k) => k !== "sol")]
                        : activeFilter === "btc"
                        ? ["btc", ...Object.keys(w.balances).filter((k) => k !== "btc")]
                        : Object.keys(w.balances);

                    for (const chain of sortedKeys) {
                      const balStr = w.balances[chain];
                      if (balStr) {
                        const num = parseFloat(balStr);
                        if (Number.isFinite(num) && num > 0) {
                          const symbol =
                            chain === "bsc"
                              ? "BNB"
                              : chain === "base" || chain === "arb" || chain === "robinhood"
                              ? "ETH"
                              : chain.toUpperCase();
                          const displayAmt = num < 0.0001 ? "< 0.0001" : num.toFixed(4);
                          balanceItems.push({
                            display: `${displayAmt} ${symbol}`,
                            symbol,
                          });
                        }
                      }
                    }
                  }
                  if (w.tokens) {
                    for (const t of w.tokens) {
                      if (activeFilter === "sol" && t.chain.toLowerCase() !== "sol") continue;
                      if (activeFilter === "btc") continue;
                      const num = parseFloat(t.balance);
                      if (Number.isFinite(num) && num > 0) {
                        const displayAmt = num < 0.0001 ? "< 0.0001" : num.toFixed(4);
                        const isGeneric = !t.name || t.name === t.symbol || t.name === "SPL Token" || t.name === "Token-2022";
                        balanceItems.push({
                          display: `${displayAmt} ${t.symbol}`,
                          name: isGeneric ? undefined : t.name,
                          symbol: t.symbol,
                        });
                      }
                    }
                  }

                  return (
                    <tr
                      key={w.id}
                      className={`sweeper-row ${w.hasFunds ? "sweepable" : ""}`}
                      onClick={() => setSelectedId(w.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ textAlign: "center", color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: "10.5px" }}>
                        #{w.id}
                      </td>

                      <td>
                        <span
                          className="status-badge"
                          style={{
                            background: "var(--surface-2)",
                            border: "1px solid var(--border)",
                            fontSize: "9px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            color: "var(--text-dim)",
                          }}
                        >
                          {w.type === "seed" ? "SEED" : w.type === "sol_pk" ? "SOL PK" : "EVM PK"}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {activeFilter === "sol" || isSolWallet ? (
                            <ChainIcon chain="sol" size={15} />
                          ) : activeFilter === "btc" || isBtcWallet ? (
                            <ChainIcon chain="btc" size={15} />
                          ) : activeFilter === "evm" || w.type === "pk" ? (
                            <ChainIcon chain="eth" size={15} />
                          ) : w.type === "seed" ? (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
                              <ChainIcon chain="eth" size={13} />
                              <ChainIcon chain="sol" size={13} />
                              <ChainIcon chain="btc" size={13} />
                            </div>
                          ) : (
                            <ChainIcon chain="eth" size={15} />
                          )}
                          <span className="mono" style={{ fontSize: "11.5px", color: "var(--text)", fontWeight: 600 }}>
                            {targetAddr ? `${targetAddr.slice(0, 10)}...${targetAddr.slice(-8)}` : "—"}
                          </span>
                          {targetAddr && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(targetAddr, `addr-${w.id}-${activeFilter}`, networkLabel);
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                color: copiedId === `addr-${w.id}-${activeFilter}` ? "var(--ok)" : "var(--text-dim)",
                                cursor: "pointer",
                                padding: "2px",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                              data-tooltip={`Copy ${networkLabel}`}
                            >
                              {copiedId === `addr-${w.id}-${activeFilter}` ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                          )}
                          {w.type === "seed" ? (
                            <span
                              style={{
                                fontSize: "8.5px",
                                background: "rgba(59, 130, 246, 0.12)",
                                color: "#60a5fa",
                                border: "1px solid rgba(59, 130, 246, 0.25)",
                                padding: "1px 5px",
                                borderRadius: "3px",
                              }}
                            >
                              MULTI-CHAIN
                            </span>
                          ) : isSolWallet ? (
                            <span
                              style={{
                                fontSize: "8.5px",
                                background: "rgba(153, 69, 255, 0.12)",
                                color: "#a855f7",
                                border: "1px solid rgba(153, 69, 255, 0.25)",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                fontWeight: 600,
                              }}
                            >
                              SOL
                            </span>
                          ) : isBtcWallet ? (
                            <span
                              style={{
                                fontSize: "8.5px",
                                background: "rgba(247, 147, 26, 0.12)",
                                color: "#f7931a",
                                border: "1px solid rgba(247, 147, 26, 0.25)",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                fontWeight: 600,
                              }}
                            >
                              BTC
                            </span>
                          ) : isEvm ? (
                            <span style={{ fontSize: "8.5px", background: "var(--surface-3)", padding: "1px 4px", borderRadius: "3px", color: "var(--text-dim)" }}>
                              EVM
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td>
                        {balanceItems.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            {balanceItems.slice(0, 2).map((item, idx) => (
                              <div
                                key={idx}
                                style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}
                                data-tooltip={item.name ? `${item.name} (${item.symbol})` : undefined}
                              >
                                <span style={{ color: "var(--ok)", fontWeight: 700, fontSize: "11px", fontFamily: "var(--mono)" }}>
                                  ● {item.display}
                                </span>
                                {item.name && (
                                  <span style={{ fontSize: "9.5px", color: "var(--text-dim)", marginLeft: "10px" }}>
                                    {item.name}
                                  </span>
                                )}
                              </div>
                            ))}
                            {balanceItems.length > 2 && (
                              <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>
                                +{balanceItems.length - 2} more tokens
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-faint)", fontSize: "10.5px" }}>0.00 (Empty)</span>
                        )}
                      </td>

                      <td>
                        {w.label ? (
                          <span
                            style={{
                              fontSize: "10px",
                              background: "var(--accent-soft)",
                              color: "var(--accent)",
                              border: "1px solid var(--accent-border)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: 600,
                            }}
                          >
                            {w.label}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-faint)", fontSize: "10px" }}>—</span>
                        )}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(w.id);
                          }}
                          style={{ height: "26px", padding: "0 8px", fontSize: "10.5px" }}
                        >
                          Details →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── High-Performance Pagination Toolbar ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "12px",
              padding: "8px 14px",
              background: "var(--surface)",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              fontSize: "11px",
              color: "var(--text-dim)",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span>
                Showing{" "}
                <strong style={{ color: "var(--text)" }}>
                  {filteredList.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </strong>
                –
                <strong style={{ color: "var(--text)" }}>
                  {Math.min(currentPage * pageSize, filteredList.length)}
                </strong>{" "}
                of <strong style={{ color: "var(--text)" }}>{filteredList.length}</strong> wallets
              </span>

              <span style={{ color: "var(--border)" }}>|</span>

              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    background: "var(--surface-inset)",
                    border: "1px solid var(--border)",
                    borderRadius: "5px",
                    color: "var(--text)",
                    fontSize: "11px",
                    padding: "2px 6px",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>per page</span>
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                style={{ fontSize: "10.5px", height: "26px", padding: "0 8px" }}
                title="First Page"
              >
                « First
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ fontSize: "10.5px", height: "26px", padding: "0 8px" }}
                title="Previous Page"
              >
                ‹ Prev
              </button>

              <span style={{ padding: "0 6px", fontWeight: "600", color: "var(--text)" }}>
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ fontSize: "10.5px", height: "26px", padding: "0 8px" }}
                title="Next Page"
              >
                Next ›
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                style={{ fontSize: "10.5px", height: "26px", padding: "0 8px" }}
                title="Last Page"
              >
                Last »
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
