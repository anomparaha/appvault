import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../../context/AppContext";
import { ChainIcon, IconSearch, IconExternalLink } from "../../icons";
import type { WalletView } from "../../lib/types/index";
import { isSolanaWallet, walletDisplayAddress } from "../../lib/wallets/wallet";

interface SolanaTransactionSignature {
  signature: string;
  slot: number;
  blockTime: number | null;
  confirmationStatus: string | null;
  failed: boolean;
}

const HISTORY_PAGE_SIZE = 20;

function formatSolanaTime(blockTime: number | null): string {
  if (!blockTime || !Number.isFinite(blockTime)) return "Time unavailable";
  return new Date(blockTime * 1000).toLocaleString();
}

function shortSignature(signature: string): string {
  return signature.length > 24
    ? `${signature.slice(0, 12)}…${signature.slice(-8)}`
    : signature;
}

export function WalletActivityExplorer({ wallet }: { wallet: WalletView }) {
  const { toast, sessionToken, isAirGapped } = useApp();
  const [transactions, setTransactions] = useState<SolanaTransactionSignature[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const requestIdRef = useRef(0);

  // Seed wallets may have both families. Query the explicit Solana derivation, never the EVM
  // display address; sol_pk wallets also support the legacy address field as a fallback.
  const solAddress = wallet.solAddress || (isSolanaWallet(wallet.type) ? wallet.address : null);
  const evmAddress = isSolanaWallet(wallet.type)
    ? null
    : wallet.address || (!solAddress ? walletDisplayAddress(wallet) : null);
  const btcAddress = wallet.btcAddress;

  const loadHistoryPage = useCallback(async (before: string | null = null, append = false) => {
    if (!solAddress || !sessionToken || isAirGapped) return;
    const requestId = ++requestIdRef.current;
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const page = await invoke<SolanaTransactionSignature[]>("get_solana_transaction_history", {
        address: solAddress,
        before,
        limit: HISTORY_PAGE_SIZE,
        sessionToken,
      });
      if (requestId !== requestIdRef.current) return;
      setTransactions((current) => {
        if (!append) return page;
        const seen = new Set(current.map((transaction) => transaction.signature));
        return [...current, ...page.filter((transaction) => !seen.has(transaction.signature))];
      });
      setHasMore(page.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setHistoryError(String(error));
      }
    } finally {
      if (requestId === requestIdRef.current) setHistoryLoading(false);
    }
  }, [solAddress, sessionToken, isAirGapped]);

  useEffect(() => {
    requestIdRef.current += 1;
    setTransactions([]);
    setHasMore(false);
    setHistoryError(null);
    setHistoryLoading(false);
    if (solAddress && sessionToken && !isAirGapped) {
      void loadHistoryPage(null, false);
    }
    return () => {
      requestIdRef.current += 1;
    };
  }, [solAddress, sessionToken, isAirGapped, loadHistoryPage]);

  const explorers: { name: string; url: string; desc: string; icon?: string }[] = [];

  if (btcAddress) {
    explorers.push(
      { name: "Mempool.space", url: `https://mempool.space/address/${btcAddress}`, desc: "Leading Bitcoin Blockchain Explorer", icon: "btc" },
      { name: "Blockstream", url: `https://blockstream.info/address/${btcAddress}`, desc: "Esplora Bitcoin Visualizer", icon: "btc" },
    );
  }

  if (solAddress) {
    explorers.push(
      { name: "Solscan", url: `https://solscan.io/account/${solAddress}`, desc: "Solana account and transaction explorer", icon: "sol" },
      { name: "SolanaFM", url: `https://solana.fm/address/${solAddress}`, desc: "Solana analytics and history", icon: "sol" },
      { name: "Step Finance", url: `https://app.step.finance/en/dashboard?watching=${solAddress}`, desc: "Solana portfolio manager", icon: "sol" },
    );
  }

  if (evmAddress) {
    explorers.push(
      { name: "DeBank", url: `https://debank.com/profile/${evmAddress}`, desc: "Universal multi-chain portfolio", icon: "eth" },
      { name: "Etherscan", url: `https://etherscan.io/address/${evmAddress}`, desc: "Ethereum L1 explorer", icon: "eth" },
      { name: "Robinhood Explorer", url: `https://robinhoodchain.blockscout.com/address/${evmAddress}`, desc: "Robinhood Chain L2 explorer", icon: "robinhood" },
      { name: "BaseScan", url: `https://basescan.org/address/${evmAddress}`, desc: "Coinbase Base explorer", icon: "base" },
      { name: "Arbiscan", url: `https://arbiscan.io/address/${evmAddress}`, desc: "Arbitrum One explorer", icon: "arb" },
      { name: "BscScan", url: `https://bscscan.com/address/${evmAddress}`, desc: "BNB Smart Chain explorer", icon: "bsc" },
      { name: "Arkham Intelligence", url: `https://platform.arkhamintelligence.com/explorer/address/${evmAddress}`, desc: "On-chain entity intelligence" },
    );
  }

  const handleOpenUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    toast("Opening block explorer in browser", "success");
  };

  return (
    <div className="explorer-hub-panel">
      <div className="explorer-hub-header">
        <div className="explorer-title-box">
          <div className="explorer-badge">ON-CHAIN HUBS & SCANNERS</div>
          <h3>Explorer & Activity Hub</h3>
          <p>Review recent on-chain activity and open trusted explorer pages for each address family.</p>
        </div>
      </div>

      {solAddress && (
        <section aria-labelledby="solana-history-heading" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h4 id="solana-history-heading" style={{ margin: 0, fontSize: 13, color: "var(--text)" }}>
                Recent Solana transactions
              </h4>
              <span className="mono" style={{ display: "block", marginTop: 4, fontSize: 10, color: "var(--text-dim)" }}>
                {solAddress.slice(0, 6)}…{solAddress.slice(-5)} · newest first
              </span>
            </div>
            {!isAirGapped && sessionToken && (
              <button
                type="button"
                className="btn-filter-pill"
                disabled={historyLoading}
                onClick={() => void loadHistoryPage(null, false)}
              >
                {historyLoading ? "Refreshing…" : "Refresh"}
              </button>
            )}
          </div>

          {isAirGapped ? (
            <div role="status" style={{ padding: 12, borderRadius: 8, border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 11 }}>
              Safe Mode is active. Transaction history stays offline until you explicitly enable Online Mode.
            </div>
          ) : !sessionToken ? (
            <div role="status" style={{ padding: 12, borderRadius: 8, border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 11 }}>
              Unlock the vault to load transaction history.
            </div>
          ) : historyError && transactions.length === 0 ? (
            <div role="alert" style={{ padding: 12, borderRadius: 8, border: "1px solid var(--danger-border, rgba(244,63,94,.3))", color: "var(--danger, #f43f5e)", fontSize: 11 }}>
              Could not load Solana history: {historyError}
            </div>
          ) : transactions.length === 0 && historyLoading ? (
            <div role="status" style={{ padding: 16, borderRadius: 8, border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 11 }}>
              Loading confirmed transactions…
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ padding: 16, borderRadius: 8, border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 11 }}>
              No confirmed transactions were returned for this Solana address.
            </div>
          ) : (
            <>
              {historyError && (
                <div role="alert" style={{ padding: 10, borderRadius: 8, border: "1px solid var(--danger-border, rgba(244,63,94,.3))", color: "var(--danger, #f43f5e)", fontSize: 11 }}>
                  Could not load older transactions: {historyError}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {transactions.map((transaction) => (
                  <a
                    key={transaction.signature}
                    href={`https://solscan.io/tx/${transaction.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={transaction.signature}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span className="mono" style={{ display: "block", fontSize: 11, color: "var(--info, #60a5fa)", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {shortSignature(transaction.signature)}
                      </span>
                      <span style={{ display: "block", marginTop: 4, fontSize: 10, color: "var(--text-dim)" }}>
                        {formatSolanaTime(transaction.blockTime)} · Slot {transaction.slot.toLocaleString()}
                      </span>
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 10, whiteSpace: "nowrap" }}>
                      <span style={{
                        padding: "3px 6px",
                        borderRadius: 5,
                        color: transaction.failed ? "var(--danger, #f43f5e)" : "var(--ok, #34d399)",
                        background: transaction.failed ? "var(--danger-soft, rgba(244,63,94,.12))" : "var(--ok-soft, rgba(52,211,153,.12))",
                      }}>
                        {transaction.failed ? "Failed" : transaction.confirmationStatus || "Confirmed"}
                      </span>
                      <IconExternalLink size={13} />
                    </span>
                  </a>
                ))}
              </div>
              {hasMore && (
                <button
                  type="button"
                  className="btn-filter-pill"
                  disabled={historyLoading}
                  onClick={() => {
                    const cursor = transactions[transactions.length - 1]?.signature;
                    if (cursor) void loadHistoryPage(cursor, true);
                  }}
                  style={{ alignSelf: "center" }}
                >
                  {historyLoading ? "Loading…" : "Load older transactions"}
                </button>
              )}
            </>
          )}
        </section>
      )}

      <div className="explorers-grid">
        {explorers.map((explorer) => (
          <div key={explorer.name} className="explorer-card" onClick={() => handleOpenUrl(explorer.url)}>
            <div className="explorer-card-top">
              {explorer.icon ? <ChainIcon chain={explorer.icon} size={18} /> : <span className="explorer-logo"><IconSearch size={16} /></span>}
              <span className="explorer-name">{explorer.name}</span>
              <span className="explorer-external-arrow"><IconExternalLink size={13} /></span>
            </div>
            <div className="explorer-desc">{explorer.desc}</div>
            <div className="explorer-url mono">{explorer.url.replace("https://", "").slice(0, 36)}…</div>
          </div>
        ))}
      </div>
    </div>
  );
}
