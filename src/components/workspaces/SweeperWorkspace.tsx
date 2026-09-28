import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import {
  SWEEP_CHAINS,
  estimateTokenWalletSweep,
  estimateWalletSweep,
  executeSweepSingle,
  executeTokenSweepSingle,
  fetchLiveFeeData,
  type SweepTxResult,
  type TokenSweepInfo,
  type WalletSweepEstimate,
} from "../../lib/services/sweeper";
import { logActivity } from "../../lib/services/activity";
import { formatCompactBalance, hasFundsOnEvm, hasFundsOnSol } from "../../lib/chains/chains";
import { shortAddr } from "../../lib/wallets/wallet";
import { formatEther, isEvmAddress, isValidSolAddress } from "../../lib/utils/format";
import type { WalletView } from "../../lib/types/index";
import { ChainIcon, TokenIcon, IconAlertTriangle, IconArrowLeft, IconCheckCircle, IconZap } from "../../icons";

interface DiscoveredSolToken {
  mint: string;
  symbol: string;
  name: string;
  decimals?: number;
  programId?: string;
  logoUrl?: string | null;
  walletCount: number;
}

function getWalletTargetAddress(wallet: WalletView, isEvmChain: boolean): string {
  return (isEvmChain ? wallet.address : wallet.solAddress) ?? "";
}

function getSolanaToken(wallet: WalletView, mint: string) {
  return wallet.tokens?.find((token) =>
    (token.chain?.toLowerCase() === "sol" || token.chain?.toLowerCase() === "solana") &&
    token.contractAddress === mint,
  );
}

function formatRawTokenAmount(rawAmount: bigint, decimals: number): string {
  const safeDecimals = Math.max(0, Math.min(36, Math.trunc(decimals)));
  if (safeDecimals === 0) return rawAmount.toString();
  const divisor = 10n ** BigInt(safeDecimals);
  const whole = rawAmount / divisor;
  const fraction = (rawAmount % divisor)
    .toString()
    .padStart(safeDecimals, "0")
    .slice(0, Math.min(safeDecimals, 6))
    .replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function SweeperWorkspace({ onBack }: { onBack?: () => void }) {
  const {
    wallets,
    selectedSweepIds,
    selectAllFunded,
    sessionToken,
    isAirGapped,
    networkSessionReady,
    refreshWallets,
    optimisticClearSweptWalletBalance,
    toast,
  } = useApp();

  const sessionTokenRef = useRef(sessionToken);
  const isAirGappedRef = useRef(isAirGapped);
  const networkSessionReadyRef = useRef(networkSessionReady);
  sessionTokenRef.current = sessionToken;
  isAirGappedRef.current = isAirGapped;
  networkSessionReadyRef.current = networkSessionReady;

  const [chainKey, setChainKey] = useState("eth");
  const [assetMode, setAssetMode] = useState<"native" | "token">("native");
  const [selectedTokenMint, setSelectedTokenMint] = useState("");
  const [customMintInput, setCustomMintInput] = useState("");
  const [recipient, setRecipient] = useState("");
  const [feePayerWalletId, setFeePayerWalletId] = useState<number | null>(null);
  const [gasPriceGwei, setGasPriceGwei] = useState(1.2);
  const [gasMode, setGasMode] = useState<"standard" | "fast" | "turbo" | "custom">("standard");
  const [customGwei, setCustomGwei] = useState("1.5");
  const [liveFeeGwei, setLiveFeeGwei] = useState(1.2);
  const [feeDataLive, setFeeDataLive] = useState(false);
  const [loadingEstimates, setLoadingEstimates] = useState(false);
  const [estimates, setEstimates] = useState<Record<number, WalletSweepEstimate>>({});
  const [sweeping, setSweeping] = useState(false);
  const [sweepProgress, setSweepProgress] = useState<{ current: number; total: number } | null>(null);
  const [txResults, setTxResults] = useState<Record<number, SweepTxResult>>({});

  const activeChain = SWEEP_CHAINS[chainKey] ?? SWEEP_CHAINS.eth;
  const isEvmChain = chainKey !== "sol";
  const isTokenTransfer = chainKey === "sol" && assetMode === "token";

  const targetWallets = useMemo(() => {
    if (selectedSweepIds.size === 0) return [];
    return wallets.filter((wallet) =>
      selectedSweepIds.has(wallet.id) && Boolean(getWalletTargetAddress(wallet, isEvmChain)),
    );
  }, [wallets, selectedSweepIds, isEvmChain]);

  const activeFamilyFundedCount = useMemo(
    () => wallets.filter((wallet) =>
      isEvmChain
        ? hasFundsOnEvm(wallet.balances, wallet.tokens)
        : hasFundsOnSol(wallet.balances, wallet.tokens),
    ).length,
    [wallets, isEvmChain],
  );

  const discoveredSolTokens = useMemo<DiscoveredSolToken[]>(() => {
    const tokenMap = new Map<string, DiscoveredSolToken>();
    for (const wallet of wallets) {
      for (const token of wallet.tokens ?? []) {
        const mint = token.contractAddress;
        if (!mint || (token.chain?.toLowerCase() !== "sol" && token.chain?.toLowerCase() !== "solana")) continue;
        const existing = tokenMap.get(mint);
        if (existing) {
          existing.walletCount += 1;
          if (!existing.logoUrl && token.logoUrl) existing.logoUrl = token.logoUrl;
          if (existing.decimals === undefined && token.decimals != null) existing.decimals = token.decimals;
        } else {
          tokenMap.set(mint, {
            mint,
            symbol: token.symbol || "TOKEN",
            name: token.name || token.symbol || "Solana token",
            decimals: token.decimals ?? undefined,
            programId: token.tokenProgramId ?? undefined,
            logoUrl: token.logoUrl,
            walletCount: 1,
          });
        }
      }
    }
    return Array.from(tokenMap.values()).sort((a, b) => b.walletCount - a.walletCount);
  }, [wallets]);

  const activeTokenMint = selectedTokenMint === "custom" ? customMintInput.trim() : selectedTokenMint;
  const activeToken = useMemo(() => {
    if (chainKey !== "sol" || assetMode !== "token" || !activeTokenMint || !isValidSolAddress(activeTokenMint)) return null;
    const discovered = discoveredSolTokens.find((token) => token.mint === activeTokenMint);
    if (discovered) return discovered;
    const knownBalance = wallets.map((wallet) => getSolanaToken(wallet, activeTokenMint)).find(Boolean);
    return {
      mint: activeTokenMint,
      symbol: knownBalance?.symbol || "TOKEN",
      name: knownBalance?.name || "Custom Solana token",
      decimals: knownBalance?.decimals ?? undefined,
      programId: knownBalance?.tokenProgramId ?? undefined,
      logoUrl: knownBalance?.logoUrl ?? null,
      walletCount: knownBalance ? 1 : 0,
    };
  }, [chainKey, assetMode, activeTokenMint, discoveredSolTokens, wallets]);

  const solFeePayers = useMemo(() => wallets
    .filter((wallet) => Boolean(wallet.solAddress))
    .map((wallet) => {
      const formatted = wallet.balances?.sol || "0 SOL";
      const balance = Number.parseFloat(formatted.replace(/\s*SOL\s*$/i, "")) || 0;
      return { id: wallet.id, address: wallet.solAddress!, label: wallet.label, balance, formatted };
    })
    .filter((wallet) => wallet.balance > 0)
    .sort((a, b) => b.balance - a.balance), [wallets]);
  const selectedFeePayer = solFeePayers.find((wallet) => wallet.id === feePayerWalletId) ?? null;

  useEffect(() => {
    if (feePayerWalletId !== null && !solFeePayers.some((wallet) => wallet.id === feePayerWalletId)) {
      setFeePayerWalletId(null);
    }
  }, [feePayerWalletId, solFeePayers]);

  useEffect(() => {
    if (chainKey !== "sol") setAssetMode("native");
  }, [chainKey]);

  useEffect(() => {
    if (chainKey !== "sol" || assetMode !== "token" || selectedTokenMint === "custom") return;
    if (discoveredSolTokens.length === 0) {
      if (selectedTokenMint) setSelectedTokenMint("");
      return;
    }
    if (!discoveredSolTokens.some((token) => token.mint === selectedTokenMint)) {
      setSelectedTokenMint(discoveredSolTokens[0].mint);
    }
  }, [chainKey, assetMode, discoveredSolTokens, selectedTokenMint]);

  useEffect(() => {
    setTxResults({});
  }, [chainKey, isTokenTransfer, activeTokenMint, recipient, selectedSweepIds]);

  useEffect(() => {
    if (!sessionToken || !networkSessionReady || isAirGapped || chainKey === "sol") {
      setFeeDataLive(false);
      return;
    }

    let active = true;
    setFeeDataLive(false);
    void fetchLiveFeeData(sessionToken, chainKey)
      .then((data) => {
        if (!active) return;
        setLiveFeeGwei(data.gasPriceGwei);
        setFeeDataLive(true);
        const multiplier = gasMode === "fast" ? 1.25 : gasMode === "turbo" ? 2 : 1;
        if (gasMode !== "custom") setGasPriceGwei(data.gasPriceGwei * multiplier);
      })
      .catch((error) => {
        if (active) setFeeDataLive(false);
        console.warn("Failed to fetch sweep fee data:", error);
      });
    return () => { active = false; };
  }, [chainKey, sessionToken, networkSessionReady, isAirGapped, gasMode]);

  useEffect(() => {
    if (!sessionToken || !networkSessionReady || isAirGapped || targetWallets.length === 0 || (isTokenTransfer && !activeToken)) {
      setEstimates({});
      setLoadingEstimates(false);
      return;
    }

    let active = true;
    setEstimates({});
    setLoadingEstimates(true);

    const loadEstimates = async () => {
      const next: Record<number, WalletSweepEstimate> = {};
      for (const wallet of targetWallets) {
        if (!active) return;
        const address = getWalletTargetAddress(wallet, isEvmChain);
        if (!address) continue;

        const estimate = isTokenTransfer && activeToken
          ? await estimateTokenWalletSweep(
              wallet.id,
              sessionToken,
              address,
              (() => {
                const balance = getSolanaToken(wallet, activeToken.mint);
                return {
                  mint: activeToken.mint,
                  symbol: balance?.symbol || activeToken.symbol,
                  name: balance?.name || activeToken.name,
                  decimals: activeToken.decimals ?? balance?.decimals ?? undefined,
                  programId: activeToken.programId ?? balance?.tokenProgramId ?? undefined,
                  rawBalance: balance?.rawBalance || "0",
                  balanceFormatted: balance?.balance || `0 ${activeToken.symbol}`,
                } satisfies TokenSweepInfo;
              })(),
              feePayerWalletId ?? undefined,
            )
          : await estimateWalletSweep(
              wallet.id,
              sessionToken,
              address,
              chainKey,
              gasPriceGwei,
              chainKey === "sol" ? feePayerWalletId ?? undefined : undefined,
            );

        if (!active) return;
        next[wallet.id] = estimate;
      }
      if (active) {
        setEstimates(next);
        setLoadingEstimates(false);
      }
    };

    void loadEstimates().catch((error) => {
      console.error("Failed to estimate sweep balances:", error);
      if (active) {
        setEstimates({});
        setLoadingEstimates(false);
      }
    });

    return () => { active = false; };
  }, [
    sessionToken,
    networkSessionReady,
    isAirGapped,
    targetWallets,
    isEvmChain,
    isTokenTransfer,
    activeToken,
    chainKey,
    gasPriceGwei,
    feePayerWalletId,
  ]);

  const tokenDecimals = activeToken?.decimals ?? 0;
  const readyWallets = targetWallets.filter((wallet) => estimates[wallet.id]?.isSweepable);
  const validRecipient = isEvmChain
    ? isEvmAddress(recipient.trim())
    : isValidSolAddress(recipient.trim());
  const validCustomGasPrice = customGwei.trim() !== "" && Number.isFinite(Number(customGwei)) && Number(customGwei) > 0;

  const totalToDestination = useMemo(() => {
    const totalRaw = readyWallets.reduce((total, wallet) => total + (estimates[wallet.id]?.netWei ?? 0n), 0n);
    if (isTokenTransfer) {
      return `${formatRawTokenAmount(totalRaw, tokenDecimals)} ${activeToken?.symbol || "TOKEN"}`;
    }
    if (chainKey === "sol") return `${formatRawTokenAmount(totalRaw, 9)} SOL`;
    return `${formatEther(totalRaw, 6)} ${activeChain.symbol}`;
  }, [readyWallets, estimates, isTokenTransfer, tokenDecimals, activeToken, chainKey, activeChain.symbol]);

  const applyGasMode = (mode: "standard" | "fast" | "turbo") => {
    setGasMode(mode);
    const multiplier = mode === "fast" ? 1.25 : mode === "turbo" ? 2 : 1;
    setGasPriceGwei(Number((liveFeeGwei * multiplier).toFixed(3)));
  };

  const handleSweep = async () => {
    if (!sessionToken) {
      toast("Unlock the vault before transferring assets.", "error");
      return;
    }
    if (!networkSessionReady || isAirGapped) {
      toast("Enable Online Mode and wait for the vault network check before transferring.", "error");
      return;
    }
    if (!validRecipient) {
      toast(isEvmChain ? "Enter a valid EVM recipient address." : "Enter a valid Solana recipient address.", "error");
      return;
    }
    if (isEvmChain && gasMode === "custom" && !validCustomGasPrice) {
      toast("Enter a custom gas price greater than zero Gwei.", "error");
      return;
    }
    if (readyWallets.length === 0) {
      toast("No selected wallet is currently eligible to transfer.", "error");
      return;
    }

    const sweepSessionToken = sessionToken;
    const assetLabel = isTokenTransfer ? activeToken?.symbol || "SPL token" : activeChain.symbol;
    const totalMessage = totalToDestination;
    const confirmed = window.confirm(
      `Confirm ${assetLabel} transfer\n\n` +
      `Network: ${activeChain.name}\n` +
      `Source wallets: ${readyWallets.length}\n` +
      `Estimated total to recipient: ${totalMessage}\n` +
      `Recipient: ${recipient.trim()}\n\n` +
      `This sends assets on-chain and cannot be reversed. Continue?`,
    );
    if (!confirmed) return;

    if (
      sessionTokenRef.current !== sweepSessionToken ||
      !networkSessionReadyRef.current ||
      isAirGappedRef.current
    ) {
      toast("The authenticated Online Mode session ended before submission.", "error");
      return;
    }

    setSweeping(true);
    setTxResults({});
    setSweepProgress({ current: 0, total: readyWallets.length });
    const operationResults: Record<number, SweepTxResult> = {};
    let confirmedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let stoppedByGate = false;

    try {
      for (let index = 0; index < readyWallets.length; index += 1) {
        if (
          sessionTokenRef.current !== sweepSessionToken ||
          !networkSessionReadyRef.current ||
          isAirGappedRef.current
        ) {
          stoppedByGate = true;
          break;
        }

        const wallet = readyWallets[index];
        const sender = getWalletTargetAddress(wallet, isEvmChain);
        setSweepProgress({ current: index + 1, total: readyWallets.length });

        let result: SweepTxResult;
        if (isTokenTransfer && activeToken) {
          const walletToken = getSolanaToken(wallet, activeToken.mint);
          if (!walletToken) {
            result = {
              walletId: wallet.id,
              address: sender,
              success: false,
              error: "The selected token balance is no longer present in this wallet.",
            };
          } else {
            const token: TokenSweepInfo = {
              mint: activeToken.mint,
              symbol: walletToken.symbol || activeToken.symbol,
              name: walletToken.name || activeToken.name,
              decimals: activeToken.decimals ?? walletToken.decimals ?? undefined,
              programId: activeToken.programId ?? walletToken.tokenProgramId ?? undefined,
              rawBalance: walletToken.rawBalance || "0",
              balanceFormatted: walletToken.balance || `0 ${activeToken.symbol}`,
            };
            result = await executeTokenSweepSingle(
              wallet.id,
              sweepSessionToken,
              feePayerWalletId ?? undefined,
              recipient.trim(),
              sender,
              token,
            );
          }
        } else {
          result = await executeSweepSingle(
            wallet.id,
            sweepSessionToken,
            chainKey,
            recipient.trim(),
            isEvmChain ? gasPriceGwei : undefined,
            sender,
            chainKey === "sol" ? feePayerWalletId ?? undefined : undefined,
          );
        }

        operationResults[wallet.id] = result;
        setTxResults((previous) => ({ ...previous, [wallet.id]: result }));

        const status = result.success ? "confirmed" : result.pending ? "pending" : "failed";
        if (status === "confirmed") {
          confirmedCount += 1;
          optimisticClearSweptWalletBalance(
            wallet.id,
            chainKey,
            isTokenTransfer ? activeToken?.mint : undefined,
            isTokenTransfer ? activeToken?.symbol : activeChain.symbol,
          );
        } else if (status === "pending") {
          pendingCount += 1;
        } else {
          failedCount += 1;
        }

        logActivity({
          type: "sweep",
          title: status === "confirmed"
            ? `Swept ${assetLabel} to recipient`
            : status === "pending"
              ? `${assetLabel} transfer pending`
              : `${assetLabel} transfer failed`,
          desc: status === "confirmed"
            ? `Transferred from ${shortAddr(sender)} to ${shortAddr(recipient.trim())}.`
            : result.error || `Transfer submitted from ${shortAddr(sender)}.`,
          amount: result.amountSent || (status === "failed" ? "Failed" : undefined),
          amountColor: status === "confirmed" ? "var(--ok)" : status === "pending" ? "var(--warning)" : "var(--danger)",
          status: status === "confirmed" ? "success" : status === "pending" ? "warning" : "failed",
          chain: chainKey,
          txHash: result.txHash,
          explorerUrl: result.explorerUrl,
          sender,
          recipient: recipient.trim(),
          metadata: { walletId: wallet.id, confirmationStatus: result.confirmationStatus || status },
        });
      }
    } catch (error) {
      console.error("Sweeper operation stopped unexpectedly:", error);
      toast(`Transfer stopped: ${String(error)}`, "error");
    } finally {
      setSweeping(false);
      setSweepProgress(null);
    }

    if (stoppedByGate) {
      toast("Transfer paused because the vault session or Online Mode ended.", "info");
    }

    setTxResults((previous) => ({ ...previous, ...operationResults }));
    if (confirmedCount > 0 || pendingCount > 0) {
      toast(
        `${confirmedCount} confirmed · ${pendingCount} pending · ${failedCount} failed`,
        pendingCount > 0 || failedCount > 0 ? "info" : "success",
      );
      const refreshTargets = new Map<number, WalletView>();
      for (const wallet of readyWallets) {
        if (operationResults[wallet.id]?.success || operationResults[wallet.id]?.pending) refreshTargets.set(wallet.id, wallet);
      }
      if (chainKey === "sol" && feePayerWalletId !== null) {
        const payer = wallets.find((wallet) => wallet.id === feePayerWalletId);
        if (payer) refreshTargets.set(payer.id, payer);
      }
      window.setTimeout(() => {
        void refreshWallets(Array.from(refreshTargets.values()), chainKey);
      }, 2500);
    } else if (failedCount > 0) {
      const firstError = Object.values(operationResults).find((result) => !result.success && !result.pending)?.error;
      toast(`No transfer confirmed: ${(firstError || "Check the wallet rows for details.").slice(0, 110)}`, "error");
    }
  };

  return (
    <div className="sweeper-workspace-panel sweep-page">
      <header className="sweep-page-header">
        <div className="sweep-page-heading">
          <div className="sweep-eyebrow"><IconZap size={13} /> MULTI-WALLET TRANSFER</div>
          <div className="sweep-title-row">
            <div>
              <h2>Smart Sweeper</h2>
              <p>Transfer native assets or Solana tokens to one recipient. DEX swaps live in DEX Trader.</p>
            </div>
            {onBack && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
                <IconArrowLeft size={13} /> Back
              </button>
            )}
          </div>
        </div>
        <div className={`sweep-gate-banner ${isAirGapped || !sessionToken || !networkSessionReady ? "is-offline" : "is-online"}`}>
          <span className="sweep-gate-dot" />
          {isAirGapped ? "Safe Mode is on" : !sessionToken ? "Vault locked" : !networkSessionReady ? "Checking secure network access…" : "Vault session ready"}
        </div>
      </header>

      <section className="sweep-card" aria-labelledby="sweep-network-title">
        <div className="sweep-card-heading">
          <span className="sweep-step-number">01</span>
          <div>
            <h3 id="sweep-network-title">Choose network</h3>
            <p>Select the network that holds the assets you want to transfer.</p>
          </div>
        </div>
        <div className="sweep-chain-grid">
          {Object.values(SWEEP_CHAINS).map((chain) => (
            <button
              key={chain.key}
              type="button"
              className={`sweep-chain-option ${chainKey === chain.key ? "is-active" : ""}`}
              onClick={() => {
                setChainKey(chain.key);
                setTxResults({});
              }}
              disabled={sweeping}
              aria-pressed={chainKey === chain.key}
            >
              <ChainIcon chain={chain.key} size={20} />
              <span className="sweep-chain-copy">
                <strong>{chain.name}</strong>
                <small>{chain.symbol} · {chain.key === "sol" ? "Solana" : "EVM"}</small>
              </span>
              <span className="sweep-chain-state">{chainKey === chain.key ? "Selected" : "Select"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="sweep-card" aria-labelledby="sweep-setup-title">
        <div className="sweep-card-heading">
          <span className="sweep-step-number">02</span>
          <div>
            <h3 id="sweep-setup-title">Configure transfer</h3>
            <p>Choose the asset and destination. Review fees before any transaction is sent.</p>
          </div>
        </div>

        <div className="sweep-setup-grid">
          <div className="sweep-field-card">
            <label className="sweep-field-label">Asset</label>
            {chainKey === "sol" ? (
              <div className="sweep-segmented-control" role="group" aria-label="Asset type">
                <button
                  type="button"
                  className={assetMode === "native" ? "is-active" : ""}
                  onClick={() => setAssetMode("native")}
                  disabled={sweeping}
                  aria-pressed={assetMode === "native"}
                >
                  Native SOL
                </button>
                <button
                  type="button"
                  className={assetMode === "token" ? "is-active" : ""}
                  onClick={() => setAssetMode("token")}
                  disabled={sweeping}
                  aria-pressed={assetMode === "token"}
                >
                  SPL token <span>{discoveredSolTokens.length}</span>
                </button>
              </div>
            ) : (
              <div className="sweep-asset-readonly">
                <ChainIcon chain={chainKey} size={18} />
                <span>Native {activeChain.symbol}</span>
                <small>Token transfers are currently supported on Solana.</small>
              </div>
            )}

            {isTokenTransfer && (
              <div className="sweep-token-picker">
                {activeToken && (
                  <TokenIcon
                    chain="sol"
                    symbol={activeToken.symbol}
                    contractAddress={activeToken.mint}
                    name={activeToken.name}
                    logoUrl={activeToken.logoUrl}
                    size={24}
                  />
                )}
                <select
                  aria-label="Solana token to transfer"
                  value={selectedTokenMint}
                  onChange={(event) => setSelectedTokenMint(event.target.value)}
                  disabled={sweeping}
                >
                  <option value="" disabled>
                    {discoveredSolTokens.length > 0 ? "Choose a discovered token" : "No discovered tokens"}
                  </option>
                  {discoveredSolTokens.map((token) => (
                    <option key={token.mint} value={token.mint}>
                      {token.symbol} · {token.name} · {token.walletCount} wallet{token.walletCount === 1 ? "" : "s"}
                    </option>
                  ))}
                  <option value="custom">Enter a custom mint…</option>
                </select>
                {selectedTokenMint === "custom" && (
                  <input
                    className="sweep-text-input mono"
                    value={customMintInput}
                    onChange={(event) => setCustomMintInput(event.target.value.trim())}
                    placeholder="Paste Solana token mint"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={sweeping}
                    aria-label="Custom Solana token mint"
                    aria-invalid={Boolean(customMintInput) && !isValidSolAddress(customMintInput)}
                  />
                )}
                {!activeToken && (
                  <span className="sweep-inline-hint">
                    {selectedTokenMint === "custom"
                      ? "Enter a valid Solana mint and confirm that selected wallets have been scanned for it."
                      : "Choose a discovered token or enter a custom mint."}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="sweep-field-card">
            <label className="sweep-field-label" htmlFor="sweep-recipient">Recipient address</label>
            <div className="sweep-recipient-wrap">
              <input
                id="sweep-recipient"
                className="sweep-text-input mono"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value.trim())}
                placeholder={isEvmChain ? "0x… destination address" : "Solana destination address"}
                autoComplete="off"
                spellCheck={false}
                disabled={sweeping}
                aria-invalid={Boolean(recipient) && !validRecipient}
              />
              {recipient && (
                <span className={`sweep-address-state ${validRecipient ? "is-valid" : "is-invalid"}`}>
                  {validRecipient ? "Valid" : "Invalid"}
                </span>
              )}
            </div>
            <span className="sweep-inline-hint">
              {isTokenTransfer ? "The selected SPL token will be transferred to this wallet." : "All eligible native balance, minus required network fees, goes to this address."}
            </span>
          </div>

          <div className="sweep-field-card sweep-fee-card">
            {isEvmChain ? (
              <>
                <div className="sweep-field-heading-row">
                  <label className="sweep-field-label">Network fee</label>
                  <span className={`sweep-fee-live ${feeDataLive ? "is-live" : ""}`}>
                    <span className="sweep-gate-dot" />
                    {feeDataLive ? "Live quote" : "Estimate"} · {gasPriceGwei.toFixed(2)} Gwei
                  </span>
                </div>
                <div className="sweep-gas-options" role="group" aria-label="Gas speed">
                  <button type="button" className={gasMode === "standard" ? "is-active" : ""} onClick={() => applyGasMode("standard")} disabled={sweeping}>
                    Standard <small>{liveFeeGwei.toFixed(2)}</small>
                  </button>
                  <button type="button" className={gasMode === "fast" ? "is-active" : ""} onClick={() => applyGasMode("fast")} disabled={sweeping}>
                    Fast <small>{(liveFeeGwei * 1.25).toFixed(2)}</small>
                  </button>
                  <button type="button" className={gasMode === "turbo" ? "is-active" : ""} onClick={() => applyGasMode("turbo")} disabled={sweeping}>
                    Turbo <small>{(liveFeeGwei * 2).toFixed(2)}</small>
                  </button>
                  <button
                    type="button"
                    className={gasMode === "custom" ? "is-active" : ""}
                    onClick={() => {
                      setGasMode("custom");
                      if (validCustomGasPrice) setGasPriceGwei(Number(customGwei));
                    }}
                    disabled={sweeping}
                  >
                    Custom
                  </button>
                </div>
                {gasMode === "custom" && (
                  <>
                  <div className="sweep-custom-gas">
                    <input
                      className="sweep-text-input mono"
                      type="number"
                      min="0.001"
                      step="0.01"
                      value={customGwei}
                      onChange={(event) => {
                        setCustomGwei(event.target.value);
                        const value = Number(event.target.value);
                        if (Number.isFinite(value) && value > 0) setGasPriceGwei(value);
                      }}
                      disabled={sweeping}
                      aria-label="Custom gas price in Gwei"
                      aria-invalid={!validCustomGasPrice}
                    />
                    <span>Gwei</span>
                  </div>
                  {!validCustomGasPrice && <span className="sweep-inline-hint">Enter a gas price greater than zero.</span>}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="sweep-field-heading-row">
                  <label className="sweep-field-label" htmlFor="sweep-fee-payer">Solana fee sponsor</label>
                  <span className="sweep-fee-live">Optional</span>
                </div>
                <select
                  id="sweep-fee-payer"
                  className="sweep-text-input"
                  value={feePayerWalletId ?? "self"}
                  onChange={(event) => setFeePayerWalletId(event.target.value === "self" ? null : Number(event.target.value))}
                  disabled={sweeping}
                >
                  <option value="self">Each source wallet pays its own fee</option>
                  {solFeePayers.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.label || `Wallet #${wallet.id}`} · {wallet.formatted}
                    </option>
                  ))}
                </select>
                <span className="sweep-inline-hint">
                  {selectedFeePayer
                    ? `${selectedFeePayer.label || `Wallet #${selectedFeePayer.id}`} sponsors eligible transfers; keep enough SOL there for the full batch.`
                    : "Choose a funded wallet if a source cannot cover its own network fee."}
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="sweep-card sweep-wallet-card" aria-labelledby="sweep-wallets-title">
        <div className="sweep-card-heading sweep-wallet-heading">
          <span className="sweep-step-number">03</span>
          <div>
            <h3 id="sweep-wallets-title">Review source wallets</h3>
            <p>
              {loadingEstimates
                ? "Refreshing balances and fee estimates…"
                : `${readyWallets.length} of ${targetWallets.length} selected wallet${targetWallets.length === 1 ? "" : "s"} ready to transfer.`}
            </p>
          </div>
          <button
            type="button"
            className="sweep-select-all"
            onClick={() => selectAllFunded(isEvmChain ? "evm" : "sol")}
            disabled={sweeping || activeFamilyFundedCount === 0}
          >
            Select funded {isEvmChain ? "EVM" : "Solana"} wallets <span>{activeFamilyFundedCount}</span>
          </button>
        </div>

        {targetWallets.length === 0 ? (
          <div className="sweep-empty-state">
            <div className="sweep-empty-icon"><IconArrowLeft size={18} /></div>
            <div>
              <strong>No source wallets selected</strong>
              <p>Select wallets in your portfolio, or use “Select funded wallets” above.</p>
            </div>
          </div>
        ) : (
          <div className="sweep-table-scroll">
            <table className="sweep-review-table">
              <thead>
                <tr>
                  <th>Source wallet</th>
                  <th>Current balance</th>
                  <th>Est. fee</th>
                  <th>Est. to recipient</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {targetWallets.map((wallet) => {
                  const estimate = estimates[wallet.id];
                  const result = txResults[wallet.id];
                  const address = getWalletTargetAddress(wallet, isEvmChain);
                  const currentBalance = isTokenTransfer
                    ? getSolanaToken(wallet, activeToken?.mint || "")?.balance || `0 ${activeToken?.symbol || "TOKEN"}`
                    : wallet.balances?.[chainKey] || `0 ${activeChain.symbol}`;
                  return (
                    <tr key={wallet.id}>
                      <td>
                        <div className="sweep-source-cell">
                          <strong>{wallet.label || `Wallet #${wallet.id}`}</strong>
                          <span className="mono">{shortAddr(address)}</span>
                        </div>
                      </td>
                      <td className="mono">{result?.success ? "Transferred" : currentBalance}</td>
                      <td className="mono sweep-secondary-value">{estimate ? formatCompactBalance(estimate.feeFormatted) : loadingEstimates ? "Calculating…" : "—"}</td>
                      <td className="mono sweep-net-value">
                        {result?.success
                          ? result.amountSent || "Confirmed"
                          : estimate?.isSweepable
                            ? formatCompactBalance(estimate.netFormatted)
                            : estimate?.statusText || (loadingEstimates ? "Calculating…" : "—")}
                      </td>
                      <td>
                        {result ? (
                          <div className="sweep-result-cell">
                            <span className={`sweep-status-pill ${result.success ? "is-success" : result.pending ? "is-pending" : "is-failed"}`}>
                              {result.success ? <><IconCheckCircle size={12} /> Confirmed</> : result.pending ? "Pending" : <><IconAlertTriangle size={12} /> Failed</>}
                            </span>
                            {result.txHash && result.explorerUrl && (
                              <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer">View transaction ↗</a>
                            )}
                            {!result.success && !result.pending && result.error && <span className="sweep-result-error" title={result.error}>{result.error}</span>}
                          </div>
                        ) : estimate?.isSweepable ? (
                          <span className="sweep-status-pill is-ready">Ready</span>
                        ) : estimate ? (
                          <span className="sweep-status-pill is-muted" title={estimate.statusText}>{estimate.statusText}</span>
                        ) : (
                          <span className="sweep-status-pill is-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="sweep-action-bar">
        <div className="sweep-action-summary">
          <div>
            <span>Ready wallets</span>
            <strong>{readyWallets.length} <small>/ {targetWallets.length}</small></strong>
          </div>
          <div>
            <span>Estimated total to recipient</span>
            <strong className="mono">{totalToDestination}</strong>
          </div>
          {sweeping && sweepProgress && (
            <div className="sweep-progress-copy" aria-live="polite">
              Transfer {sweepProgress.current} of {sweepProgress.total}…
            </div>
          )}
        </div>
        <button
          type="button"
          className="sweep-submit-button"
          onClick={() => void handleSweep()}
          disabled={
            sweeping || loadingEstimates || !sessionToken || !networkSessionReady || isAirGapped ||
            !validRecipient || readyWallets.length === 0 || (isTokenTransfer && !activeToken) ||
            (isEvmChain && gasMode === "custom" && !validCustomGasPrice)
          }
        >
          {sweeping
            ? `Transferring ${sweepProgress?.current ?? 0}/${sweepProgress?.total ?? readyWallets.length}…`
            : <><IconZap size={15} /> Transfer {assetLabelForButton(isTokenTransfer, activeToken?.symbol, activeChain.symbol)}</>}
        </button>
      </footer>

      <p className="sweep-separation-note">
        Smart Sweeper transfers assets only. Use <strong>DEX Trader</strong> for token swaps.
      </p>
    </div>
  );
}

function assetLabelForButton(isTokenTransfer: boolean, tokenSymbol: string | undefined, nativeSymbol: string): string {
  return isTokenTransfer ? `${tokenSymbol || "SPL token"} to recipient` : `${nativeSymbol} to recipient`;
}
