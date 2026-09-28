import { useState, useMemo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../../context/AppContext";
import { ChainIcon, IconTrendingUp, IconTrendingDown, IconTarget, IconZap } from "../../icons";
import type { WalletView } from "../../lib/types/index";
import { OFFICIAL_TOKEN_SPEC } from "../../services/officialTokenService";
import {
  executeTokenDexBuySingle,
  executeTokenDexSellSingle,
  executeMasterDexBuySingle,
  SOLANA_BUY_RESERVE_SOL,
  type SweepTxResult,
} from "../../lib/services/sweeper";
import { logActivity } from "../../lib/services/activity";
import { shortAddr } from "../../lib/wallets/wallet";
import { isValidSolAddress } from "../../lib/utils/format";

interface TradeWalletReceipt {
  walletAddress: string;
  status: "confirmed" | "pending" | "failed";
  txHash?: string;
  explorerUrl?: string;
  amountSent?: string;
  error?: string;
}

interface TradeReceipt {
  status: "confirmed" | "pending" | "partial" | "failed";
  action: "buy" | "sell";
  scope: "single" | "batch";
  successfulWallets: number;
  pendingWallets: number;
  failedWallets: number;
  wallets: TradeWalletReceipt[];
  timestamp: number;
}

function hasPositiveTokenBalance(token: { rawBalance?: string; balance?: string } | undefined): boolean {
  if (!token) return false;
  if (token.rawBalance !== undefined && token.rawBalance !== null) {
    return /^\d+$/.test(token.rawBalance) && BigInt(token.rawBalance) > 0n;
  }
  const formatted = Number.parseFloat(token.balance || "");
  return Number.isFinite(formatted) && formatted > 0;
}

export function DexBatchTrader({ wallet }: { wallet?: WalletView }) {
  const { wallets, selectedSweepIds, sessionToken, isAirGapped, networkSessionReady, refreshWallets, toast } = useApp();
  const sessionTokenRef = useRef(sessionToken);
  const isAirGappedRef = useRef(isAirGapped);
  const networkSessionReadyRef = useRef(networkSessionReady);
  sessionTokenRef.current = sessionToken;
  isAirGappedRef.current = isAirGapped;
  networkSessionReadyRef.current = networkSessionReady;
  const [selectedChain, setSelectedChain] = useState<"eth" | "robinhood" | "base" | "arb" | "bsc" | "sol">("sol");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tradeAction, setTradeAction] = useState<"buy" | "sell">("buy");
  const [amountPerWallet, setAmountPerWallet] = useState("0.05");
  const [scopeMode, setScopeMode] = useState<"single" | "batch">(wallet ? "single" : "single");
  const [singleWalletId, setSingleWalletId] = useState<number | null>(wallet ? wallet.id : null);
  const [fundingMode, setFundingMode] = useState<"master" | "distributed">("distributed");
  const [masterWalletId, setMasterWalletId] = useState<number | null>(null);
  const [slippage, setSlippage] = useState("2.5");
  const [traderMode, setTraderMode] = useState<"distributed" | "sweep">("distributed");
  const [executing, setExecuting] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [lastTradeReceipt, setLastTradeReceipt] = useState<TradeReceipt | null>(null);

  const isLockedToPropWallet = !!wallet;

  const solWallets = useMemo(() => wallets.filter((w) => !!w.solAddress), [wallets]);

  // Auto-select first wallet for single mode if none set
  useEffect(() => {
    if (!wallet && singleWalletId === null && solWallets.length > 0) {
      setSingleWalletId(solWallets[0].id);
    }
  }, [wallet, singleWalletId, solWallets]);

  const selectedSingleWallet = useMemo(() => {
    if (wallet) return wallet;
    return solWallets.find((w) => w.id === singleWalletId) || solWallets[0] || null;
  }, [wallet, solWallets, singleWalletId]);

  const targetWallets = useMemo(() => {
    if (scopeMode === "single") {
      return selectedSingleWallet ? [selectedSingleWallet] : [];
    }
    if (selectedSweepIds.size > 0) {
      return wallets.filter((w) => selectedSweepIds.has(w.id) && (selectedChain === "sol" ? !!w.solAddress : !!w.address));
    }
    return selectedChain === "sol" ? solWallets : wallets.filter((w) => !!w.address);
  }, [scopeMode, selectedSingleWallet, selectedSweepIds, wallets, selectedChain, solWallets]);

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

  const compatibleTargets = useMemo(
    () => targetWallets.filter((target) =>
      selectedChain === "sol" ? Boolean(target.solAddress) : Boolean(target.address),
    ),
    [targetWallets, selectedChain],
  );
  const executionTargets = useMemo(() => {
    if (tradeAction !== "sell") return compatibleTargets;
    const mint = tokenAddress.trim();
    if (!mint || selectedChain !== "sol") return [];
    return compatibleTargets.filter((target) =>
      target.tokens?.some((token) =>
        (token.chain?.toLowerCase() === "sol" || token.chain?.toLowerCase() === "solana") &&
        token.contractAddress === mint &&
        hasPositiveTokenBalance(token),
      ),
    );
  }, [compatibleTargets, tradeAction, tokenAddress, selectedChain]);
  const masterBuyMode = scopeMode === "batch" && tradeAction === "buy" && fundingMode === "master";
  const activeWalletsCount = masterBuyMode && selectedMasterWallet
    ? executionTargets.filter((target) => target.id !== selectedMasterWallet.id).length
    : executionTargets.length;
  const isSolana = selectedChain === "sol";

  const handleExecute = async () => {
    if (!sessionToken) {
      toast("Vault session required. Unlock the vault before trading.", "error");
      return;
    }
    if (!networkSessionReady) {
      toast("The native vault-session network gate is not ready. Wait for the session check and try again.", "error");
      return;
    }
    if (isAirGapped) {
      toast("Safe Mode blocks DEX quotes and blockchain broadcasts.", "error");
      return;
    }
    if (!isSolana) {
      toast("DEX router for EVM networks is currently in development", "info");
      return;
    }
    const tradeSessionToken = sessionToken;

    const mint = tokenAddress.trim();
    if (!mint || !isValidSolAddress(mint)) {
      toast("Please enter a valid Solana SPL token mint address", "error");
      return;
    }

    const amountNum = tradeAction === "buy" ? Number(amountPerWallet) : 0;
    if (tradeAction === "buy" && (!Number.isFinite(amountNum) || amountNum <= 0)) {
      toast("Please enter a finite buy amount greater than zero SOL", "error");
      return;
    }

    const slippagePct = Number(slippage);
    if (!Number.isFinite(slippagePct) || slippagePct < 0 || slippagePct > 50) {
      toast("Slippage must be between 0 and 50 percent.", "error");
      return;
    }
    const slippageBps = Math.round(slippagePct * 100);

    const isMasterBuy = scopeMode === "batch" && tradeAction === "buy" && fundingMode === "master";
    if (isMasterBuy && !selectedMasterWallet) {
      toast("No Master Wallet with SOL found to fund the batch buy", "error");
      return;
    }

    const recipientTargets = isMasterBuy && selectedMasterWallet
      ? executionTargets.filter((target) => target.id !== selectedMasterWallet.id)
      : executionTargets;
    if (recipientTargets.length === 0) {
      toast(isMasterBuy
        ? "Select at least one recipient wallet other than the master funder."
        : tradeAction === "sell"
        ? "No selected wallet has a discovered positive balance for this mint. Scan wallets and verify the exact mint address first."
        : "No eligible Solana wallet selected for trading", "error");
      return;
    }

    if (tradeAction === "buy") {
      try {
        const buyLamports = BigInt(Math.floor(amountNum * 1e9));
        const reserveLamports = BigInt(Math.ceil(SOLANA_BUY_RESERVE_SOL * 1e9));
        const readBalance = async (address: string) => invoke<{ balance_hex: string }>("get_account_nonce_and_balance", {
          sessionToken: tradeSessionToken,
          chainKey: "sol",
          address,
        });

        if (isMasterBuy && selectedMasterWallet) {
          const account = await readBalance(selectedMasterWallet.address);
          if (sessionTokenRef.current !== tradeSessionToken || !networkSessionReadyRef.current || isAirGappedRef.current) {
            throw new Error("Online vault session ended while checking the master balance.");
          }
          const requiredLamports = (buyLamports + reserveLamports) * BigInt(recipientTargets.length);
          if (BigInt(account.balance_hex) < requiredLamports) {
            toast(`Master wallet needs about ${(Number(requiredLamports) / 1e9).toFixed(3)} SOL including network/ATA reserves.`, "error");
            return;
          }
        } else {
          for (const target of recipientTargets) {
            if (sessionTokenRef.current !== tradeSessionToken || !networkSessionReadyRef.current || isAirGappedRef.current) {
              throw new Error("Online vault session ended while checking wallet balances.");
            }
            const account = await readBalance(target.solAddress!);
            const requiredLamports = buyLamports + reserveLamports;
            if (BigInt(account.balance_hex) < requiredLamports) {
              toast(`Wallet ${shortAddr(target.solAddress || "")} needs ${amountNum} SOL plus a ${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL fee/ATA reserve.`, "error");
              return;
            }
          }
        }
      } catch (error) {
        toast(`Could not verify live SOL funding balance: ${String(error)}`, "error");
        return;
      }
    }

    const totalNeededSol = (amountNum * recipientTargets.length).toFixed(3);
    const totalReservedSol = (SOLANA_BUY_RESERVE_SOL * recipientTargets.length).toFixed(3);
    const parallelBatch = scopeMode === "batch" && traderMode === "distributed" && !isMasterBuy;

    const confirmed = window.confirm(
      scopeMode === "single"
        ? `⚡ CONFIRM SINGLE-WALLET ${tradeAction.toUpperCase()} (JUPITER SWAP)\n\n` +
          `Wallet Target: ${selectedSingleWallet?.label || `Wallet #${selectedSingleWallet?.id}`} (${shortAddr(selectedSingleWallet?.solAddress || "")})\n` +
          `Token Mint: ${shortAddr(mint)}\n` +
          `${tradeAction === "buy" ? `Modal Pembelian: ${amountNum} SOL (dari saldo dompet ini sendiri)` : "Aksi: Jual Token di dompet ini menjadi SOL"}\n` +
          `${tradeAction === "buy" ? `Fee/ATA Rent Reserve: ${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL (conservative)\n` : ""}` +
          `${tradeAction === "buy" ? "Token hasil swap masuk langsung ke ATA dompet ini (tidak dibagi-bagi)" : "Hasil jual berupa SOL masuk kembali ke dompet ini"}\n` +
          `Slippage: ${(slippageBps / 100).toFixed(1)}%\n\n` +
          `Lanjutkan swap langsung di dompet ini?`
        : isMasterBuy
        ? `👑 CONFIRM MASTER-FUNDED BATCH BUY (SUB-WALLETS 0 SOL)\n\n` +
          `Master Funding Wallet: ${shortAddr(selectedMasterWallet.address)} (Saldo: ${selectedMasterWallet.solFormatted})\n` +
          `Token Mint: ${shortAddr(mint)}\n` +
          `Recipient Wallets: ${recipientTargets.length}\n` +
          `Buy Amount per Wallet: ${amountNum} SOL\n` +
          `Total SOL for Buys: ${totalNeededSol} SOL\n` +
          `Fee/ATA Rent Reserve: ${totalReservedSol} SOL\n` +
          `Estimated Master Requirement: ${(Number(totalNeededSol) + Number(totalReservedSol)).toFixed(3)} SOL\n` +
          `Slippage: ${(slippageBps / 100).toFixed(1)}%\n\n` +
          `Dompet Master akan memotong total ${totalNeededSol} SOL + gas. Seluruh token hasil swap langsung masuk ke ATA masing-masing dompet sub-wallet.\n\n` +
          `Execution is sequential because every swap spends from the same master wallet.\n\n` +
          `Lanjutkan eksekusi Jupiter Batch Buy?`
        : `🛒 CONFIRM DISTRIBUTED BATCH ${tradeAction.toUpperCase()} (JUPITER ROUTER)\n\n` +
          `Token Mint: ${shortAddr(mint)}\n` +
          `Wallets: ${recipientTargets.length}\n` +
          `${tradeAction === "buy" ? `Amount per Wallet: ${amountNum} SOL\nTotal Buy Capital: ${totalNeededSol} SOL\nFee/ATA Rent Reserve: ${totalReservedSol} SOL\nEstimated Wallet Funding: ${(Number(totalNeededSol) + Number(totalReservedSol)).toFixed(3)} SOL` : "Action: Liquidate token to SOL"}\n` +
          `Slippage: ${(slippageBps / 100).toFixed(1)}%\n\n` +
          `Execution: ${parallelBatch ? "parallel across independent wallets (max 3 at once)" : "sequential"}\n\n` +
          `Proceed with ${parallelBatch ? "parallel" : "sequential"} DEX swaps?`
    );
    if (!confirmed) return;

    setExecuting(true);
    setLastTradeReceipt(null);
    let successCount = 0;
    let pendingCount = 0;
    let failCount = 0;
    const walletReceipts: TradeWalletReceipt[] = [];

    const recordResult = (fromAddr: string, walletId: number, res: SweepTxResult) => {
      const status: TradeWalletReceipt["status"] = res.success
        ? "confirmed"
        : res.pending
        ? "pending"
        : "failed";
      walletReceipts.push({
        walletAddress: fromAddr,
        status,
        txHash: res.txHash,
        explorerUrl: res.explorerUrl,
        amountSent: res.amountSent,
        error: res.error,
      });

      if (status === "confirmed") successCount++;
      else if (status === "pending") pendingCount++;
      else failCount++;

      const actor = isMasterBuy && selectedMasterWallet
        ? selectedMasterWallet.address
        : fromAddr;
      const title = tradeAction === "buy"
        ? status === "confirmed" ? "DEX Buy Confirmed" : status === "pending" ? "DEX Buy Submitted" : "DEX Buy Failed"
        : status === "confirmed" ? "DEX Sell Confirmed" : status === "pending" ? "DEX Sell Submitted" : "DEX Sell Failed";
      const fundingDesc = isMasterBuy && selectedMasterWallet
        ? `Funded by Master ${shortAddr(selectedMasterWallet.address)} for recipient ${shortAddr(fromAddr)}`
        : `Wallet ${shortAddr(fromAddr)} traded with its own SOL`;
      const defaultDesc = status === "confirmed"
        ? `${tradeAction === "buy" ? `Bought with ${amountNum} SOL` : "Sold token to SOL"} via Jupiter. ${fundingDesc}.`
        : status === "pending"
        ? `Transaction submitted; awaiting on-chain confirmation. ${fundingDesc}.`
        : `${res.error || "Transaction failed before confirmation."} ${fundingDesc}.`;

      logActivity({
        type: "trade",
        title,
        desc: defaultDesc,
        amount: res.amountSent || (status === "failed" ? "Failed" : status === "pending" ? "Awaiting confirmation" : undefined),
        amountColor: status === "confirmed" ? "var(--ok)" : status === "pending" ? "var(--warning)" : "var(--danger)",
        status: status === "confirmed" ? "success" : status === "pending" ? "warning" : "failed",
        chain: "sol",
        txHash: res.txHash,
        explorerUrl: res.explorerUrl,
        sender: actor,
        recipient: fromAddr,
        metadata: { walletId, confirmationStatus: res.confirmationStatus || null, fundingMode: isMasterBuy ? "master" : "wallet" },
      });
    };

    let completedCount = 0;
    const executeTarget = async (w: WalletView, i: number) => {
      const fromAddr = w.solAddress!;
      setProgressMsg(
        parallelBatch
          ? `Parallel swaps · ${completedCount}/${recipientTargets.length} complete · ${shortAddr(fromAddr)}`
          : scopeMode === "single"
          ? `Executing swap on ${shortAddr(fromAddr)}...`
          : `Executing ${tradeAction} (${i + 1}/${recipientTargets.length}) on ${shortAddr(fromAddr)}...`,
      );

      try {
        if (
          sessionTokenRef.current !== tradeSessionToken ||
          !networkSessionReadyRef.current ||
          isAirGappedRef.current
        ) {
          throw new Error("Stopped before this wallet: the authenticated Online Mode session is no longer active; no transaction was submitted.");
        }
        let res: SweepTxResult;
        if (tradeAction === "buy") {
          if (isMasterBuy && selectedMasterWallet) {
            res = await executeMasterDexBuySingle(
              selectedMasterWallet.id,
              tradeSessionToken,
              selectedMasterWallet.address,
              fromAddr,
              { mint, symbol: "TOKEN" },
              amountNum,
              slippageBps,
            );
          } else {
            res = await executeTokenDexBuySingle(
              w.id,
              tradeSessionToken,
              undefined,
              fromAddr,
              fromAddr,
              { mint, symbol: "TOKEN" },
              amountNum,
              undefined,
              slippageBps,
            );
          }
        } else {
          const token = w.tokens?.find((item) =>
            (item.chain?.toLowerCase() === "sol" || item.chain?.toLowerCase() === "solana") &&
            item.contractAddress === mint &&
            hasPositiveTokenBalance(item),
          );
          if (!token) throw new Error("No discovered positive balance for this mint; rescan this wallet before selling.");
          res = await executeTokenDexSellSingle(
            w.id,
            tradeSessionToken,
            undefined,
            fromAddr,
            fromAddr,
            fromAddr,
            {
              mint,
              symbol: token.symbol || "TOKEN",
              name: token.name || "SPL Token",
              decimals: token.decimals ?? undefined,
              programId: token.tokenProgramId ?? undefined,
              rawBalance: token.rawBalance || "0",
              balanceFormatted: token.balance || "0 TOKEN",
            },
            slippageBps,
          );
        }
        recordResult(fromAddr, w.id, res);
      } catch (err) {
        const error = String(err);
        walletReceipts.push({ walletAddress: fromAddr, status: "failed", error });
        failCount++;
        logActivity({
          type: "trade",
          title: tradeAction === "buy" ? "DEX Buy Failed" : "DEX Sell Failed",
          desc: error,
          amount: "Failed",
          amountColor: "var(--danger)",
          status: "failed",
          chain: "sol",
          sender: isMasterBuy && selectedMasterWallet ? selectedMasterWallet.address : fromAddr,
          recipient: fromAddr,
          metadata: { walletId: w.id, fundingMode: isMasterBuy ? "master" : "wallet" },
        });
        console.error("DexBatchTrader trade error:", err);
      } finally {
        completedCount++;
        if (parallelBatch) {
          setProgressMsg(`Parallel swaps · ${completedCount}/${recipientTargets.length} complete`);
        }
      }
    };

    if (parallelBatch) {
      let nextIndex = 0;
      const workerCount = Math.min(3, recipientTargets.length);
      await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < recipientTargets.length) {
          const currentIndex = nextIndex++;
          await executeTarget(recipientTargets[currentIndex], currentIndex);
        }
      }));
    } else {
      for (let i = 0; i < recipientTargets.length; i++) {
        await executeTarget(recipientTargets[i], i);
      }
    }

    setExecuting(false);
    setProgressMsg(null);

    const receiptStatus: TradeReceipt["status"] = successCount === recipientTargets.length
      ? "confirmed"
      : successCount === 0 && pendingCount === recipientTargets.length
      ? "pending"
      : successCount + pendingCount > 0
      ? "partial"
      : "failed";
    setLastTradeReceipt({
      status: receiptStatus,
      action: tradeAction,
      scope: scopeMode,
      successfulWallets: successCount,
      pendingWallets: pendingCount,
      failedWallets: failCount,
      wallets: walletReceipts,
      timestamp: Date.now(),
    });

    if (successCount > 0 || pendingCount > 0) {
      const summary = `${successCount} confirmed · ${pendingCount} pending · ${failCount} failed`;
      toast(summary, pendingCount > 0 || failCount > 0 ? "info" : "success");
      const rescanTargets = [
        ...(isMasterBuy && selectedMasterWallet ? wallets.filter((wallet) => wallet.id === selectedMasterWallet.id) : []),
        ...recipientTargets,
      ];
      const uniqueRescanTargets = Array.from(new Map(rescanTargets.map((target) => [target.id, target])).values());
      window.setTimeout(() => { void refreshWallets(uniqueRescanTargets, "sol"); }, 2500);
    } else {
      toast(`Trade execution failed on ${failCount} wallets`, "error");
    }
  };

  const receiptAccent = lastTradeReceipt?.status === "confirmed"
    ? { color: "#4ade80", background: "rgba(34, 197, 94, 0.12)", border: "rgba(34, 197, 94, 0.3)" }
    : lastTradeReceipt?.status === "failed"
    ? { color: "#f87171", background: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.3)" }
    : { color: "#fbbf24", background: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.3)" };
  const validBuyAmount = Number.isFinite(Number(amountPerWallet)) && Number(amountPerWallet) > 0;
  const validSlippage = Number.isFinite(Number(slippage)) && Number(slippage) >= 0 && Number(slippage) <= 50;
  const canExecute = !executing && Boolean(sessionToken) && networkSessionReady && !isAirGapped && isSolana &&
    activeWalletsCount > 0 && isValidSolAddress(tokenAddress.trim()) &&
    (tradeAction === "sell" || validBuyAmount) && validSlippage;

  return (
    <div className="dex-trader-panel">
      {/* 1. Header Banner */}
      <div className="dex-header">
        <div className="dex-title-box">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span className="dex-badge">
              {scopeMode === "single" ? "SINGLE WALLET DEX SWAP" : "MULTI-WALLET SWAP ENGINE"}
            </span>
            {isSolana ? (
              <span className="dex-badge" style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)" }}>
                JUPITER V6 ROUTING · NOT LIVE-TESTED
              </span>
            ) : (
              <span className="dex-badge-warning" style={{ background: "var(--surface-3)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>
                EVM COMING SOON
              </span>
            )}
          </div>
          <h3>
            {scopeMode === "single" && selectedSingleWallet
              ? `DEX Swap · ${selectedSingleWallet.label || `Wallet #${selectedSingleWallet.id}`}`
              : "DEX Batch Trader"}
          </h3>
          <p>
            {scopeMode === "single"
              ? `Trading langsung di dompet ${shortAddr(selectedSingleWallet?.solAddress || "")}. Token yang dibeli 100% masuk dan disimpan di dompet ini sendiri.`
              : isSolana
              ? "Solana DEX flow targets Jupiter v6 with vault-scoped native signing; live RPC and transaction behavior have not been verified in this build."
              : "Multi-wallet parallel swap execution on Uniswap and PancakeSwap is currently in development."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Scope Mode Selector (Single vs Batch) */}
          {!isLockedToPropWallet && (
            <div style={{ display: "flex", background: "var(--bg-card, #131722)", padding: "3px", borderRadius: "6px", border: "1px solid var(--border)" }}>
              <button
                type="button"
                className={`mode-pill ${scopeMode === "single" ? "active-buy" : ""}`}
                style={{ padding: "4px 10px", fontSize: "11px", height: "auto" }}
                onClick={() => setScopeMode("single")}
              >
                👤 Single Wallet (1 Dompet)
              </button>
              <button
                type="button"
                className={`mode-pill ${scopeMode === "batch" ? "active-buy" : ""}`}
                style={{ padding: "4px 10px", fontSize: "11px", height: "auto" }}
                onClick={() => setScopeMode("batch")}
              >
                👥 Multi-Wallet (Banyak)
              </button>
            </div>
          )}

          <div className="dex-mode-pills">
            <button
              type="button"
              className={`mode-pill ${tradeAction === "buy" ? "active-buy" : ""}`}
              onClick={() => setTradeAction("buy")}
            >
              <IconTrendingUp size={13} /> {scopeMode === "single" ? "Buy Token" : "Batch Buy"}
            </button>
            <button
              type="button"
              className={`mode-pill ${tradeAction === "sell" ? "active-sell" : ""}`}
              onClick={() => setTradeAction("sell")}
            >
              <IconTrendingDown size={13} /> {scopeMode === "single" ? "Sell Token" : "Batch Sell"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Form Grid */}
      <div className="dex-form-grid">
        {/* Network Selection */}
        <div className="dex-field">
          <label className="dex-label">1. Blockchain Network</label>
          <div className="dex-chain-tabs">
            {[
              { key: "sol", name: "Solana", dex: "Jupiter v6 (unverified)" },
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

        {/* Single Wallet Selection Card (When in Single Wallet scope) */}
        {scopeMode === "single" && !isLockedToPropWallet && isSolana && (
          <div className="dex-wallet-selector-card">
            <div className="dex-wallet-selector-left">
              <div className="dex-wallet-selector-badge">
                <IconTarget size={12} /> Trading Wallet
              </div>
              <select
                className="dex-wallet-select mono"
                value={selectedSingleWallet?.id}
                onChange={(e) => setSingleWalletId(parseInt(e.target.value, 10))}
              >
                {solWallets.map((w, i) => {
                  const bal = (w.balances?.sol || "0").replace(/\s*SOL\s*$/i, "");
                  return (
                    <option key={w.id} value={w.id}>
                      {w.label ? `${w.label} · ` : `Wallet #${i + 1} · `}{shortAddr(w.solAddress!)} ({bal} SOL)
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="dex-wallet-selector-right">
              <div className="dex-wallet-balance-tag">
                <span className="dex-balance-label">Saldo</span>
                <span className="dex-balance-val mono">
                  {(selectedSingleWallet?.balances?.sol || "0").replace(/\s*SOL\s*$/i, "")} SOL
                </span>
              </div>
              <span className="dex-wallet-guarantee">
                Output ATA ditargetkan ke dompet ini
              </span>
            </div>
          </div>
        )}

        {/* Target Token Input */}
        <div className="dex-field">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "6px" }}>
            <label className="dex-label" style={{ margin: 0 }}>
              {isSolana ? "2. Target Solana SPL Token (Mint Address)" : "2. Target Token Contract / Mint Address"}
            </label>
            {isSolana && tokenAddress.trim().toLowerCase().endsWith("pump") && (
              <span style={{ fontSize: "10px", fontWeight: "700", background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "4px", padding: "2px 8px" }}>
                💊 Pump.fun Token
              </span>
            )}
            {!isSolana && (
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
            )}
          </div>
          <div className="token-input-box">
            <input
              type="text"
              className="dex-input mono"
              placeholder={isSolana ? "Paste Solana SPL Token Mint (misal: ...pump)" : "Paste token address (0x...)"}
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

        {/* Funding Mode Options (for Solana Batch Buy only) */}
        {isSolana && tradeAction === "buy" && scopeMode === "batch" && (
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
              <label className="dex-label" style={{ margin: 0 }}>
                {scopeMode === "single" ? "3. Buy Amount (SOL)" : "3. Amount per Wallet"}
              </label>
              {scopeMode === "single" && selectedSingleWallet && (
                <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                  Saldo: <b style={{ color: "var(--text-main)" }}>{(selectedSingleWallet.balances?.sol || "0").replace(/\s*SOL\s*$/i, "")} SOL</b>
                </span>
              )}
            </div>

            <div className="amount-input-wrap">
              <input
                type="text"
                className="dex-input mono"
                value={amountPerWallet}
                onChange={(e) => setAmountPerWallet(e.target.value)}
              />
              <span className="amount-unit">{selectedChain === "bsc" ? "BNB" : selectedChain === "sol" ? "SOL" : "ETH"}</span>
            </div>

            {/* Quick Amount Presets for Single Wallet Mode */}
            {scopeMode === "single" && isSolana && selectedSingleWallet && (
              <div className="dex-quick-presets">
                {["0.01", "0.05", "0.1", "0.25"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`dex-preset-btn ${amountPerWallet === preset ? "active" : ""}`}
                    onClick={() => setAmountPerWallet(preset)}
                  >
                    {preset} SOL
                  </button>
                ))}
                <button
                  type="button"
                  className="dex-preset-btn"
                  onClick={() => {
                    const raw = parseFloat((selectedSingleWallet.balances?.sol || "0").replace(/\s*SOL\s*$/i, "")) || 0;
                    const half = Math.max(0, (raw * 0.5) - 0.002).toFixed(4);
                    setAmountPerWallet(half);
                  }}
                >
                  50%
                </button>
                <button
                  type="button"
                  className="dex-preset-btn"
                  onClick={() => {
                    const raw = parseFloat((selectedSingleWallet.balances?.sol || "0").replace(/\s*SOL\s*$/i, "")) || 0;
                    const max = Math.max(0, raw - 0.005).toFixed(4);
                    setAmountPerWallet(max);
                  }}
                >
                  MAX
                </button>
              </div>
            )}
          </div>

          <div className="dex-field w-32">
            <label className="dex-label" style={{ marginBottom: "2px" }}>Slippage (%)</label>
            <input
              type="text"
              className="dex-input mono"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />
            {scopeMode === "single" && (
              <div className="dex-quick-presets">
                {["1.0", "2.5", "5.0"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`dex-preset-btn ${slippage === s ? "active" : ""}`}
                    onClick={() => setSlippage(s)}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Strategy Pills only shown in Batch mode */}
          {scopeMode === "batch" && (
            <div className="dex-field flex-1">
              <label className="dex-label" style={{ marginBottom: "2px" }}>Execution Strategy</label>
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
          )}
        </div>
      </div>

      {/* 3. Execution Summary Bar */}
      <div className="dex-summary-bar">
        <div className="summary-left">
          {scopeMode === "single" ? (
            <div>
              <div className="summary-wallets">
                Trading di: <strong className="mono text-emerald">{selectedSingleWallet ? shortAddr(selectedSingleWallet.solAddress || "") : "Pilih Dompet"}</strong>
              </div>
              <div className="summary-est" style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Total Belanja: <strong className="mono" style={{ color: "#4ade80" }}>{amountPerWallet} SOL</strong>
                <span style={{ marginLeft: 8 }}>· output account ditargetkan ke ATA wallet ini</span>
              </div>
            </div>
          ) : (
            <div>
              <div className="summary-wallets">
                <span className="summary-highlight mono">{activeWalletsCount}</span> Active Wallets Selected
              </div>
              <div className="summary-est">
                Estimated Total: <strong className="mono">{(parseFloat(amountPerWallet || "0") * activeWalletsCount).toFixed(4)} {selectedChain === "bsc" ? "BNB" : selectedChain === "sol" ? "SOL" : "ETH"}</strong>
              </div>
            </div>
          )}
        </div>

        {isSolana ? (
          <button
            type="button"
            className="btn-execute-trade"
            onClick={handleExecute}
            disabled={!canExecute}
            style={{
              background: tradeAction === "buy"
                ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)"
                : "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              color: "#fff",
              cursor: executing || activeWalletsCount === 0 || !tokenAddress.trim() || !amountPerWallet || parseFloat(amountPerWallet) <= 0 ? "not-allowed" : "pointer",
              opacity: executing || activeWalletsCount === 0 || !tokenAddress.trim() || !amountPerWallet || parseFloat(amountPerWallet) <= 0 ? 0.6 : 1,
              padding: "0 22px",
              height: "36px",
              fontSize: "12px",
            }}
          >
            {executing ? (
              progressMsg || "Executing Swaps..."
            ) : (
              <>
                <IconZap size={14} /> {scopeMode === "single"
                  ? `Swap Sekarang (${amountPerWallet} SOL)`
                  : `Execute ${fundingMode === "master" && tradeAction === "buy" ? "Master-Funded" : "Batch"} ${tradeAction === "buy" ? "Buy" : "Sell"} (${activeWalletsCount} Wallets)`}
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

      {/* 4. Trade Receipt & Verification Card */}
      {lastTradeReceipt && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px 18px",
            borderRadius: "8px",
            background: receiptAccent.background,
            border: `1px solid ${receiptAccent.border}`,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: receiptAccent.background,
                  color: receiptAccent.color,
                }}
              >
                {lastTradeReceipt.status === "confirmed" ? "✓ CONFIRMED" : lastTradeReceipt.status === "failed" ? "✕ FAILED" : lastTradeReceipt.status === "pending" ? "◷ PENDING CONFIRMATION" : "◐ PARTIAL RESULTS"}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {lastTradeReceipt.action === "buy" ? "DEX Buy" : "DEX Sell"} · {lastTradeReceipt.scope} · {new Date(lastTradeReceipt.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLastTradeReceipt(null)}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "14px", padding: "2px 6px" }}
              title="Close receipt"
            >
              ✕
            </button>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: "12px" }}>
            <span style={{ color: "#4ade80" }}>Confirmed: {lastTradeReceipt.successfulWallets}</span>
            <span style={{ color: "#fbbf24" }}>Pending: {lastTradeReceipt.pendingWallets}</span>
            <span style={{ color: "#f87171" }}>Failed: {lastTradeReceipt.failedWallets}</span>
          </div>

          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {lastTradeReceipt.wallets.map((entry, index) => (
              <div key={`${entry.walletAddress}-${entry.txHash || index}`} style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(0,0,0,0.16)", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-main)" }}>{shortAddr(entry.walletAddress)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: entry.status === "confirmed" ? "#4ade80" : entry.status === "pending" ? "#fbbf24" : "#f87171" }}>
                    {entry.status === "confirmed" ? "Confirmed" : entry.status === "pending" ? "Pending" : "Failed"}
                  </span>
                </div>
                {entry.amountSent && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{entry.amountSent}</span>}
                {entry.txHash && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: 10, color: "var(--accent)", wordBreak: "break-all" }}>{entry.txHash}</span>
                    {entry.explorerUrl && <a href={entry.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#60a5fa", textDecoration: "underline" }}>Open in explorer ↗</a>}
                  </div>
                )}
                {entry.error && <span style={{ fontSize: 11, color: "#f87171", overflowWrap: "anywhere" }}>{entry.error}</span>}
              </div>
            ))}
          </div>

          {lastTradeReceipt.status === "confirmed" && (
            <div style={{ fontSize: "11px", color: "#4ade80" }}>
              Confirmed swaps will refresh wallet balances and token holdings shortly.
            </div>
          )}
          {lastTradeReceipt.pendingWallets > 0 && (
            <div style={{ fontSize: "11px", color: "#fbbf24" }}>
              Submitted transactions are not shown as confirmed. Check the explorer links; a delayed rescan has been scheduled.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
