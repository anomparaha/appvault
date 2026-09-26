import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../../context/AppContext";
import { copySensitiveToClipboard } from "../../lib/crypto/security";
import { balanceAmount, chainsForWallet } from "../../lib/chains/chains";
import type { WalletView } from "../../lib/types/index";
import { deriveDualCredentialsNative, walletHasScanTarget, type DualCredentials } from "../../lib/wallets/wallet";
import { SweeperWorkspace } from "../workspaces/SweeperWorkspace";
import { DexBatchTrader } from "../trade/DexBatchTrader";
import { WalletActivityExplorer } from "./WalletActivityExplorer";
import { WalletHeader, type DetailMode } from "./detail/WalletHeader";
import { WalletCredentialsCard } from "./detail/WalletCredentialsCard";
import { BalancePortfolioView } from "./detail/BalancePortfolioView";
import type { SolanaAccountDetails } from "./detail/SolanaDiagnosticCard";
import { DeleteWalletModal } from "../modals/DeleteWalletModal";

export function WalletDetail({ wallet }: { wallet: WalletView }) {
  const { revealSecret, scanOne, toast, setWalletLabel, pricing } = useApp();
  const [activeTab, setActiveTab] = useState<DetailMode>("portfolio");
  const [revealed, setRevealed] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [isEditingTag, setIsEditingTag] = useState(false);
  const [tagInput, setTagInput] = useState(wallet.label || "");
  const [solAccount, setSolAccount] = useState<SolanaAccountDetails | null>(null);
  const [loadingSolAccount, setLoadingSolAccount] = useState(false);
  const [solAccountError, setSolAccountError] = useState<string | null>(null);
  const [dualCreds, setDualCreds] = useState<DualCredentials | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    setRevealed(false);
    setSecret(null);
    setIsEditingTag(false);
    setTagInput(wallet.label || "");
  }, [wallet.id, wallet.label]);

  const autoMaskTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (autoMaskTimerRef.current) {
        clearTimeout(autoMaskTimerRef.current);
        autoMaskTimerRef.current = null;
      }
    };
  }, []);

  const toggleReveal = async () => {
    if (revealed) {
      if (autoMaskTimerRef.current) {
        clearTimeout(autoMaskTimerRef.current);
        autoMaskTimerRef.current = null;
      }
      setRevealed(false);
      setSecret(null);
      return;
    }
    const s = await revealSecret(wallet.id);
    setSecret(s);
    setRevealed(true);
    toast("Credentials revealed. Auto-masking in 15s for visual privacy", "info");

    if (autoMaskTimerRef.current) {
      clearTimeout(autoMaskTimerRef.current);
    }
    autoMaskTimerRef.current = setTimeout(() => {
      setRevealed(false);
      setSecret(null);
      toast("Credentials auto-masked for visual privacy", "info");
      autoMaskTimerRef.current = null;
    }, 15000);
  };

  useEffect(() => {
    let cancelled = false;
    if (!secret) {
      setDualCreds(null);
      return;
    }
    deriveDualCredentialsNative(secret, wallet.type)
      .then((creds) => {
        if (!cancelled) setDualCreds(creds);
      })
      .catch(() => {
        if (!cancelled) setDualCreds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [secret, wallet.type]);

  const evmAddr = wallet.address || dualCreds?.evmAddress || null;
  const solAddr = wallet.solAddress || dualCreds?.solAddress || null;
  const btcAddr = wallet.btcAddress || dualCreds?.btcAddress || null;
  const btcLegacyAddr = dualCreds?.btcLegacyAddress;
  const evmPk = dualCreds?.evmPrivateKey;
  const solPk = dualCreds?.solPrivateKey;
  const btcPk = dualCreds?.btcPrivateKey;
  const isSol = Boolean(wallet.solAddress && !wallet.address);

  const fetchSolAccount = useCallback(() => {
    if (!solAddr) {
      setSolAccount(null);
      setSolAccountError(null);
      return;
    }
    setLoadingSolAccount(true);
    setSolAccountError(null);

    invoke<SolanaAccountDetails>("get_solana_account_details", { address: solAddr })
      .then((data) => {
        setSolAccount(data);
        setSolAccountError(null);
        setLoadingSolAccount(false);
      })
      .catch((err) => {
        console.error("Failed to get solana account details:", err);
        setSolAccount(null);
        setSolAccountError(String(err));
        setLoadingSolAccount(false);
      });
  }, [solAddr]);

  useEffect(() => {
    fetchSolAccount();
  }, [fetchSolAccount]);

  const walletChains = chainsForWallet(wallet);

  const copyEvmAddr = () => {
    if (!evmAddr) return;
    navigator.clipboard.writeText(evmAddr);
    toast("EVM Address copied to clipboard", "success");
  };

  const copySolAddr = () => {
    if (!solAddr) return;
    navigator.clipboard.writeText(solAddr);
    toast("Solana Address copied to clipboard", "success");
  };

  const copyBtcAddr = () => {
    if (!btcAddr) return;
    navigator.clipboard.writeText(btcAddr);
    toast("Bitcoin Native SegWit Address copied to clipboard", "success");
  };

  const copyBtcLegacyAddr = () => {
    if (!btcLegacyAddr) return;
    navigator.clipboard.writeText(btcLegacyAddr);
    toast("Bitcoin Legacy Address copied to clipboard", "success");
  };

  const copyEvmPk = async () => {
    if (!evmPk) return;
    await copySensitiveToClipboard(evmPk, 30000);
    toast("EVM Private Key copied! Auto-clears in 30s for security", "success");
  };

  const copySolPk = async () => {
    if (!solPk) return;
    await copySensitiveToClipboard(solPk, 30000);
    toast("Solana Private Key copied! Auto-clears in 30s for security", "success");
  };

  const copyBtcPk = async () => {
    if (!btcPk) return;
    await copySensitiveToClipboard(btcPk, 30000);
    toast("Bitcoin WIF Private Key copied! Auto-clears in 30s for security", "success");
  };

  const copySeed = async () => {
    if (!secret) return;
    await copySensitiveToClipboard(secret, 30000);
    toast("Master Seed Phrase copied! Auto-clears in 30s for security", "success");
  };

  const saveTag = () => {
    setWalletLabel(wallet.id, tagInput.trim() || null);
    setIsEditingTag(false);
  };

  const scan = async () => {
    setScanning(true);
    await scanOne(wallet.id);
    setScanning(false);
  };

  const { totalUsd, allocations } = useMemo(() => {
    let sum = 0;
    const allocs: { chain: string; label: string; color: string; usd: number; pct: number }[] = [];

    for (const c of walletChains) {
      const val = wallet.balances[c.key];
      const num = balanceAmount(val);
      const usd = num * pricing.getUsd(c.symbol);
      sum += usd;
      if (usd > 0) {
        allocs.push({ chain: c.key, label: c.label, color: c.color, usd, pct: 0 });
      }
    }

    if (wallet.tokens) {
      for (const t of wallet.tokens) {
        const num = balanceAmount(t.balance);
        const usd = num * pricing.getTokenUsd(t.symbol, t.chain, t.contractAddress);
        sum += usd;
        if (usd > 0) {
          allocs.push({ chain: t.chain, label: t.symbol, color: "#28a0f0", usd, pct: 0 });
        }
      }
    }

    if (sum > 0) {
      for (const item of allocs) {
        item.pct = Math.round((item.usd / sum) * 100);
      }
    }

    return { totalUsd: sum, allocations: allocs };
  }, [wallet, walletChains, pricing.priceReport, pricing.getUsd, pricing.getTokenUsd]);

  return (
    <div className={`detail-card${wallet.hasFunds ? " has-funds" : ""}`}>
      <WalletHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        walletType={wallet.type}
        hasFunds={wallet.hasFunds}
        walletLabel={wallet.label}
        isEditingTag={isEditingTag}
        tagInput={tagInput}
        setTagInput={setTagInput}
        setIsEditingTag={setIsEditingTag}
        saveTag={saveTag}
        onSetPresetTag={(p) => setWalletLabel(wallet.id, wallet.label?.toLowerCase() === p.toLowerCase() ? null : p)}
        onScan={scan}
        onDelete={() => setIsDeleteModalOpen(true)}
        hasScanTarget={walletHasScanTarget(wallet)}
        scanning={scanning}
        totalUsd={totalUsd}
        allocations={allocations}
      />

      <WalletCredentialsCard
        walletType={wallet.type}
        revealed={revealed}
        secret={secret}
        evmAddr={evmAddr}
        solAddr={solAddr}
        btcAddr={btcAddr}
        btcLegacyAddr={btcLegacyAddr}
        evmPk={evmPk}
        solPk={solPk}
        btcPk={btcPk}
        solAccount={solAccount}
        loadingSolAccount={loadingSolAccount}
        solAccountError={solAccountError}
        fetchSolAccount={fetchSolAccount}
        toggleReveal={toggleReveal}
        copyEvmAddr={copyEvmAddr}
        copySolAddr={copySolAddr}
        copyBtcAddr={copyBtcAddr}
        copyBtcLegacyAddr={copyBtcLegacyAddr}
        copyEvmPk={copyEvmPk}
        copySolPk={copySolPk}
        copyBtcPk={copyBtcPk}
        copySeed={copySeed}
        toast={toast}
      />

      {activeTab === "sweeper" ? (
        <SweeperWorkspace onBack={() => setActiveTab("portfolio")} />
      ) : activeTab === "dex" ? (
        <DexBatchTrader wallet={wallet} />
      ) : activeTab === "explorer" ? (
        <WalletActivityExplorer wallet={wallet} />
      ) : (
        <BalancePortfolioView
          wallet={wallet}
          walletChains={walletChains}
          isSol={isSol}
        />
      )}

      {/* Security-Gated Delete Wallet Modal with Master Password Challenge */}
      <DeleteWalletModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        wallet={wallet}
      />
    </div>
  );
}
