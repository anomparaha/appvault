import { useState, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { ChainIcon, IconTrendingUp, IconTrendingDown, IconTarget, IconZap } from "../../icons";
import type { WalletView } from "../../lib/types/index";
import { OFFICIAL_TOKEN_SPEC } from "../../services/officialTokenService";
import {
  executeTokenDexBuySingle,
  executeTokenDexSellSingle,
  executeMasterDexBuySingle,
} from "../../lib/services/sweeper";
import { logActivity } from "../../lib/services/activity";
import { shortAddr } from "../../lib/wallets/wallet";
import { isValidSolAddress } from "../../lib/utils/format";

export function DexBatchTrader({ wallet: _wallet }: { wallet?: WalletView }) {
  const { wallets, selectedSweepIds, sessionToken, scanAll, toast } = useApp();
  const [selectedChain, setSelectedChain] = useState<"eth" | "robinhood" | "base" | "arb" | "bsc" | "sol">("sol");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tradeAction, setTradeAction] = useState<"buy" | "sell">("buy");
  const [amountPerWallet, setAmountPerWallet] = useState("0.05");
  const [fundingMode, setFundingMode] = useState<"master" | "distributed">("master");
  const [masterWalletId, setMasterWalletId] = useState<number | null>(null);
  const [slippage, setSlippage] = useState("2.5");
  const [traderMode, setTraderMode] = useState<"distributed" | "sweep">("distributed");
  const [executing, setExecuting] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);

  const solWallets = useMemo(() => wallets.filter((w) => !!w.solAddress), [wallets]);
  const targetWallets = useMemo(() => {
    if (selectedSweepIds.size > 0) {
      return wallets.filter((w) => selectedSweepIds.has(w.id) && (selectedChain === "sol" ? !!w.solAddress : !!w.address));
    }
    return selectedChain === "sol" ? solWallets : wallets.filter((w) => !!w.address);
  }, [wallets, selectedSweepIds, selectedChain, solWallets]);

  const solCandidateMasters = useMemo(() => {
    return solWallets
      .map((w) => {
        const balStr = w.balances?.sol || "0";
        return {
          id: w.id,
          address: w.solAddress!,
          solBalance: parseFloat(balStr) || 0,
          solFormatted: balStr.includes("SOL") ? balStr : `${balStr} SOL`,
        };
      })
      .sort((a, b) => b.solBalance - a.solBalance);
  }, [solWallets]);

  const selectedMasterWallet = useMemo(() => {
    return solCandidateMasters.find((c) => c.id === masterWalletId) || solCandidateMasters[0];
  }, [solCandidateMasters, masterWalletId]);

  const activeWalletsCount = targetWallets.length;
  const isSolana = selectedChain === "sol";

  const handleExecute = async () => {
    if (!isSolana) {
      toast("DEX router for EVM networks is currently in development", "info");
      return;
    }

    const mint = tokenAddress.trim();
    if (!mint || !isValidSolAddress(mint)) {
      toast("Please enter a valid Solana SPL token mint address", "error");
      return;
    }

    const amountNum = parseFloat(amountPerWallet);
    if (!amountNum || amountNum <= 0) {
      toast("Please enter a valid amount per wallet", "error");
      return;
    }

    if (targetWallets.length === 0) {
      toast("No eligible Solana wallets found for trading", "error");
      return;
    }

    const slippageBps = Math.round((parseFloat(slippage) || 2.5) * 100);

    const isMasterBuy = tradeAction === "buy" && fundingMode === "master";

    if (isMasterBuy && !selectedMasterWallet) {
      toast("No Master Wallet with SOL found to fund the batch buy", "error");
      return;
    }

    const totalNeededSol = (amountNum * targetWallets.length).toFixed(3);

    const confirmed = window.confirm(
      isMasterBuy
        ? `👑 CONFIRM MASTER-FUNDED BATCH BUY (SUB-WALLETS 0 SOL)\n\n` +
          `Master Funding Wallet: ${shortAddr(selectedMasterWallet.address)} (Saldo: ${selectedMasterWallet.solFormatted})\n` +
          `Token Mint: ${shortAddr(mint)}\n` +
          `Recipient Wallets: ${targetWallets.length}\n` +
          `Buy Amount per Wallet: ${amountNum} SOL\n` +
          `Total SOL Spent by Master: ${totalNeededSol} SOL\n` +
          `Slippage: ${(slippageBps / 100).toFixed(1)}%\n\n` +
          `Dompet Master akan memotong total ${totalNeededSol} SOL + gas. Seluruh token hasil swap langsung masuk ke ATA masing-masing dompet sub-wallet.\n\n` +
          `Lanjutkan eksekusi Jupiter Batch Buy?`
        : `🛒 CONFIRM BATCH ${tradeAction.toUpperCase()} (JUPITER ROUTER)\n\n` +
          `Token Mint: ${shortAddr(mint)}\n` +
          `Wallets: ${targetWallets.length}\n` +
          `${tradeAction === "buy" ? `Amount per Wallet: ${amountNum} SOL` : "Action: Liquidate token to SOL"}\n` +
          `Slippage: ${(slippageBps / 100).toFixed(1)}%\n\n` +
          `Proceed with parallel DEX swaps?`
    );
    if (!confirmed) return;

    setExecuting(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetWallets.length; i++) {
      const w = targetWallets[i];
      const fromAddr = w.solAddress!;
      setProgressMsg(`Executing ${tradeAction} (${i + 1}/${targetWallets.length}) on ${shortAddr(fromAddr)}...`);

      try {
        if (tradeAction === "buy") {
          let res;
          if (fundingMode === "master") {
            res = await executeMasterDexBuySingle(
              selectedMasterWallet.id,
              sessionToken,
              selectedMasterWallet.address,
              fromAddr,
              { mint, symbol: "TOKEN" },
              amountNum,
              slippageBps
            );
          } else {
            res = await executeTokenDexBuySingle(
              w.id,
              sessionToken,
              undefined,
              fromAddr,
              fromAddr,
              { mint, symbol: "TOKEN" },
              amountNum,
              undefined,
              slippageBps
            );
          }

          if (res.success) {
            successCount++;
            logActivity({
              type: "trade",
              title: `DEX Bought Tokens`,
              desc: fundingMode === "master"
                ? `Bought ${amountNum} SOL for ${shortAddr(fromAddr)} (Funded by Master ${shortAddr(selectedMasterWallet.address)} 👑)`
                : `Bought on wallet ${shortAddr(fromAddr)} with ${amountNum} SOL via Jupiter`,
              amount: res.amountSent,
              amountColor: "var(--ok)",
              status: "success",
              chain: "sol",
              txHash: res.txHash,
              explorerUrl: res.explorerUrl,
              sender: fromAddr,
            });
          } else {
            failCount++;
            logActivity({
              type: "trade",
              title: `DEX Buy Failed`,
              desc: res.error || `Failed on wallet ${shortAddr(fromAddr)}`,
              amount: "Failed",
              amountColor: "var(--danger)",
              status: "failed",
              chain: "sol",
              sender: fromAddr,
            });
          }
        } else {
          const tok = w.tokens?.find((t) => t.contractAddress === mint);
          const rawBal = tok?.rawBalance || "0";
          const res = await executeTokenDexSellSingle(
            w.id,
            sessionToken,
            undefined,
            fromAddr,
            fromAddr,
            fromAddr,
            {
              mint,
              symbol: tok?.symbol || "TOKEN",
              name: tok?.name || "SPL Token",
              decimals: tok?.decimals ?? 6,
              rawBalance: rawBal,
              balanceFormatted: tok?.balance || "0",
            },
            slippageBps
          );

          if (res.success) {
            successCount++;
            logActivity({
              type: "trade",
              title: `DEX Sold Tokens`,
              desc: `Sold tokens from ${shortAddr(fromAddr)} via Jupiter`,
              amount: res.amountSent,
              amountColor: "var(--ok)",
              status: "success",
              chain: "sol",
              txHash: res.txHash,
              explorerUrl: res.explorerUrl,
              sender: fromAddr,
            });
          } else {
            failCount++;
          }
        }
      } catch (err) {
        failCount++;
        console.error("DexBatchTrader trade error:", err);
      }
    }

    setExecuting(false);
    setProgressMsg(null);

    if (successCount > 0) {
      toast(`Successfully executed batch ${tradeAction} across ${successCount} wallets!`, "success");
      setTimeout(() => scanAll(), 2500);
    } else {
      toast(`Batch ${tradeAction} encountered errors on ${failCount} wallets`, "error");
    }
  };

  return (
    <div className="dex-trader-panel">
      {/* 1. Header Banner */}
      <div className="dex-header">
        <div className="dex-title-box">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span className="dex-badge">MULTI-WALLET SWAP ENGINE</span>
            {isSolana ? (
              <span className="dex-badge" style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)" }}>
                JUPITER V6 AGGREGATOR LIVE ✓
              </span>
            ) : (
              <span className="dex-badge-warning" style={{ background: "var(--surface-3)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>
                EVM COMING SOON
              </span>
            )}
          </div>
          <h3>DEX Batch Trader</h3>
          <p>
            {isSolana
              ? "Solana batch buying & selling is fully LIVE with Jupiter DEX aggregator and scoped hardware-grade signing."
              : "Multi-wallet parallel swap execution on Uniswap and PancakeSwap is currently in development."}
          </p>
        </div>
        <div className="dex-mode-pills">
          <button
            type="button"
            className={`mode-pill ${tradeAction === "buy" ? "active-buy" : ""}`}
            onClick={() => setTradeAction("buy")}
          >
            <IconTrendingUp size={13} /> Batch Buy
          </button>
          <button
            type="button"
            className={`mode-pill ${tradeAction === "sell" ? "active-sell" : ""}`}
            onClick={() => setTradeAction("sell")}
          >
            <IconTrendingDown size={13} /> Batch Sell
          </button>
        </div>
      </div>

      {/* 2. Form Grid */}
      <div className="dex-form-grid">
        {/* Network Selection */}
        <div className="dex-field">
          <label className="dex-label">1. Blockchain Network</label>
          <div className="dex-chain-tabs">
            {[
              { key: "sol", name: "Solana", dex: "Jupiter Aggregator (Live ✓)" },
              { key: "eth", name: "Ethereum", dex: "Uniswap V3" },
              { key: "robinhood", name: "Robinhood", dex: "Robinhood Swap" },
              { key: "base", name: "Base", dex: "Aerodrome" },
              { key: "arb", name: "Arbitrum", dex: "Camelot" },
              { key: "bsc", name: "BNB Chain", dex: "PancakeSwap" },
            ].map((c) => (
              <button
                key={c.key}
                type="button"
                className={`dex-chain-btn ${selectedChain === c.key ? "active" : ""}`}
                onClick={() => setSelectedChain(c.key as any)}
              >
                <ChainIcon chain={c.key} size={16} />
                <div className="chain-info">
                  <span className="chain-title">{c.name}</span>
                  <span className="chain-dex">{c.dex}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Target Token Input */}
        <div className="dex-field">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", flexWrap: "wrap", gap: "6px" }}>
            <label className="dex-label" style={{ margin: 0 }}>2. Target Token Contract / Mint Address</label>
            <button
              type="button"
              onClick={() => {
                setTokenAddress(OFFICIAL_TOKEN_SPEC.contractAddress);
                setSelectedChain("robinhood");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "10px",
                fontWeight: "700",
                background: "rgba(204, 255, 0, 0.12)",
                color: "#ccff00",
                border: "1px solid rgba(204, 255, 0, 0.35)",
                borderRadius: "5px",
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              <img
                src={OFFICIAL_TOKEN_SPEC.logoUrl}
                alt={OFFICIAL_TOKEN_SPEC.name}
                style={{ width: "13px", height: "13px", borderRadius: "3px", objectFit: "cover" }}
              />
              <span>{OFFICIAL_TOKEN_SPEC.name} ({OFFICIAL_TOKEN_SPEC.symbol})</span>
              <span style={{ fontSize: "8.5px", background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", padding: "1px 4px", borderRadius: "3px" }}>
                VERIFIED ✓
              </span>
            </button>
          </div>
          <div className="token-input-box">
            <input
              type="text"
              className="dex-input mono"
              placeholder={isSolana ? "Paste Solana SPL Token Mint (Base58)..." : "Paste token address (0x...)"}
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
            />
            {tokenAddress && (
              <button type="button" className="btn-clear-input" onClick={() => setTokenAddress("")}>
                ×
              </button>
            )}
          </div>
        </div>

        {/* Funding Mode Options (for Solana Batch Buy) */}
        {isSolana && tradeAction === "buy" && (
          <div className="dex-field" style={{ gridColumn: "1 / -1", padding: "10px 14px", background: "rgba(245, 158, 11, 0.05)", borderRadius: "6px", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#fbbf24", textTransform: "uppercase" }}>
                Sumber Modal Pembelian SOL:
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={`mode-pill ${fundingMode === "master" ? "active-buy" : ""}`}
                  style={{
                    padding: "3px 10px",
                    fontSize: "11px",
                    background: fundingMode === "master" ? "rgba(245, 158, 11, 0.25)" : undefined,
                    borderColor: fundingMode === "master" ? "#f59e0b" : undefined,
                    color: fundingMode === "master" ? "#fbbf24" : undefined,
                  }}
                  onClick={() => setFundingMode("master")}
                >
                  👑 1 Dompet Master (Sub-wallet 0 SOL)
                </button>
                <button
                  type="button"
                  className={`mode-pill ${fundingMode === "distributed" ? "active-buy" : ""}`}
                  style={{
                    padding: "3px 10px",
                    fontSize: "11px",
                    background: fundingMode === "distributed" ? "rgba(59, 130, 246, 0.25)" : undefined,
                    borderColor: fundingMode === "distributed" ? "#3b82f6" : undefined,
                    color: fundingMode === "distributed" ? "#60a5fa" : undefined,
                  }}
                  onClick={() => setFundingMode("distributed")}
                >
                  👥 Tiap Dompet Sendiri (Distributed)
                </button>
              </div>
            </div>

            {fundingMode === "master" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ fontSize: "11px", color: "var(--text-dim)" }}>Pilih Dompet Master:</label>
                <select
                  className="dex-input mono"
                  style={{
                    padding: "4px 8px",
                    fontSize: "11px",
                    width: 320,
                    cursor: "pointer",
                  }}
                  value={selectedMasterWallet?.id}
                  onChange={(e) => setMasterWalletId(parseInt(e.target.value, 10))}
                >
                  {solCandidateMasters.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      Wallet #{i + 1} ({shortAddr(c.address)}) — {c.solFormatted} {i === 0 ? "★ Primary Master Funder" : ""}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "11px", color: "#fbbf24" }}>
                  ✓ Dompet Master membayar {(activeWalletsCount * (parseFloat(amountPerWallet) || 0.05)).toFixed(3)} SOL untuk {activeWalletsCount} dompet. Sub-wallet butuh 0 SOL!
                </span>
              </div>
            )}
          </div>
        )}

        {/* Trade Configuration */}
        <div className="dex-config-row">
          <div className="dex-field flex-1">
            <label className="dex-label">3. Amount per Wallet</label>
            <div className="amount-input-wrap">
              <input
                type="text"
                className="dex-input mono"
                value={amountPerWallet}
                onChange={(e) => setAmountPerWallet(e.target.value)}
              />
              <span className="amount-unit">{selectedChain === "bsc" ? "BNB" : selectedChain === "sol" ? "SOL" : "ETH"}</span>
            </div>
          </div>

          <div className="dex-field w-32">
            <label className="dex-label">Slippage (%)</label>
            <input
              type="text"
              className="dex-input mono"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />
          </div>

          <div className="dex-field flex-1">
            <label className="dex-label">Execution Strategy</label>
            <div className="strategy-pills">
              <button
                type="button"
                className={`strat-btn ${traderMode === "distributed" ? "active" : ""}`}
                onClick={() => setTraderMode("distributed")}
              >
                <IconTarget size={12} /> Distributed Sniper
              </button>
              <button
                type="button"
                className={`strat-btn ${traderMode === "sweep" ? "active" : ""}`}
                onClick={() => setTraderMode("sweep")}
              >
                <IconZap size={12} /> Auto-Consolidate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Execution Summary Bar */}
      <div className="dex-summary-bar">
        <div className="summary-left">
          <div className="summary-wallets">
            <span className="summary-highlight mono">{activeWalletsCount}</span> Active Wallets Selected
          </div>
          <div className="summary-est">
            Estimated Total: <strong className="mono">{(parseFloat(amountPerWallet || "0") * activeWalletsCount).toFixed(4)} {selectedChain === "bsc" ? "BNB" : selectedChain === "sol" ? "SOL" : "ETH"}</strong>
          </div>
        </div>

        {isSolana ? (
          <button
            type="button"
            className="btn-execute-trade"
            onClick={handleExecute}
            disabled={executing || activeWalletsCount === 0 || !tokenAddress.trim()}
            style={{
              background: tradeAction === "buy"
                ? fundingMode === "master"
                  ? "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)"
                  : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)"
                : "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              color: "#fff",
              cursor: executing || activeWalletsCount === 0 || !tokenAddress.trim() ? "not-allowed" : "pointer",
              opacity: executing || activeWalletsCount === 0 || !tokenAddress.trim() ? 0.6 : 1,
            }}
          >
            {executing ? (
              progressMsg || "Executing Swaps..."
            ) : (
              <>
                <IconZap size={13} /> Execute {fundingMode === "master" && tradeAction === "buy" ? "Master-Funded" : "Batch"} {tradeAction === "buy" ? "Buy" : "Sell"} ({activeWalletsCount} Wallets)
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            className="btn-execute-trade btn-disabled"
            disabled={true}
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          >
            <IconZap size={13} /> On-Chain Router in Development
          </button>
        )}
      </div>
    </div>
  );
}
