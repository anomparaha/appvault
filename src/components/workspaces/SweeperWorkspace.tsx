import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import {
  SWEEP_CHAINS,
  fetchLiveFeeData,
  estimateWalletSweep,
  estimateTokenWalletSweep,
  estimateTokenDexSellSweep,
  estimateTokenDexBuySweep,
  estimateMasterDexBuySweep,
  executeSweepSingle,
  executeTokenSweepSingle,
  executeTokenDexSellSingle,
  executeTokenDexBuySingle,
  executeMasterDexBuySingle,
  type WalletSweepEstimate,
  type SweepTxResult,
} from "../../lib/services/sweeper";
import { logActivity } from "../../lib/services/activity";
import { formatCompactBalance } from "../../lib/chains/chains";
import { shortAddr } from "../../lib/wallets/wallet";
import { formatEther, isEvmAddress, isValidSolAddress } from "../../lib/utils/format";
import { ChainIcon, TokenIcon, IconArrowLeft, IconZap, IconRocket, IconEdit3, IconCheckCircle, IconAlertTriangle, IconTrendingUp } from "../../icons";
import { WinRateCard } from "../analytics/WinRateCard";

function getWalletTargetAddr(w: { address: string | null; solAddress: string | null }, isEvm: boolean): string {
  return (isEvm ? w.address : w.solAddress) ?? "";
}

export function SweeperWorkspace({ onBack }: { onBack?: () => void }) {
  const {
    wallets,
    selectedSweepIds,
    selectAllFunded,
    sessionToken,
    scanAll,
    optimisticClearSweptWalletBalance,
    toast,
  } = useApp();

  const [chainKey, setChainKey] = useState<string>("eth");
  const [recipient, setRecipient] = useState<string>("");
  const [gasPriceGwei, setGasPriceGwei] = useState<number>(1.2);
  const [gasMode, setGasMode] = useState<"standard" | "fast" | "turbo" | "custom">("standard");
  const [customGwei, setCustomGwei] = useState<string>("1.5");
  const [liveFeeGwei, setLiveFeeGwei] = useState<number>(1.2);
  const [loadingEstimates, setLoadingEstimates] = useState<boolean>(false);
  const [estimates, setEstimates] = useState<Record<number, WalletSweepEstimate>>({});
  const [sweeping, setSweeping] = useState<boolean>(false);
  const [sweepProgress, setSweepProgress] = useState<{ current: number; total: number; msg: string } | null>(null);
  const [txResults, setTxResults] = useState<Record<number, SweepTxResult>>({});

  // Solana Asset Mode & Single-Funder Fee Payer
  const [assetMode, setAssetMode] = useState<"native" | "token">("native");
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>("");
  const [customMintInput, setCustomMintInput] = useState<string>("");
  const [feePayerWalletId, setFeePayerWalletId] = useState<number | null>(null);
  const [tokenAction, setTokenAction] = useState<"transfer" | "dex_sell" | "dex_buy">("dex_sell");
  const [buyAmountSol, setBuyAmountSol] = useState<string>("0.05");
  const [buyFundingMode, setBuyFundingMode] = useState<"master" | "distributed">("master");
  const [slippageBps, setSlippageBps] = useState<number>(250);
  const [showWinRate, setShowWinRate] = useState<boolean>(false);

  const activeChain = SWEEP_CHAINS[chainKey] || SWEEP_CHAINS.eth;
  const isEvmChain = chainKey !== "sol";

  // Revert assetMode to native if switching away from Solana
  useEffect(() => {
    if (chainKey !== "sol") {
      setAssetMode("native");
    }
  }, [chainKey]);

  // Target wallets: STRICTLY selected wallets that match the active network family (EVM vs SOL)
  const targetWallets = useMemo(() => {
    if (selectedSweepIds.size === 0) return [];
    return wallets.filter((w) => {
      if (!selectedSweepIds.has(w.id)) return false;
      if (isEvmChain) {
        return !!w.address;
      } else {
        return !!w.solAddress;
      }
    });
  }, [wallets, selectedSweepIds, isEvmChain]);

  const activeFamilyFundedCount = useMemo(() => {
    return wallets.filter((w) => w.hasFunds && (isEvmChain ? !!w.address : !!w.solAddress)).length;
  }, [wallets, isEvmChain]);

  // Discovered Solana SPL / Token-2022 tokens across vault
  const discoveredSolTokens = useMemo(() => {
    const map = new Map<string, { mint: string; symbol: string; name: string; decimals: number; programId?: string; logoUrl?: string | null; count: number }>();
    for (const w of wallets) {
      if (!w.solAddress || !w.tokens) continue;
      for (const t of w.tokens) {
        if (t.chain?.toLowerCase() === "sol" && t.contractAddress) {
          const existing = map.get(t.contractAddress);
          if (existing) {
            existing.count++;
            if (!existing.logoUrl && t.logoUrl) existing.logoUrl = t.logoUrl;
          } else {
            let decimals = 6;
            let programId: string | undefined = undefined;
            if (t.contractAddress === "BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs") {
              decimals = 9;
              programId = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
            } else if (t.rawBalance && t.balance) {
              const num = parseFloat(t.balance);
              if (num > 0) {
                const rawLen = t.rawBalance.length;
                const intPartLen = Math.floor(num).toString().length;
                const estDec = rawLen - intPartLen;
                if (estDec >= 0 && estDec <= 18) {
                  decimals = estDec;
                }
              }
            }

            map.set(t.contractAddress, {
              mint: t.contractAddress,
              symbol: t.symbol || "TOKEN",
              name: t.name || t.symbol || "SPL Token",
              decimals,
              programId,
              logoUrl: t.logoUrl,
              count: 1,
            });
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [wallets]);

  // Auto-set default token when entering token mode
  useEffect(() => {
    if (assetMode === "token" && !selectedTokenMint && discoveredSolTokens.length > 0) {
      setSelectedTokenMint(discoveredSolTokens[0].mint);
    }
  }, [assetMode, selectedTokenMint, discoveredSolTokens]);

  const activeTokenMint = selectedTokenMint === "custom" ? customMintInput.trim() : selectedTokenMint;
  const activeTokenInfo = useMemo(() => {
    if (assetMode !== "token" || !activeTokenMint) return null;
    return discoveredSolTokens.find((t) => t.mint === activeTokenMint) || {
      mint: activeTokenMint,
      symbol: "TOKEN",
      name: "Custom SPL Token",
      decimals: activeTokenMint === "BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs" ? 9 : 6,
      programId: activeTokenMint === "BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs" ? "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" : undefined,
      logoUrl: null,
      count: 0,
    };
  }, [assetMode, activeTokenMint, discoveredSolTokens]);

  // Solana candidate Fee Payer wallets (wallets holding SOL)
  const solCandidateFeePayers = useMemo(() => {
    return wallets
      .filter((w) => !!w.solAddress)
      .map((w) => {
        const balStr = w.balances?.sol || "0";
        const balNum = parseFloat(balStr) || 0;
        return {
          id: w.id,
          address: w.solAddress!,
          label: w.label,
          solBalance: balNum,
          solFormatted: balStr.includes("SOL") ? balStr : `${balStr} SOL`,
        };
      })
      .sort((a, b) => b.solBalance - a.solBalance);
  }, [wallets]);

  // Selected Master Wallet (for Gas Sponsorship and Master Buy Funding)
  const selectedMasterWallet = useMemo(() => {
    return solCandidateFeePayers.find((c) => c.id === feePayerWalletId) || solCandidateFeePayers[0];
  }, [solCandidateFeePayers, feePayerWalletId]);

  // Auto-select best Fee Payer (wallet with highest SOL)
  useEffect(() => {
    if (chainKey === "sol" && feePayerWalletId === null && solCandidateFeePayers.length > 0) {
      const best = solCandidateFeePayers.find((c) => c.solBalance >= 0.001);
      if (best) {
        setFeePayerWalletId(best.id);
      }
    }
  }, [chainKey, solCandidateFeePayers, feePayerWalletId]);

  // Load live fee data when chain changes
  useEffect(() => {
    let active = true;
    fetchLiveFeeData(chainKey)
      .then((data) => {
        if (!active) return;
        setLiveFeeGwei(data.gasPriceGwei);
        setGasPriceGwei(data.gasPriceGwei);
      })
      .catch((err) => console.warn("Failed fetching fee data:", err));
    return () => {
      active = false;
    };
  }, [chainKey]);

  // Estimate balances and net amounts
  useEffect(() => {
    if (targetWallets.length === 0) return;
    let active = true;
    setLoadingEstimates(true);

    const runEstimates = async () => {
      const results: Record<number, WalletSweepEstimate> = {};
      for (const w of targetWallets) {
        const addr = getWalletTargetAddr(w, isEvmChain);
        if (!addr) continue;

        if (chainKey === "sol" && assetMode === "token") {
          const tok = w.tokens?.find((t) => t.chain?.toLowerCase() === "sol" && t.contractAddress === activeTokenMint);
          const rawBal = tok?.rawBalance || "0";
          const balFmt = tok?.balance || `0 ${activeTokenInfo?.symbol || "TOKEN"}`;

          const tokenParam = {
            mint: activeTokenMint,
            symbol: tok?.symbol || activeTokenInfo?.symbol || "TOKEN",
            name: tok?.name || activeTokenInfo?.name || "SPL Token",
            decimals: activeTokenInfo?.decimals ?? 9,
            programId: activeTokenInfo?.programId,
            rawBalance: rawBal,
            balanceFormatted: balFmt,
          };

          const est = tokenAction === "dex_sell"
            ? await estimateTokenDexSellSweep(
                w.id,
                addr,
                tokenParam,
                feePayerWalletId ?? undefined,
                slippageBps
              )
            : tokenAction === "dex_buy"
            ? (buyFundingMode === "master"
                ? await estimateMasterDexBuySweep(
                    w.id,
                    addr,
                    { mint: activeTokenMint, symbol: activeTokenInfo?.symbol || "TOKEN", decimals: activeTokenInfo?.decimals },
                    parseFloat(buyAmountSol) || 0.05,
                    selectedMasterWallet?.id ?? w.id,
                    selectedMasterWallet?.solBalance ?? 0,
                    slippageBps
                  )
                : await estimateTokenDexBuySweep(
                    w.id,
                    addr,
                    { mint: activeTokenMint, symbol: activeTokenInfo?.symbol || "TOKEN", decimals: activeTokenInfo?.decimals },
                    parseFloat(buyAmountSol) || 0.05,
                    feePayerWalletId ?? undefined,
                    slippageBps
                  ))
            : await estimateTokenWalletSweep(
                w.id,
                addr,
                tokenParam,
                feePayerWalletId ?? undefined
              );

          if (!active) return;
          results[w.id] = est;
        } else {
          const est = await estimateWalletSweep(
            w.id,
            addr,
            chainKey,
            gasPriceGwei,
            chainKey === "sol" ? (feePayerWalletId ?? undefined) : undefined
          );
          if (!active) return;
          results[w.id] = est;
        }
      }
      if (active) {
        setEstimates(results);
        setLoadingEstimates(false);
      }
    };

    runEstimates();
    return () => {
      active = false;
    };
  }, [chainKey, gasPriceGwei, targetWallets, assetMode, activeTokenMint, feePayerWalletId, isEvmChain, activeTokenInfo, tokenAction, buyAmountSol, slippageBps, buyFundingMode, selectedMasterWallet]);

  const isRecipientRequired = !(chainKey === "sol" && assetMode === "token" && tokenAction === "dex_buy");
  const validRecipient = !isRecipientRequired
    ? (recipient.trim() === "" || isValidSolAddress(recipient.trim()))
    : (isEvmChain ? isEvmAddress(recipient.trim()) : isValidSolAddress(recipient.trim()));
  const sweepableWallets = targetWallets.filter((w) => estimates[w.id]?.isSweepable);
  const totalNetFormatted = useMemo(() => {
    if (sweepableWallets.length === 0) {
      if (chainKey === "sol" && assetMode === "token") {
        return `0 ${activeTokenInfo?.symbol || "TOKEN"}`;
      }
      return `0 ${activeChain.symbol}`;
    }

    if (chainKey === "sol" && assetMode === "token") {
      if (tokenAction === "dex_sell") {
        const totalLamports = sweepableWallets.reduce((acc, w) => {
          const est = estimates[w.id];
          return est ? acc + est.netWei : acc;
        }, 0n);
        return `~${(Number(totalLamports) / 1e9).toFixed(6)} SOL (Direct to Master)`;
      } else if (tokenAction === "dex_buy") {
        const decimals = activeTokenInfo?.decimals ?? 6;
        const totalTokens = sweepableWallets.reduce((acc, w) => {
          const est = estimates[w.id];
          return est ? acc + est.netWei : acc;
        }, 0n);
        const factor = 10 ** decimals;
        const fmt = (Number(totalTokens) / factor).toFixed(decimals > 6 ? 4 : 2);
        return `~${fmt} ${activeTokenInfo?.symbol || "TOKEN"} (Total Bought)`;
      }
      const sym = activeTokenInfo?.symbol || "TOKEN";
      return `${sweepableWallets.length} Wallets (${sym})`;
    }

    if (chainKey === "sol") {
      const totalLamports = sweepableWallets.reduce((acc, w) => {
        const est = estimates[w.id];
        return est ? acc + est.netWei : acc;
      }, 0n);
      return `${(Number(totalLamports) / 1e9).toFixed(6)} SOL`;
    }

    const totalNetWei = sweepableWallets.reduce((acc, w) => {
      const est = estimates[w.id];
      return est ? acc + est.netWei : acc;
    }, 0n);
    return `${Number(formatEther(totalNetWei)).toFixed(6)} ${activeChain.symbol}`;
  }, [sweepableWallets, estimates, chainKey, assetMode, activeTokenInfo, activeChain]);

  const handleStartSweep = async () => {
    if (tokenAction !== "dex_buy" && !validRecipient) {
      toast(isEvmChain ? "Please enter a valid EVM recipient address (0x...)" : "Please enter a valid Solana Base58 recipient address", "error");
      return;
    }
    if (!sessionToken) {
      toast("Vault is locked. Please unlock your vault before sweeping.", "error");
      return;
    }
    if (sweepableWallets.length === 0) {
      toast("No eligible wallets found for this operation (balances are insufficient for gas or buy amount)", "error");
      return;
    }

    const isDexSell = chainKey === "sol" && assetMode === "token" && tokenAction === "dex_sell";
    const isDexBuy = chainKey === "sol" && assetMode === "token" && tokenAction === "dex_buy";
    const confirmSweep = window.confirm(
      isDexSell
        ? `⚡ CONFIRM STEALTH DEX LIQUIDATION (ZERO-SOL SELL)\n\n` +
          `Token: ${activeTokenInfo?.symbol || "SPL Token"} (Mint: ${shortAddr(activeTokenMint)})\n` +
          `Wallets to Liquidate: ${sweepableWallets.length}\n` +
          `Est. Total Yield: ${totalNetFormatted}\n` +
          `Slippage: ${(slippageBps / 100).toFixed(1)}%\n` +
          `Gas Sponsor: ${feePayerWalletId ? "Single-Funder Active (Fee Payer covers gas)" : "Self-Funded"}\n` +
          `Direct Recipient Address (Proceeds go 100% here):\n${recipient.trim()}\n\n` +
          `Sub-wallets do NOT need SOL and will NOT receive SOL. The entire SOL yield is delivered straight to the Recipient Address above.\n\n` +
          `Proceed with DEX swap broadcast?`
        : isDexBuy
        ? (buyFundingMode === "master"
          ? `👑 CONFIRM MASTER-FUNDED BATCH BUY (SUB-WALLETS 0 SOL)\n\n` +
            `Master Funding Wallet: ${selectedMasterWallet?.label || `Wallet #${selectedMasterWallet?.id || 1}`} (${shortAddr(selectedMasterWallet?.address || "")}) (Balance: ${selectedMasterWallet?.solFormatted || "0 SOL"})\n` +
            `Token to Buy: ${activeTokenInfo?.symbol || "SPL Token"} (Mint: ${shortAddr(activeTokenMint)})\n` +
            `Recipient Sub-Wallets: ${sweepableWallets.length}\n` +
            `Buy Amount per Wallet: ${buyAmountSol} SOL\n` +
            `Total SOL to Spend: ${(parseFloat(buyAmountSol) * sweepableWallets.length).toFixed(3)} SOL\n` +
            `Est. Total Output: ${totalNetFormatted}\n` +
            `Slippage: ${(slippageBps / 100).toFixed(1)}%\n\n` +
            `Dompet Master akan memotong modal SOL dan gas fee. Sub-wallets menerima token langsung di akun ATA masing-masing tanpa perlu isi SOL sama sekali.\n\n` +
            `Lanjutkan pembelian via Jupiter?`
          : `🛒 CONFIRM DISTRIBUTED BATCH BUY (TIAP DOMPET SENDIRI)\n\n` +
            `Token to Buy: ${activeTokenInfo?.symbol || "SPL Token"} (Mint: ${shortAddr(activeTokenMint)})\n` +
            `Wallets Participating: ${sweepableWallets.length}\n` +
            `Buy Amount per Wallet: ${buyAmountSol} SOL\n` +
            `Est. Total Output: ${totalNetFormatted}\n` +
            `Slippage: ${(slippageBps / 100).toFixed(1)}%\n` +
            `Gas Sponsor: ${feePayerWalletId ? "Single-Funder Active" : "Self-Funded"}\n\n` +
            `Masing-masing dompet akan memotong saldo ${buyAmountSol} SOL miliknya sendiri untuk swap via Jupiter DEX.\n\n` +
            `Lanjutkan pembelian terdistribusi?`)
        : `⚠️ CONFIRM FUNDS SWEEP (BLOCKCHAIN BROADCAST)\n\n` +
          `Network: ${activeChain.name} (${chainKey === "sol" && assetMode === "token" ? `Token: ${activeTokenInfo?.symbol || "SPL Token"}` : activeChain.symbol})\n` +
          `Target Wallets: ${sweepableWallets.length}\n` +
          `Asset: ${chainKey === "sol" && assetMode === "token" ? `${activeTokenInfo?.symbol || "SPL Token"} (Mint: ${shortAddr(activeTokenMint)})` : `Native ${activeChain.symbol}`}\n` +
          (chainKey === "sol" ? `Gas Sponsor: ${feePayerWalletId ? "Single-Funder Active (Fee Payer covers gas)" : "Self-Funded"}\n` : "") +
          `Recipient Address:\n${recipient.trim()}\n\n` +
          `Are you sure you want to broadcast these sweep transactions? Transactions broadcast to blockchain networks cannot be reversed.`
    );
    if (!confirmSweep) {
      toast("Operation canceled", "info");
      return;
    }

    setSweeping(true);
    const results: Record<number, SweepTxResult> = {};
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < sweepableWallets.length; i++) {
      const w = sweepableWallets[i];
      const fromAddr = getWalletTargetAddr(w, isEvmChain);

      if (chainKey === "sol" && assetMode === "token") {
        const tok = w.tokens?.find((t) => t.chain?.toLowerCase() === "sol" && t.contractAddress === activeTokenMint);
        const tokenSym = tok?.symbol || activeTokenInfo?.symbol || "TOKEN";

        let res: SweepTxResult;

        if (tokenAction === "dex_sell") {
          setSweepProgress({
            current: i + 1,
            total: sweepableWallets.length,
            msg: `Stealth DEX liquidating ${tokenSym} to SOL -> ${shortAddr(recipient.trim())}...`,
          });

          const feePayerAddr = feePayerWalletId
            ? wallets.find((x) => x.id === feePayerWalletId)?.solAddress || fromAddr
            : fromAddr;

          res = await executeTokenDexSellSingle(
            w.id,
            sessionToken,
            feePayerWalletId ?? undefined,
            feePayerAddr,
            recipient.trim(),
            fromAddr,
            {
              mint: activeTokenMint,
              symbol: tokenSym,
              name: tok?.name || activeTokenInfo?.name || "SPL Token",
              decimals: activeTokenInfo?.decimals ?? 9,
              programId: activeTokenInfo?.programId,
              rawBalance: tok?.rawBalance || "0",
              balanceFormatted: tok?.balance || `0 ${tokenSym}`,
            },
            slippageBps
          );
        } else if (tokenAction === "dex_buy") {
          if (buyFundingMode === "master") {
            const masterWallet = selectedMasterWallet;
            if (!masterWallet) {
              toast("No Master Wallet with SOL found to fund purchases", "error");
              setSweeping(false);
              setSweepProgress(null);
              return;
            }

            setSweepProgress({
              current: i + 1,
              total: sweepableWallets.length,
              msg: `Master funding ${buyAmountSol} SOL purchase of ${tokenSym} for wallet ${shortAddr(fromAddr)}...`,
            });

            res = await executeMasterDexBuySingle(
              masterWallet.id,
              sessionToken,
              masterWallet.address,
              fromAddr,
              {
                mint: activeTokenMint,
                symbol: tokenSym,
                decimals: activeTokenInfo?.decimals ?? 6,
                programId: activeTokenInfo?.programId,
              },
              parseFloat(buyAmountSol) || 0.05,
              slippageBps
            );
          } else {
            setSweepProgress({
              current: i + 1,
              total: sweepableWallets.length,
              msg: `Buying ${tokenSym} with ${buyAmountSol} SOL on wallet ${shortAddr(fromAddr)}...`,
            });

            const feePayerAddr = feePayerWalletId
              ? wallets.find((x) => x.id === feePayerWalletId)?.solAddress || fromAddr
              : fromAddr;

            res = await executeTokenDexBuySingle(
              w.id,
              sessionToken,
              feePayerWalletId ?? undefined,
              feePayerAddr,
              fromAddr,
              {
                mint: activeTokenMint,
                symbol: tokenSym,
                decimals: activeTokenInfo?.decimals ?? 6,
              },
              parseFloat(buyAmountSol) || 0.05,
              recipient.trim() || undefined,
              slippageBps
            );
          }
        } else {
          setSweepProgress({
            current: i + 1,
            total: sweepableWallets.length,
            msg: `Sweeping ${tokenSym} from wallet ${shortAddr(fromAddr)}...`,
          });

          res = await executeTokenSweepSingle(
            w.id,
            sessionToken,
            feePayerWalletId ?? undefined,
            recipient.trim(),
            fromAddr,
            {
              mint: activeTokenMint,
              symbol: tokenSym,
              name: tok?.name || activeTokenInfo?.name || "SPL Token",
              decimals: activeTokenInfo?.decimals ?? 9,
              programId: activeTokenInfo?.programId,
              rawBalance: tok?.rawBalance || "0",
              balanceFormatted: tok?.balance || `0 ${tokenSym}`,
            }
          );
        }

        results[w.id] = res;
        if (res.success) {
          successCount++;
          if (tokenAction === "dex_buy") {
            logActivity({
              type: "trade",
              title: `DEX Bought ${tokenSym}`,
              desc: buyFundingMode === "master"
                ? `Bought with ${buyAmountSol} SOL for wallet ${shortAddr(fromAddr)} (Funded by Master ${shortAddr(selectedMasterWallet?.address || "")} 👑)`
                : `Purchased with ${buyAmountSol} SOL on wallet ${shortAddr(fromAddr)} ${feePayerWalletId && feePayerWalletId !== w.id ? "(Gas Sponsored)" : ""}`,
              amount: res.amountSent,
              amountColor: "var(--ok)",
              status: "success",
              chain: "sol",
              txHash: res.txHash,
              explorerUrl: res.explorerUrl,
              sender: fromAddr,
            });
          } else {
            optimisticClearSweptWalletBalance(w.id, "sol", activeTokenMint, tokenSym);
            setEstimates((prev) => {
              const next = { ...prev };
              delete next[w.id];
              return next;
            });
            logActivity({
              type: "sweep",
              title: tokenAction === "dex_sell" ? `Stealth DEX Liquidated ${tokenSym} to SOL` : `Swept ${tokenSym} to Cold Storage`,
              desc: tokenAction === "dex_sell"
                ? `Sold on DEX with 0 SOL on sender; proceeds delivered direct to ${shortAddr(recipient.trim())} ${feePayerWalletId && feePayerWalletId !== w.id ? "(Gas Sponsored)" : ""}`
                : `Transferred from ${shortAddr(fromAddr)} to ${shortAddr(recipient.trim())} ${feePayerWalletId && feePayerWalletId !== w.id ? "(Gas Sponsored)" : ""}`,
              amount: res.amountSent,
              amountColor: "var(--ok)",
              status: "success",
              chain: "sol",
              txHash: res.txHash,
              explorerUrl: res.explorerUrl,
              recipient: recipient.trim(),
              sender: fromAddr,
            });
          }
        } else {
          failCount++;
          logActivity({
            type: tokenAction === "dex_buy" ? "trade" : "sweep",
            title: tokenAction === "dex_buy" ? `DEX Buy Failed (${tokenSym})` : tokenAction === "dex_sell" ? `DEX Liquidation Failed (${tokenSym})` : `Sweep Failed (${tokenSym})`,
            desc: res.error || `Broadcast failed for ${shortAddr(fromAddr)}`,
            amount: "Failed",
            amountColor: "var(--danger)",
            status: "failed",
            chain: "sol",
            recipient: recipient.trim(),
            sender: fromAddr,
          });
        }
      } else {
        setSweepProgress({
          current: i + 1,
          total: sweepableWallets.length,
          msg: `Broadcasting from wallet ${shortAddr(fromAddr)}...`,
        });

        const res = await executeSweepSingle(
          w.id,
          sessionToken,
          chainKey,
          recipient.trim(),
          gasPriceGwei,
          fromAddr,
          chainKey === "sol" ? (feePayerWalletId ?? undefined) : undefined
        );

        results[w.id] = res;
        if (res.success) {
          successCount++;
          optimisticClearSweptWalletBalance(w.id, chainKey, undefined, activeChain.symbol);
          setEstimates((prev) => {
            const next = { ...prev };
            delete next[w.id];
            return next;
          });
          logActivity({
            type: "sweep",
            title: `Swept ${activeChain.symbol} to Cold Storage`,
            desc: `Transferred from ${shortAddr(fromAddr)} to ${shortAddr(recipient.trim())} ${chainKey === "sol" && feePayerWalletId && feePayerWalletId !== w.id ? "(Gas Sponsored)" : ""}`,
            amount: res.amountSent ? `${res.amountSent} ${activeChain.symbol}` : undefined,
            amountColor: "var(--ok)",
            status: "success",
            chain: chainKey,
            txHash: res.txHash,
            explorerUrl: res.explorerUrl,
            recipient: recipient.trim(),
            sender: fromAddr,
          });
        } else {
          failCount++;
          logActivity({
            type: "sweep",
            title: `Sweep Failed (${activeChain.symbol})`,
            desc: res.error || `Broadcast failed for ${shortAddr(fromAddr)}`,
            amount: "Failed",
            amountColor: "var(--danger)",
            status: "failed",
            chain: chainKey,
            recipient: recipient.trim(),
            sender: fromAddr,
          });
        }
      }
      setTxResults({ ...results });
    }

    setSweeping(false);
    setSweepProgress(null);

    if (successCount > 0) {
      toast(
        tokenAction === "dex_buy"
          ? `Successfully purchased ${activeTokenInfo?.symbol || "tokens"} across ${successCount} wallets!`
          : `Successfully swept funds from ${successCount} wallets!`,
        "success"
      );
      // Delayed background re-scan to guarantee on-chain block settlement
      setTimeout(() => {
        scanAll();
      }, 2500);
    }
    if (failCount > 0) {
      const firstErr = Object.values(results).find(r => !r.success)?.error || "Transaction broadcast failed";
      toast(`Broadcast failed: ${firstErr.slice(0, 90)}`, "error");
    }
  };

  return (
    <div className="sweeper-workspace-panel">
      {/* 1. Header Banner */}
      <div className="sweeper-hero-header">
        <div className="sweeper-title-wrap">
          <div className="sweeper-badge">VAULT CONSOLIDATION ENGINE</div>
          <h2>Fund Sweeper</h2>
          <p>Consolidate native liquid balances (BNB, ETH, SOL) from multiple sub-wallets directly into your designated master cold storage address.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className={`btn ${showWinRate ? "btn-primary" : "btn-secondary"} btn-sm`}
            onClick={() => setShowWinRate(!showWinRate)}
            style={{ fontSize: "11px", gap: "5px" }}
          >
            <IconTrendingUp size={13} />
            <span>{showWinRate ? "Hide Win Rate" : "Win Rate Tracker"}</span>
          </button>
          {onBack && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
              <IconArrowLeft size={13} /> Back to Portfolio
            </button>
          )}
        </div>
      </div>

      {/* Binance Web3 Style Win Rate Metric Deck */}
      {showWinRate && (
        <div style={{ marginBottom: "16px" }}>
          <WinRateCard />
        </div>
      )}

      {/* 2. Step 1: Configuration Form */}
      <div className="sweeper-control-deck">
        {/* Row 1: Network Selection Bar */}
        <div className="sweeper-network-row">
          <span className="network-row-label">1. SELECT BLOCKCHAIN NETWORK:</span>
          <div className="network-pills-wrap">
            <button
              type="button"
              className="network-pill-btn network-pill-coming-soon"
              data-tooltip="Bitcoin UTXO Sweeper · Coming Soon"
              data-tooltip-pos="bottom"
              title="Bitcoin UTXO Sweeper · Coming Soon"
              disabled
            >
              <ChainIcon chain="btc" size={16} />
              <span className="net-pill-name">Bitcoin</span>
              <span className="net-pill-badge mono net-pill-badge-soon">SOON</span>
            </button>
            {Object.values(SWEEP_CHAINS).map((c) => (
              <button
                key={c.key}
                type="button"
                className={`network-pill-btn ${chainKey === c.key ? "active" : ""}`}
                onClick={() => setChainKey(c.key)}
              >
                <ChainIcon chain={c.key} size={16} />
                <span className="net-pill-name">{c.name.split(" ")[0]}</span>
                <span className="net-pill-badge mono">{c.symbol}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Row 1b: Solana Asset Selector & SPL Token Picker */}
        {chainKey === "sol" && (
          <div className="sweeper-network-row" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.06))" }}>
            <span className="network-row-label">ASSET TO SWEEP:</span>
            <div className="network-pills-wrap" style={{ flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className={`network-pill-btn ${assetMode === "native" ? "active" : ""}`}
                onClick={() => setAssetMode("native")}
              >
                <ChainIcon chain="sol" size={16} />
                <span className="net-pill-name">Native SOL</span>
                <span className="net-pill-badge mono">SOL</span>
              </button>
              <button
                type="button"
                className={`network-pill-btn ${assetMode === "token" ? "active" : ""}`}
                onClick={() => {
                  setAssetMode("token");
                  if (!selectedTokenMint && discoveredSolTokens.length > 0) {
                    setSelectedTokenMint(discoveredSolTokens[0].mint);
                  }
                }}
              >
                <span style={{ color: "var(--accent)", display: "inline-flex" }}><IconZap size={15} /></span>
                <span className="net-pill-name">SPL Token / Meme</span>
                <span className="net-pill-badge mono" style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}>
                  {discoveredSolTokens.length} Tokens Found
                </span>
              </button>

              {assetMode === "token" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
                  {activeTokenInfo && (
                    <TokenIcon
                      chain="sol"
                      symbol={activeTokenInfo.symbol}
                      contractAddress={activeTokenInfo.mint}
                      name={activeTokenInfo.name}
                      logoUrl={activeTokenInfo.logoUrl}
                      size={20}
                    />
                  )}
                  <select
                    className="deck-input-field mono"
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      borderRadius: 6,
                      background: "var(--bg-card, #131722)",
                      border: "1px solid var(--border, #2a2e39)",
                      color: "var(--fg, #fff)",
                      cursor: "pointer",
                      minWidth: 200,
                    }}
                    value={selectedTokenMint}
                    onChange={(e) => setSelectedTokenMint(e.target.value)}
                  >
                    {discoveredSolTokens.map((t) => (
                      <option key={t.mint} value={t.mint}>
                        {t.symbol} — {t.name} ({t.count} wallet{t.count > 1 ? "s" : ""})
                      </option>
                    ))}
                    <option value="custom">🔍 + Custom Mint Address...</option>
                  </select>

                  {selectedTokenMint === "custom" && (
                    <input
                      type="text"
                      className="deck-input-field mono"
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        borderRadius: 6,
                        background: "var(--bg-card, #131722)",
                        border: "1px solid var(--border, #2a2e39)",
                        color: "var(--fg, #fff)",
                        width: 280,
                      }}
                      placeholder="Paste SPL Token Mint (Base58)..."
                      value={customMintInput}
                      onChange={(e) => setCustomMintInput(e.target.value)}
                    />
                  )}
                </div>
              )}

              {assetMode === "token" && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, width: "100%", flexWrap: "wrap", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Action Mode:</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={`network-pill-btn ${tokenAction === "transfer" ? "active" : ""}`}
                      onClick={() => setTokenAction("transfer")}
                      style={{ padding: "4px 10px", fontSize: "11px", height: "auto" }}
                    >
                      📦 Transfer Token Saja
                    </button>
                    <button
                      type="button"
                      className={`network-pill-btn ${tokenAction === "dex_sell" ? "active" : ""}`}
                      onClick={() => setTokenAction("dex_sell")}
                      style={{
                        padding: "4px 12px",
                        fontSize: "11px",
                        height: "auto",
                        background: tokenAction === "dex_sell" ? "rgba(16,185,129,0.2)" : undefined,
                        borderColor: tokenAction === "dex_sell" ? "#10b981" : undefined,
                        color: tokenAction === "dex_sell" ? "#34d399" : undefined,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <IconZap size={13} /> Stealth DEX Sell (Jual Jadi SOL)
                    </button>
                    <button
                      type="button"
                      className={`network-pill-btn ${tokenAction === "dex_buy" ? "active" : ""}`}
                      onClick={() => setTokenAction("dex_buy")}
                      style={{
                        padding: "4px 12px",
                        fontSize: "11px",
                        height: "auto",
                        background: tokenAction === "dex_buy" ? "rgba(59,130,246,0.25)" : undefined,
                        borderColor: tokenAction === "dex_buy" ? "#3b82f6" : undefined,
                        color: tokenAction === "dex_buy" ? "#60a5fa" : undefined,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <span style={{ fontSize: "12px" }}>🛒</span> Batch DEX Buy (Beli Pakai SOL Tiap Dompet)
                    </button>
                  </div>

                  {(tokenAction === "dex_sell" || tokenAction === "dex_buy") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexWrap: "wrap" }}>
                      {tokenAction === "dex_buy" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>SOL per Wallet:</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.001"
                            className="deck-input-field mono"
                            style={{
                              padding: "3px 8px",
                              fontSize: "11px",
                              borderRadius: 4,
                              background: "var(--bg-card, #131722)",
                              border: "1px solid var(--border, #2a2e39)",
                              color: "var(--fg, #fff)",
                              width: 70,
                            }}
                            value={buyAmountSol}
                            onChange={(e) => setBuyAmountSol(e.target.value)}
                          />
                          <div style={{ display: "flex", gap: 3 }}>
                            {["0.01", "0.05", "0.1", "0.5"].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                style={{
                                  padding: "2px 6px",
                                  fontSize: "10px",
                                  borderRadius: 3,
                                  background: buyAmountSol === preset ? "#3b82f6" : "rgba(255,255,255,0.08)",
                                  color: buyAmountSol === preset ? "#fff" : "var(--muted)",
                                  border: "none",
                                  cursor: "pointer",
                                }}
                                onClick={() => setBuyAmountSol(preset)}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Slippage:</span>
                        <select
                          className="deck-input-field mono"
                          value={slippageBps}
                          onChange={(e) => setSlippageBps(Number(e.target.value))}
                          style={{
                            padding: "3px 8px",
                            fontSize: "11px",
                            borderRadius: 4,
                            background: "var(--bg-card, #131722)",
                            border: "1px solid var(--border, #2a2e39)",
                            color: "var(--fg, #fff)",
                            cursor: "pointer",
                          }}
                        >
                          <option value={100}>1.0%</option>
                          <option value={200}>2.0%</option>
                          <option value={250}>2.5% (Recommended)</option>
                          <option value={350}>3.5%</option>
                          <option value={500}>5.0%</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {assetMode === "token" && tokenAction === "dex_buy" && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, width: "100%", flexWrap: "wrap", padding: "8px 12px", background: "rgba(245, 158, 11, 0.05)", borderRadius: "6px", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#fbbf24", textTransform: "uppercase" }}>
                    Sumber Modal Pembelian SOL:
                  </span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={`network-pill-btn ${buyFundingMode === "master" ? "active" : ""}`}
                      onClick={() => setBuyFundingMode("master")}
                      style={{
                        padding: "4px 12px",
                        fontSize: "11px",
                        height: "auto",
                        background: buyFundingMode === "master" ? "rgba(245,158,11,0.25)" : undefined,
                        borderColor: buyFundingMode === "master" ? "#f59e0b" : undefined,
                        color: buyFundingMode === "master" ? "#fbbf24" : undefined,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      👑 1 Dompet Master (Sub-wallet 0 SOL)
                    </button>
                    <button
                      type="button"
                      className={`network-pill-btn ${buyFundingMode === "distributed" ? "active" : ""}`}
                      onClick={() => setBuyFundingMode("distributed")}
                      style={{
                        padding: "4px 12px",
                        fontSize: "11px",
                        height: "auto",
                        background: buyFundingMode === "distributed" ? "rgba(59,130,246,0.25)" : undefined,
                        borderColor: buyFundingMode === "distributed" ? "#3b82f6" : undefined,
                        color: buyFundingMode === "distributed" ? "#60a5fa" : undefined,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      👥 Tiap Dompet Sendiri (Distributed)
                    </button>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", marginLeft: "auto" }}>
                    {buyFundingMode === "master"
                      ? `👑 Dompet Master bayar ${(sweepableWallets.length * (parseFloat(buyAmountSol) || 0.05)).toFixed(3)} SOL untuk ${sweepableWallets.length} dompet. Sub-wallet butuh 0 SOL!`
                      : `👥 Tiap dompet wajib memiliki minimal ${buyAmountSol} SOL untuk modal pembelian mandiri.`}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Row 2: 2-Column Split — Master Recipient (~60%) & Gas Presets (~40%) */}
        <div className="sweeper-inputs-row">
          {/* Recipient Vault Input */}
          <div className="sweeper-deck-col col-recipient">
            <div className="deck-col-header">
              <span className="deck-col-label">
                {tokenAction === "dex_buy" ? "2. DESTINATION WALLET (OPTIONAL)" : "2. MASTER RECIPIENT ADDRESS"}
              </span>
              {tokenAction === "dex_buy" && !recipient ? (
                <span className="deck-val-badge valid" style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", borderColor: "rgba(59,130,246,0.3)" }}>
                  Each Sub-Wallet ATA (Default)
                </span>
              ) : recipient ? (
                <span className={`deck-val-badge ${validRecipient ? "valid" : "invalid"}`}>
                  {validRecipient ? (isEvmChain ? "Valid EVM Address" : "Valid Solana Address") : (isEvmChain ? "Invalid 0x Address" : "Invalid Solana Address")}
                </span>
              ) : (
                <span className="deck-hint">Consolidation recipient vault</span>
              )}
            </div>
            <div className="deck-input-wrap">
              <input
                type="text"
                className="deck-input-field mono"
                placeholder={
                  tokenAction === "dex_buy"
                    ? "Leave blank to keep tokens in each sub-wallet, or paste custom recipient address"
                    : isEvmChain
                    ? "Paste recipient 0x address (e.g. from Binance, OKX, Ledger, Safe)"
                    : "Paste recipient Solana address (e.g. from Phantom, Backpack, Binance)"
                }
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={sweeping}
              />
              {recipient && (
                <button
                  type="button"
                  className="deck-clear-btn"
                  onClick={() => setRecipient("")}
                  data-tooltip="Clear recipient address"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Gas Engine Speed Presets */}
          {isEvmChain ? (
            <div className="sweeper-deck-col col-gas">
              <div className="deck-col-header">
                <span className="deck-col-label">3. GAS ENGINE SPEED ({gasPriceGwei.toFixed(2)} GWEI)</span>
                <span className="deck-gas-live mono">
                  <span className="live-dot" /> Live: {liveFeeGwei.toFixed(2)} Gwei
                </span>
              </div>
              <div className="gas-segmented-bar">
                <button
                  type="button"
                  className={`gas-seg-btn ${gasMode === "standard" ? "active" : ""}`}
                  onClick={() => {
                    setGasMode("standard");
                    setGasPriceGwei(Number(liveFeeGwei.toFixed(2)));
                  }}
                  disabled={sweeping}
                  data-tooltip={`Standard network gas (${liveFeeGwei.toFixed(2)} Gwei)`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  className={`gas-seg-btn ${gasMode === "fast" ? "active" : ""}`}
                  onClick={() => {
                    setGasMode("fast");
                    setGasPriceGwei(Number((liveFeeGwei * 1.25).toFixed(2)));
                  }}
                  disabled={sweeping}
                  data-tooltip={`Fast priority gas (${(liveFeeGwei * 1.25).toFixed(2)} Gwei)`}
                >
                  Fast <IconZap size={11} />
                </button>
                <button
                  type="button"
                  className={`gas-seg-btn ${gasMode === "turbo" ? "active" : ""}`}
                  onClick={() => {
                    setGasMode("turbo");
                    setGasPriceGwei(Number((liveFeeGwei * 2.0).toFixed(2)));
                  }}
                  disabled={sweeping}
                  data-tooltip={`Turbo priority gas (${(liveFeeGwei * 2.0).toFixed(2)} Gwei)`}
                >
                  Turbo <IconRocket size={11} />
                </button>
                {gasMode === "custom" ? (
                  <div className="gas-custom-inline">
                    <input
                      type="number"
                      step="0.05"
                      min="0.001"
                      className="gas-custom-num mono"
                      value={customGwei}
                      onChange={(e) => {
                        setCustomGwei(e.target.value);
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val) && val > 0) {
                          setGasPriceGwei(val);
                        }
                      }}
                      autoFocus
                      placeholder="Gwei"
                    />
                    <span className="gas-custom-lbl">G</span>
                    <div className="gas-stepper-arrows">
                      <button
                        type="button"
                        className="gas-arrow-btn"
                        onClick={() => {
                          const curr = parseFloat(customGwei) || 1;
                          const next = Number((curr + 0.1).toFixed(2));
                          setCustomGwei(String(next));
                          setGasPriceGwei(next);
                        }}
                        data-tooltip="Increase Gas (+0.1 Gwei)"
                      >
                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 15l-6-6-6 6"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="gas-arrow-btn"
                        onClick={() => {
                          const curr = parseFloat(customGwei) || 1;
                          const next = Math.max(0.01, Number((curr - 0.1).toFixed(2)));
                          setCustomGwei(String(next));
                          setGasPriceGwei(next);
                        }}
                        data-tooltip="Decrease Gas (-0.1 Gwei)"
                      >
                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="gas-seg-btn"
                    onClick={() => {
                      setGasMode("custom");
                      const parsed = parseFloat(customGwei);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        setGasPriceGwei(parsed);
                      }
                    }}
                    disabled={sweeping}
                    data-tooltip="Enter custom Gwei manually"
                  >
                    Custom <IconEdit3 size={11} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="sweeper-deck-col col-gas">
              <div className="deck-col-header">
                <span className="deck-col-label">
                  {tokenAction === "dex_buy" && buyFundingMode === "master"
                    ? "3. MASTER FUNDING WALLET (SOL MODAL & GAS)"
                    : "3. GAS FEE SPONSOR (FEE PAYER)"}
                </span>
                <span className="deck-gas-live mono" style={{ color: tokenAction === "dex_buy" && buyFundingMode === "master" ? "#fbbf24" : "var(--ok)" }}>
                  {tokenAction === "dex_buy" && buyFundingMode === "master"
                    ? "👑 1-Wallet Funder Active"
                    : feePayerWalletId
                    ? "Single-Funder Active"
                    : "Self-Funded"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <select
                  className="deck-input-field mono"
                  style={{
                    padding: "7px 10px",
                    fontSize: "12px",
                    background: "var(--bg-card, #131722)",
                    border: "1px solid var(--border, #2a2e39)",
                    borderRadius: 6,
                    color: "var(--fg, #fff)",
                    width: "100%",
                    cursor: "pointer",
                  }}
                  value={feePayerWalletId ?? selectedMasterWallet?.id ?? "self"}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFeePayerWalletId(val === "self" ? null : parseInt(val, 10));
                  }}
                  disabled={sweeping}
                >
                  {solCandidateFeePayers.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      Wallet #{i + 1} ({shortAddr(c.address)}) — {c.solFormatted} {i === 0 && c.solBalance >= 0.001 ? "★ Primary Master Funder" : ""}
                    </option>
                  ))}
                  {!(tokenAction === "dex_buy" && buyFundingMode === "master") && (
                    <option value="self">Self (Each sub-wallet pays its own gas / buy amount)</option>
                  )}
                </select>
                <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                  {tokenAction === "dex_buy" && buyFundingMode === "master" ? (
                    <span style={{ color: "#fbbf24", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      👑 <b>Mode 1 Dompet Master:</b> Dompet terpilih ({shortAddr(selectedMasterWallet?.address || "")}) menanggung modal {buyAmountSol} SOL per wallet (total: {(sweepableWallets.length * (parseFloat(buyAmountSol) || 0.05)).toFixed(3)} SOL) + gas. <b>Sub-wallets bebas 0 SOL!</b>
                    </span>
                  ) : feePayerWalletId ? (
                    <span style={{ color: "#34d399", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      ✓ <b>Zero-SOL {tokenAction === "dex_sell" ? "Liquidator" : "Sweeper"}:</b> Sub-wallets need <b>0 SOL</b>! {tokenAction === "dex_sell" ? "Selected wallet sponsors gas fee; 100% of SOL proceeds go straight to Master Recipient." : "Selected wallet sponsors all gas & ATA creation fees."}
                    </span>
                  ) : solCandidateFeePayers.length === 0 ? (
                    <span style={{ color: "#fbbf24", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      ⚠️ <b>Perhatian:</b> Tidak ditemukan dompet bersaldo SOL. Impor/isi minimal 1 dompet dengan SOL sebagai Gas Sponsor / Master Funder.
                    </span>
                  ) : (
                    <span>⚠️ <b>Self-Funded Mode:</b> Sub-wallets must individually hold at least {tokenAction === "dex_buy" ? `${buyAmountSol} SOL` : "0.000005 SOL for gas"}.</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Step 2: Target Wallets Matrix */}
      <div className="sweeper-wallets-section">
        <div className="sweeper-section-header">
          <div className="section-title-box">
            <h4>FUNDED TARGET WALLETS ({targetWallets.length})</h4>
            <span className="section-sub">
              {loadingEstimates
                ? "Calculating realtime gas & net proceeds…"
                : `${sweepableWallets.length} of ${targetWallets.length} wallets ready to ${tokenAction === "dex_sell" && chainKey === "sol" && assetMode === "token" ? "liquidate" : "sweep"}`}
            </span>
          </div>
        </div>

        {targetWallets.length === 0 ? (
          <div className="sweeper-empty-notice">
            <span className="notice-icon"><IconArrowLeft size={16} /></span>
            <div className="empty-notice-text">
              <strong>No Wallets Selected for Sweeper</strong>
              <p>
                Please check/select the wallets you want to sweep from the <b>Wallets Directory</b>, or{" "}
                <button type="button" className="btn-inline-link" onClick={() => selectAllFunded(isEvmChain ? "evm" : "sol")}>
                  Select All Funded {isEvmChain ? "EVM" : "Solana"} Wallets ({activeFamilyFundedCount})
                </button>
              </p>
            </div>
          </div>
        ) : (
          <div className="sweeper-table-wrap scrollable">
            <table className="sweeper-table">
              <thead>
                <tr>
                  <th style={{ width: 54, textAlign: "center" }}>#</th>
                  <th>Wallet Address</th>
                  <th>{tokenAction === "dex_buy" ? "SOL Balance" : "Gross Balance"}</th>
                  <th>Estimated Gas</th>
                  <th>
                    {chainKey === "sol" && assetMode === "token" && tokenAction === "dex_sell"
                      ? "Est. Net SOL to Master"
                      : chainKey === "sol" && assetMode === "token" && tokenAction === "dex_buy"
                      ? `Est. ${activeTokenInfo?.symbol || "Tokens"} Received`
                      : "Net Yield to Master"}
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {targetWallets.map((w, idx) => {
                  const est = estimates[w.id];
                  const res = txResults[w.id];

                  return (
                    <tr
                      key={w.id}
                      className={`sweeper-row ${est?.isSweepable ? "sweepable" : "zero"}`}
                    >
                      <td style={{ width: 54, textAlign: "center" }} className="mono text-muted">
                        #{String(idx + 1).padStart(2, "0")}
                      </td>
                      <td>
                        <span className="wallet-addr mono">{getWalletTargetAddr(w, isEvmChain) ? shortAddr(getWalletTargetAddr(w, isEvmChain)) : "invalid"}</span>
                      </td>
                      <td className="mono">
                        {res?.success ? (
                          <span style={{ color: "#34d399" }}>{tokenAction === "dex_buy" ? "Bought ✓" : "0 (Sold ✓)"}</span>
                        ) : est ? (
                          formatCompactBalance(est.balanceFormatted)
                        ) : (
                          "…"
                        )}
                      </td>
                      <td className="mono text-muted">{est ? formatCompactBalance(est.feeFormatted) : "…"}</td>
                      <td className="mono bold text-emerald">
                        {res?.success ? (
                          <span style={{ color: "#34d399" }}>
                            +{res.amountSent?.split("→ +")[1] || (tokenAction === "dex_buy" ? `${activeTokenInfo?.symbol || "Tokens"} Received ✓` : "SOL Received ✓")}
                          </span>
                        ) : est ? (
                          est.isSweepable ? (
                            formatCompactBalance(est.netFormatted)
                          ) : tokenAction === "dex_buy" ? (
                            <span style={{ color: "var(--muted)", fontWeight: 400 }}>0 (Needs {buyAmountSol} SOL)</span>
                          ) : (
                            "0 (Dust < Gas)"
                          )
                        ) : (
                          "…"
                        )}
                      </td>
                      <td>
                        {res ? (
                          res.success ? (
                            <span className="status-badge success" data-tooltip={res.txHash}>
                              <IconCheckCircle size={10} />{" "}
                              {tokenAction === "dex_buy" ? "Bought" : tokenAction === "dex_sell" && chainKey === "sol" && assetMode === "token" ? "Liquidated" : "Swept"}
                            </span>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <span className="status-badge error" data-tooltip={res.error} title={res.error}><IconAlertTriangle size={10} /> Failed</span>
                              {res.error && (
                                <span style={{ fontSize: "10px", color: "#f87171", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={res.error}>
                                  {res.error}
                                </span>
                              )}
                            </div>
                          )
                        ) : est?.isSweepable ? (
                          <span
                            className="status-badge ready"
                            style={
                              tokenAction === "dex_buy"
                                ? buyFundingMode === "master"
                                  ? { background: "rgba(245,158,11,0.15)", color: "#fbbf24", borderColor: "rgba(245,158,11,0.3)" }
                                  : { background: "rgba(59,130,246,0.15)", color: "#60a5fa", borderColor: "rgba(59,130,246,0.3)" }
                                : undefined
                            }
                          >
                            {tokenAction === "dex_buy" && buyFundingMode === "master"
                              ? "Ready (Master Funded 👑)"
                              : est.isSponsored
                              ? "Ready to Buy (Sponsored)"
                              : "Ready to Buy"}
                          </span>
                        ) : (
                          <span className="status-badge dust" data-tooltip={est?.statusText}>{est?.statusText || "Insufficient Gas"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Execution Dock */}
      <div className="sweeper-execute-dock">
        <div className="dock-summary">
          <div className="dock-stat">
            <span className="dock-lbl">
              {tokenAction === "dex_buy" ? "Eligible Buyer Wallets:" : tokenAction === "dex_sell" && chainKey === "sol" && assetMode === "token" ? "Liquidatable Wallets:" : "Sweepable Wallets:"}
            </span>
            <span className="dock-val mono text-emerald">{sweepableWallets.length} of {targetWallets.length}</span>
          </div>
          <div className="dock-stat">
            <span className="dock-lbl">
              {tokenAction === "dex_buy" ? `Total Est. ${activeTokenInfo?.symbol || "Tokens"}:` : "Total Net to Master:"}
            </span>
            <span className="dock-val mono bold text-emerald">{totalNetFormatted}</span>
          </div>
        </div>

        <button
          type="button"
          className="btn-start-sweep"
          onClick={handleStartSweep}
          disabled={sweeping || sweepableWallets.length === 0 || !validRecipient}
          style={
            tokenAction === "dex_buy"
              ? buyFundingMode === "master"
                ? {
                    background: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
                    borderColor: "#fbbf24",
                    boxShadow: "0 4px 14px rgba(245, 158, 11, 0.3)",
                  }
                : {
                    background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                    borderColor: "#60a5fa",
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3)",
                  }
              : tokenAction === "dex_sell" && chainKey === "sol" && assetMode === "token"
              ? {
                  background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  borderColor: "#34d399",
                  boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)",
                }
              : undefined
          }
        >
          {sweeping
            ? tokenAction === "dex_buy"
              ? buyFundingMode === "master"
                ? `Master Funding Buys (${sweepProgress?.current || 0}/${sweepProgress?.total || 0})…`
                : `Buying on DEX (${sweepProgress?.current || 0}/${sweepProgress?.total || 0})…`
              : tokenAction === "dex_sell" && chainKey === "sol" && assetMode === "token"
              ? `Liquidating on DEX (${sweepProgress?.current || 0}/${sweepProgress?.total || 0})…`
              : `Sweeping (${sweepProgress?.current || 0}/${sweepProgress?.total || 0})…`
            : tokenAction === "dex_buy"
            ? buyFundingMode === "master"
              ? <><IconZap size={14} /> Execute Master-Funded DEX Buy ({sweepableWallets.length} Wallets)</>
              : <><IconZap size={14} /> Execute Distributed DEX Buy ({sweepableWallets.length} Wallets)</>
            : tokenAction === "dex_sell" && chainKey === "sol" && assetMode === "token"
            ? <><IconZap size={14} /> Execute Stealth DEX Sell ({sweepableWallets.length} Wallets)</>
            : <><IconZap size={14} /> Execute {chainKey === "sol" && assetMode === "token" ? `${activeTokenInfo?.symbol || "Token"} ` : ""}Sweep ({sweepableWallets.length} Wallets)</>}
        </button>
      </div>
    </div>
  );
}
