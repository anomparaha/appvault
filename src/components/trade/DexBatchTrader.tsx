import { useState, useMemo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../../context/AppContext";
import { ChainIcon, IconTrendingUp, IconTrendingDown, IconTarget, IconZap } from "../../icons";
import type { WalletView } from "../../lib/types/index";
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
  const { wallets, selectedSweepIds, selectAllFunded, sessionToken, isAirGapped, networkSessionReady, refreshWallets, toast } = useApp();
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
  const [scopeMode, setScopeMode] = useState<"single" | "batch">("single");
  const [singleWalletId, setSingleWalletId] = useState<number | null>(wallet ? wallet.id : null);
  const [fundingMode, setFundingMode] = useState<"master" | "distributed">("distributed");
  const [masterWalletId, setMasterWalletId] = useState<number | null>(null);
  const [batchExecutionOrder, setBatchExecutionOrder] = useState<"parallel" | "sequential">("parallel");
  const [slippage, setSlippage] = useState("2.5");
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
    if (selectedSweepIds.size === 0) return [];
    return wallets.filter((w) => selectedSweepIds.has(w.id) && (selectedChain === "sol" ? !!w.solAddress : !!w.address));
  }, [scopeMode, selectedSingleWallet, selectedSweepIds, wallets, selectedChain, solWallets]);

  const solCandidateMasters = useMemo(() => {
    return solWallets
      .map((w) => {
        const balStr = w.balances?.sol || "0";
        return {
          id: w.id,
          address: w.solAddress!,
          label: w.label,
          solBalance: parseFloat(balStr) || 0,
          solFormatted: balStr.includes("SOL") ? balStr : `${balStr} SOL`,
        };
      })
      .filter((candidate) => candidate.solBalance > 0)
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
  const batchRunsParallel = scopeMode === "batch" && !masterBuyMode && batchExecutionOrder === "parallel";
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
    const parallelBatch = batchRunsParallel;

    const confirmed = window.confirm(
      scopeMode === "single"
        ? `CONFIRM SINGLE-WALLET ${tradeAction.toUpperCase()} SWAP\n\n` +
          `Wallet: ${selectedSingleWallet?.label || `Wallet #${selectedSingleWallet?.id}`} (${shortAddr(selectedSingleWallet?.solAddress || "")})\n` +
          `Token mint: ${shortAddr(mint)}\n` +
          `${tradeAction === "buy" ? `Buy amount: ${amountNum} SOL from this wallet\nFee and account reserve: ${SOLANA_BUY_RESERVE_SOL.toFixed(3)} SOL\nOutput stays in this wallet.` : "Sell the selected token balance from this wallet to SOL. Proceeds return to this wallet."}\n` +
          `Slippage: ${(slippageBps / 100).toFixed(1)}%\n\n` +
          `Continue with the swap?`
        : isMasterBuy
        ? `CONFIRM MASTER-FUNDED BATCH BUY\n\n` +
          `Funding wallet: ${shortAddr(selectedMasterWallet.address)} (${selectedMasterWallet.solFormatted})\n` +
          `Token mint: ${shortAddr(mint)}\n` +
          `Recipient wallets: ${recipientTargets.length}\n` +
          `Buy amount per wallet: ${amountNum} SOL\n` +
          `Buy capital: ${totalNeededSol} SOL\n` +
          `Estimated fee and account reserve: ${totalReservedSol} SOL\n` +
          `Estimated master requirement: ${(Number(totalNeededSol) + Number(totalReservedSol)).toFixed(3)} SOL\n` +
          `Slippage: ${(slippageBps / 100).toFixed(1)}%\n\n` +
          `Swaps run sequentially because they share one funding wallet. Tokens are delivered to each selected recipient wallet.\n\n` +
          `Continue with the batch buy?`
        : `CONFIRM SELECTED-WALLET BATCH ${tradeAction.toUpperCase()}\n\n` +
          `Token mint: ${shortAddr(mint)}\n` +
          `Selected wallets: ${recipientTargets.length}\n` +
          `${tradeAction === "buy" ? `Amount per wallet: ${amountNum} SOL\nTotal buy capital: ${totalNeededSol} SOL\nEstimated fee and account reserve: ${totalReservedSol} SOL\n` : "Action: sell each selected wallet's discovered token balance to SOL.\n"}` +
          `Slippage: ${(slippageBps / 100).toFixed(1)}%\n` +
          `Execution: ${parallelBatch ? "parallel, up to 3 wallets at a time" : "sequential"}\n\n` +
          `Continue with the batch swap?`
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
    activeWalletsCount > 0 && (!masterBuyMode || Boolean(selectedMasterWallet)) && isValidSolAddress(tokenAddress.trim()) &&
    (tradeAction === "sell" || validBuyAmount) && validSlippage;

  return (
    <div className="dex-trader-panel dex-page">
      <header className="dex-header">
        <div className="dex-title-box">
          <div className="dex-eyebrow-row">
            <span className="dex-badge">{scopeMode === "single" ? "SINGLE WALLET" : "SELECTED WALLETS"}</span>
            <span className={`dex-badge ${isSolana ? "dex-badge-route" : "dex-badge-warning"}`}>
              {isSolana ? "JUPITER ROUTE · NOT LIVE-TESTED" : "EVM SWAPS UNAVAILABLE"}
            </span>
          </div>
          <h3>DEX Trader</h3>
          <p>
            {scopeMode === "single"
              ? `Swap directly from ${selectedSingleWallet ? shortAddr(selectedSingleWallet.solAddress || "") : "your selected wallet"}. Output stays in that wallet.`
              : "Batch swaps use only Solana wallets selected in the portfolio. Review each target before submitting."}
          </p>
        </div>

        <div className="dex-header-controls">
          {!isLockedToPropWallet && (
            <div className="dex-scope-switch" role="group" aria-label="Wallet scope">
              <button
                type="button"
                className={scopeMode === "single" ? "active" : ""}
                onClick={() => setScopeMode("single")}
                disabled={executing}
                aria-pressed={scopeMode === "single"}
              >
                Single wallet
              </button>
              <button
                type="button"
                className={scopeMode === "batch" ? "active" : ""}
                onClick={() => setScopeMode("batch")}
                disabled={executing}
                aria-pressed={scopeMode === "batch"}
              >
                Selected wallets
              </button>
            </div>
          )}

          <div className="dex-mode-pills" role="group" aria-label="Swap action">
            <button
              type="button"
              className={`mode-pill ${tradeAction === "buy" ? "active-buy" : ""}`}
              onClick={() => setTradeAction("buy")}
              disabled={executing}
              aria-pressed={tradeAction === "buy"}
            >
              <IconTrendingUp size={13} /> Buy
            </button>
            <button
              type="button"
              className={`mode-pill ${tradeAction === "sell" ? "active-sell" : ""}`}
              onClick={() => setTradeAction("sell")}
              disabled={executing}
              aria-pressed={tradeAction === "sell"}
            >
              <IconTrendingDown size={13} /> Sell
            </button>
          </div>
          <div className={`dex-session-state ${isAirGapped || !sessionToken || !networkSessionReady ? "is-blocked" : "is-ready"}`}>
            <span />
            {isAirGapped ? "Safe Mode" : !sessionToken ? "Vault locked" : networkSessionReady ? "Online session ready" : "Checking network gate"}
          </div>
        </div>
      </header>

      {scopeMode === "batch" && (
        <div className={`dex-selection-notice ${compatibleTargets.length === 0 ? "is-empty" : ""}`}>
          <span className="dex-selection-count">{compatibleTargets.length}</span>
          <div>
            <strong>{compatibleTargets.length === 1 ? "1 selected Solana wallet" : `${compatibleTargets.length} selected Solana wallets`}</strong>
            <p>
              {selectedSweepIds.size === 0
                ? "Select wallets in your portfolio to enable batch trading. No wallet is selected by default."
                : tradeAction === "sell"
                  ? `${executionTargets.length} selected wallet${executionTargets.length === 1 ? "" : "s"} currently have a discovered balance for this mint.`
                  : "Only selected wallets with a Solana address are included in this batch."}
              {masterBuyMode ? " Master-funded swaps run sequentially." : batchRunsParallel ? " Batch swaps run in parallel groups of up to 3 wallets." : " Batch swaps run sequentially."}
            </p>
          </div>
          {compatibleTargets.length === 0 && (
            <button type="button" className="dex-select-funded" onClick={() => selectAllFunded("sol")} disabled={executing}>
              Select funded Solana wallets
            </button>
          )}
        </div>
      )}

      <fieldset className="dex-form-grid dex-form-fieldset" disabled={executing}>
        {/* Network Selection */}
        <div className="dex-field">
          <label className="dex-label">1. Blockchain Network</label>
          <div className="dex-chain-tabs">
            {[
              { key: "sol", name: "Solana", detail: "Jupiter route · not live-tested", available: true },
              { key: "eth", name: "Ethereum", detail: "DEX router unavailable", available: false },
              { key: "robinhood", name: "Robinhood", detail: "DEX router unavailable", available: false },
              { key: "base", name: "Base", detail: "DEX router unavailable", available: false },
              { key: "arb", name: "Arbitrum", detail: "DEX router unavailable", available: false },
              { key: "bsc", name: "BNB Chain", detail: "DEX router unavailable", available: false },
            ].map((c) => (
              <button
                key={c.key}
                type="button"
                className={`dex-chain-btn ${selectedChain === c.key ? "active" : ""} ${!c.available ? "is-unavailable" : ""}`}
                onClick={() => { if (c.available) setSelectedChain(c.key as any); }}
                disabled={!c.available || executing}
                aria-pressed={selectedChain === c.key}
                title={!c.available ? `${c.name} DEX support is not available yet` : undefined}
              >
                <ChainIcon chain={c.key} size={18} />
                <div className="chain-info">
                  <span className="chain-title">{c.name}</span>
                  <span className="chain-dex">{c.detail}</span>
                </div>
                {!c.available && <span className="dex-coming-soon">Soon</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Single Wallet Selection Card (When in Single Wallet scope) */}
        {scopeMode === "single" && !isLockedToPropWallet && isSolana && (
          <div className="dex-wallet-selector-card">
            <div className="dex-wallet-selector-left">
              <div className="dex-wallet-selector-badge">
                <IconTarget size={12} /> Trading wallet
              </div>
              <select
                className="dex-wallet-select mono"
                value={selectedSingleWallet?.id ?? ""}
                onChange={(e) => setSingleWalletId(parseInt(e.target.value, 10))}
                disabled={solWallets.length === 0 || executing}
              >
                {solWallets.length === 0 && <option value="">No Solana wallets available</option>}
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
                <span className="dex-balance-label">Balance</span>
                <span className="dex-balance-val mono">
                  {(selectedSingleWallet?.balances?.sol || "0").replace(/\s*SOL\s*$/i, "")} SOL
                </span>
              </div>
              <span className="dex-wallet-guarantee">
                Swap output stays in this wallet
              </span>
            </div>
          </div>
        )}

        {/* Target Token Input */}
        <div className="dex-field">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "6px" }}>
            <label className="dex-label" style={{ margin: 0 }}>
              2. Solana SPL token mint
            </label>
          </div>
          <div className="token-input-box">
            <input
              type="text"
              className="dex-input mono"
              placeholder="Paste the Solana SPL token mint address"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              disabled={!isSolana || executing}
            />
            {tokenAddress && (
              <button type="button" className="btn-clear-input" onClick={() => setTokenAddress("")} disabled={!isSolana || executing}>
                ×
              </button>
            )}
          </div>
        </div>

        {/* Batch buy funding */}
        {isSolana && tradeAction === "buy" && scopeMode === "batch" && (
          <div className="dex-field dex-funding-panel">
            <div className="dex-funding-heading">
              <div>
                <label className="dex-label">SOL buy funding</label>
                <p>Choose where the SOL for each selected wallet’s buy comes from.</p>
              </div>
              <div className="dex-funding-toggle" role="group" aria-label="Batch buy funding source">
                <button
                  type="button"
                  className={fundingMode === "master" ? "active" : ""}
                  onClick={() => setFundingMode("master")}
                  disabled={executing || solCandidateMasters.length === 0}
                  aria-pressed={fundingMode === "master"}
                >
                  One master wallet
                </button>
                <button
                  type="button"
                  className={fundingMode === "distributed" ? "active" : ""}
                  onClick={() => setFundingMode("distributed")}
                  disabled={executing}
                  aria-pressed={fundingMode === "distributed"}
                >
                  Each wallet pays for its own buy
                </button>
              </div>
            </div>

            {fundingMode === "master" && (
              <div className="dex-master-funding-row">
                <label className="dex-label" htmlFor="dex-master-funder">Funding wallet</label>
                <select
                  id="dex-master-funder"
                  className="dex-input mono"
                  value={selectedMasterWallet?.id ?? ""}
                  onChange={(event) => setMasterWalletId(parseInt(event.target.value, 10))}
                  disabled={solCandidateMasters.length === 0 || executing}
                >
                  {solCandidateMasters.map((candidate, index) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label || `Wallet #${index + 1}`} · {shortAddr(candidate.address)} · {candidate.solFormatted}
                    </option>
                  ))}
                  {solCandidateMasters.length === 0 && <option value="">No funded Solana wallets found</option>}
                </select>
                <span className="dex-master-funding-hint">
                  {solCandidateMasters.length === 0
                    ? "A funded Solana wallet is required for master-funded buys."
                    : `Estimated buy capital: ${(activeWalletsCount * (parseFloat(amountPerWallet) || 0.05)).toFixed(3)} SOL, plus network and account reserves.`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Trade Configuration */}
        <div className={`dex-config-row ${tradeAction === "sell" ? "is-sell" : ""}`}>
          {tradeAction === "buy" && (
          <div className="dex-field flex-1">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
              <label className="dex-label" style={{ margin: 0 }}>
                {scopeMode === "single" ? "3. Buy amount" : "3. Buy amount per wallet"}
              </label>
              {scopeMode === "single" && selectedSingleWallet && (
                <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                  Balance: <b style={{ color: "var(--text-main)" }}>{(selectedSingleWallet.balances?.sol || "0").replace(/\s*SOL\s*$/i, "")} SOL</b>
                </span>
              )}
            </div>

            <div className="amount-input-wrap">
              <input
                type="text"
                className="dex-input mono"
                value={amountPerWallet}
                onChange={(e) => setAmountPerWallet(e.target.value)}
                disabled={executing}
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
          )}

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
        </div>

        {scopeMode === "batch" && (
          <div className={`dex-execution-order ${masterBuyMode ? "is-forced" : ""}`}>
            <div>
              <strong>Batch execution</strong>
              <p>{masterBuyMode ? "One funding wallet is shared, so swaps run one at a time." : "Choose how selected wallet swaps are submitted."}</p>
            </div>
            {masterBuyMode ? (
              <span className="dex-execution-required">Sequential · required</span>
            ) : (
              <div className="dex-execution-toggle" role="group" aria-label="Batch execution order">
                <button
                  type="button"
                  className={batchExecutionOrder === "parallel" ? "active" : ""}
                  onClick={() => setBatchExecutionOrder("parallel")}
                  disabled={executing}
                  aria-pressed={batchExecutionOrder === "parallel"}
                >
                  Parallel <small>up to 3</small>
                </button>
                <button
                  type="button"
                  className={batchExecutionOrder === "sequential" ? "active" : ""}
                  onClick={() => setBatchExecutionOrder("sequential")}
                  disabled={executing}
                  aria-pressed={batchExecutionOrder === "sequential"}
                >
                  Sequential
                </button>
              </div>
            )}
          </div>
        )}
      </fieldset>

      <footer className="dex-summary-bar">
        <div className="dex-summary-copy">
          {scopeMode === "single" ? (
            <>
              <div className="dex-summary-title">
                Trading wallet <strong className="mono">{selectedSingleWallet ? shortAddr(selectedSingleWallet.solAddress || "") : "Select a wallet"}</strong>
              </div>
              <div className="dex-summary-detail">
                {tradeAction === "buy"
                  ? <>Buy amount: <strong className="mono">{amountPerWallet} SOL</strong> · Output stays in this wallet.</>
                  : <>Sell the selected token balance to SOL. Proceeds return to this wallet.</>}
              </div>
            </>
          ) : (
            <>
              <div className="dex-summary-title">
                <strong className="mono">{activeWalletsCount}</strong> eligible selected wallet{activeWalletsCount === 1 ? "" : "s"}
              </div>
              <div className="dex-summary-detail">
                {tradeAction === "buy" ? (
                  <>Estimated buy input: <strong className="mono">{(parseFloat(amountPerWallet || "0") * activeWalletsCount).toFixed(4)} SOL</strong> total</>
                ) : (
                  <>{executionTargets.length} selected wallet{executionTargets.length === 1 ? "" : "s"} with a discovered balance for this mint</>
                )}
                <span className="dex-execution-note">
                  {masterBuyMode ? "Master-funded swaps run sequentially." : batchRunsParallel ? "Parallel batches of up to 3." : "Sequential execution."}
                </span>
              </div>
            </>
          )}
        </div>

        {isSolana ? (
          <button
            type="button"
            className={`btn-execute-trade ${tradeAction === "sell" ? "is-sell" : "is-buy"}`}
            onClick={handleExecute}
            disabled={!canExecute}
          >
            {executing ? (
              progressMsg || "Executing swap…"
            ) : (
              <>
                <IconZap size={14} />
                {scopeMode === "single"
                  ? tradeAction === "buy" ? `Buy · ${amountPerWallet} SOL` : "Sell token to SOL"
                  : `${masterBuyMode ? "Master-funded " : "Batch "}${tradeAction} · ${activeWalletsCount} wallet${activeWalletsCount === 1 ? "" : "s"}`}
              </>
            )}
          </button>
        ) : (
          <button type="button" className="btn-execute-trade btn-disabled" disabled>
            <IconZap size={13} /> EVM DEX swaps are not available yet
          </button>
        )}
      </footer>

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
