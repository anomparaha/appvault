import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../../context/AppContext";
import { SWEEP_CHAINS, fetchLiveFeeData, type SweepChainConfig } from "../../lib/services/sweeper";
import { logActivity } from "../../lib/services/activity";
import { shortAddr } from "../../lib/wallets/wallet";
import { formatEther, parseUnits, isEvmAddress, isValidSolAddress, toBigInt } from "../../lib/utils/format";
import { inspectRecipientAddress, type AddressInspectionResult } from "../../lib/services/addressInspector";
import { ChainIcon, IconShield, IconWallet } from "../../icons";

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (txHash: string) => void;
}

interface AccountInfoRaw {
  balance_hex: string;
  balance_eth: number;
  balance_formatted: string;
  nonce: number;
}

interface ChainFeeRaw {
  gas_price_gwei: number;
  priority_fee_gwei: number;
  estimated_fee_eth: string;
  chain_id: number;
  symbol: string;
}

interface EvmSignResult {
  rawTx: string;
  fromAddress: string;
}

interface SolanaSignResult {
  rawTxBase64: string;
  fromAddress: string;
}

export const SendModal: React.FC<SendModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { wallets, sessionToken, isAirGapped, toast } = useApp();

  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [selectedChainKey, setSelectedChainKey] = useState<string>("eth");
  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [balanceRaw, setBalanceRaw] = useState<string>("0");
  const [balanceFormatted, setBalanceFormatted] = useState<string>("0.00");
  const [gasPriceGwei, setGasPriceGwei] = useState<number>(15);
  const [estimatedFeeFormatted, setEstimatedFeeFormatted] = useState<string>("0.000315 ETH");
  const [isFetchingFee, setIsFetchingFee] = useState<boolean>(false);
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [txSuccessHash, setTxSuccessHash] = useState<string | null>(null);
  const [isChainDropdownOpen, setIsChainDropdownOpen] = useState<boolean>(false);
  const [isWalletDropdownOpen, setIsWalletDropdownOpen] = useState<boolean>(false);
  const [inspectionResult, setInspectionResult] = useState<AddressInspectionResult | null>(null);
  const [isInspecting, setIsInspecting] = useState<boolean>(false);
  const [bypassTokenContractWarning, setBypassTokenContractWarning] = useState<boolean>(false);

  // Address inspection effect with debouncing
  useEffect(() => {
    const trimmed = recipient.trim();
    if (!trimmed) {
      setInspectionResult(null);
      setIsInspecting(false);
      setBypassTokenContractWarning(false);
      return;
    }

    setBypassTokenContractWarning(false);
    setIsInspecting(true);

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const result = await inspectRecipientAddress(trimmed, selectedChainKey, isAirGapped);
        if (isMounted) {
          setInspectionResult(result);
        }
      } catch (err) {
        console.error("Address inspection error:", err);
      } finally {
        if (isMounted) {
          setIsInspecting(false);
        }
      }
    }, 280);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [recipient, selectedChainKey, isAirGapped]);

  const chainDropdownRef = useRef<HTMLDivElement>(null);
  const walletDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chainDropdownRef.current && !chainDropdownRef.current.contains(e.target as Node)) {
        setIsChainDropdownOpen(false);
      }
      if (walletDropdownRef.current && !walletDropdownRef.current.contains(e.target as Node)) {
        setIsWalletDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize selected wallet
  useEffect(() => {
    if (wallets.length > 0 && selectedWalletId === null) {
      setSelectedWalletId(wallets[0].id);
    }
  }, [wallets, selectedWalletId]);

  const currentWallet = useMemo(() => {
    return wallets.find((w) => w.id === selectedWalletId) || wallets[0] || null;
  }, [wallets, selectedWalletId]);

  const activeChain: SweepChainConfig = useMemo(() => {
    return SWEEP_CHAINS[selectedChainKey] || SWEEP_CHAINS.eth;
  }, [selectedChainKey]);

  const senderAddress = useMemo(() => {
    if (!currentWallet) return "";
    return selectedChainKey === "sol"
      ? currentWallet.solAddress || ""
      : currentWallet.address || "";
  }, [currentWallet, selectedChainKey]);

  // Query account balance & gas fee for the active sender and chain
  const refreshAccountState = useCallback(async () => {
    if (!senderAddress || !isOpen) return;

    setIsFetchingFee(true);
    try {
      if (selectedChainKey === "sol") {
        const acc = await invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
          chainKey: "sol",
          address: senderAddress,
        });
        setBalanceRaw(acc.balance_hex);
        setBalanceFormatted(acc.balance_formatted);
        setEstimatedFeeFormatted("0.000005 SOL");
      } else {
        const [acc, feeData] = await Promise.all([
          invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
            chainKey: selectedChainKey,
            address: senderAddress,
          }),
          fetchLiveFeeData(selectedChainKey),
        ]);

        setBalanceRaw(acc.balance_hex);
        setBalanceFormatted(acc.balance_formatted);
        setGasPriceGwei(feeData.gasPriceGwei);
        setEstimatedFeeFormatted(feeData.estimatedFeePerTxEth);
      }
    } catch (err) {
      console.error("Failed to fetch balance or gas data:", err);
    } finally {
      setIsFetchingFee(false);
    }
  }, [senderAddress, selectedChainKey, isOpen]);

  useEffect(() => {
    refreshAccountState();
  }, [refreshAccountState]);

  // Recipient validation
  const validationState = useMemo(() => {
    const trimmed = recipient.trim();
    if (!trimmed) return { isValid: false, message: "" };

    if (selectedChainKey === "sol") {
      if (!isValidSolAddress(trimmed)) {
        return { isValid: false, message: "Invalid Solana address format (Base58 required)" };
      }
    } else {
      if (!isEvmAddress(trimmed)) {
        return { isValid: false, message: "Invalid EVM address format (42 characters starting with 0x)" };
      }
    }

    if (trimmed.toLowerCase() === senderAddress.toLowerCase()) {
      return { isValid: false, message: "Sender and recipient addresses are identical" };
    }

    if (
      (inspectionResult?.type === "token_contract" || inspectionResult?.type === "cross_chain_contract") &&
      !bypassTokenContractWarning
    ) {
      return {
        isValid: false,
        message: inspectionResult.warning || "Transfers blocked to prevent permanent fund loss.",
      };
    }

    return { isValid: true, message: "Valid recipient address ✓" };
  }, [recipient, selectedChainKey, senderAddress, inspectionResult, bypassTokenContractWarning]);

  // Calculate Max Amount
  const handleSetMax = () => {
    try {
      if (selectedChainKey === "sol") {
        const lamports = BigInt(balanceRaw || "0");
        const feeLamports = 5000n;
        if (lamports <= feeLamports) {
          setAmount("0");
          toast("Insufficient balance to cover Solana network fee", "info");
          return;
        }
        const net = lamports - feeLamports;
        const netSol = (Number(net) / 1e9).toFixed(6);
        setAmount(netSol);
      } else {
        const balanceWei = toBigInt(balanceRaw || "0");
        const gasPriceWei = parseUnits(gasPriceGwei.toString(), "gwei");
        const feeWei = gasPriceWei * 21000n;
        if (balanceWei <= feeWei) {
          setAmount("0");
          toast("Insufficient balance to cover gas fee", "info");
          return;
        }
        const netWei = balanceWei - feeWei;
        const netEth = Number(formatEther(netWei)).toFixed(6);
        setAmount(netEth);
      }
    } catch (err) {
      console.error("Max calculation failed:", err);
    }
  };

  // Handle Paste from Clipboard
  const handlePasteRecipient = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRecipient(text.trim());
      }
    } catch {
      toast("Unable to read clipboard", "error");
    }
  };

  // Broadcast Single Transaction
  const handleBroadcast = async () => {
    if (!currentWallet || !sessionToken) {
      toast("Vault session required. Please unlock vault.", "error");
      return;
    }

    if (!validationState.isValid) {
      toast(validationState.message || "Please check recipient address", "error");
      return;
    }

    if (
      (inspectionResult?.type === "token_contract" || inspectionResult?.type === "cross_chain_contract") &&
      !bypassTokenContractWarning
    ) {
      toast("Blocked: Recipient is a Token Contract or not deployed on this network.", "error");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast("Please enter a valid transfer amount", "info");
      return;
    }

    if (isAirGapped) {
      toast("Safe Mode is active. Outbound RPC calls are blocked by Air-Gap.", "info");
      return;
    }

    setIsBroadcasting(true);
    try {
      let txHash = "";

      if (selectedChainKey === "sol") {
        const lamportsToSend = BigInt(Math.floor(numAmount * 1e9));
        const recentBlockhash = await invoke<string>("get_solana_recent_blockhash");

        const signResult = await invoke<SolanaSignResult>("sign_solana_transfer_scoped", {
          walletId: currentWallet.id,
          sessionToken,
          tx: {
            recipient: recipient.trim(),
            lamports: lamportsToSend.toString(),
            recentBlockhash,
            isNonceAccount: false,
          },
        });

        txHash = await invoke<string>("broadcast_solana_tx", {
          rawTxBase64: signResult.rawTxBase64,
        });
      } else {
        const acc = await invoke<AccountInfoRaw>("get_account_nonce_and_balance", {
          chainKey: selectedChainKey,
          address: senderAddress,
        });
        const feeData = await invoke<ChainFeeRaw>("get_chain_fee_data", { chainKey: selectedChainKey });

        const gasPriceWei = parseUnits(feeData.gas_price_gwei.toString(), "gwei");
        const gasLimit = 21000n;
        const valueWei = parseUnits(amount, "ether");

        const signResult = await invoke<EvmSignResult>("sign_evm_transfer_scoped", {
          walletId: currentWallet.id,
          sessionToken,
          tx: {
            chainId: activeChain.chainId,
            toAddress: recipient.trim(),
            valueWeiHex: "0x" + valueWei.toString(16),
            gasPriceWeiHex: "0x" + gasPriceWei.toString(16),
            gasLimit: Number(gasLimit),
            nonce: acc.nonce,
          },
        });

        txHash = await invoke<string>("broadcast_raw_tx", {
          chainKey: selectedChainKey,
          rawTx: signResult.rawTx,
        });
      }

      // Record Activity Log
      logActivity({
        type: "sweep",
        title: `Transferred ${amount} ${activeChain.symbol}`,
        desc: `Transferred from ${shortAddr(senderAddress)} to ${shortAddr(recipient.trim())}`,
        amount: `${amount} ${activeChain.symbol}`,
        amountColor: "var(--ok)",
        status: "success",
        chain: selectedChainKey,
        txHash,
        explorerUrl: `${activeChain.explorerUrl}${txHash}`,
        recipient: recipient.trim(),
        sender: senderAddress,
        metadata: {
          transferType: "single_transfer",
          gasFee: estimatedFeeFormatted,
        },
      });

      setTxSuccessHash(txHash);
      toast(`Transfer broadcasted successfully: ${shortAddr(txHash)}`, "success");
      onSuccess?.(txHash);
      refreshAccountState();
    } catch (err: any) {
      console.error("Transfer broadcast failed:", err);
      const errMsg = typeof err === "string" ? err : err?.message || "Transaction failed";
      toast(`Transfer failed: ${errMsg}`, "error");

      logActivity({
        type: "sweep",
        title: `Transfer Failed (${activeChain.symbol})`,
        desc: errMsg,
        amount: "Failed",
        amountColor: "var(--danger)",
        status: "failed",
        chain: selectedChainKey,
        recipient: recipient.trim(),
        sender: senderAddress,
      });
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleResetForm = () => {
    setTxSuccessHash(null);
    setAmount("");
    setRecipient("");
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card send-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "520px",
          width: "100%",
          padding: "0",
          overflow: "hidden",
          borderRadius: "14px",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(204, 255, 0, 0.12)",
                color: "var(--accent)",
                border: "1px solid rgba(204, 255, 0, 0.25)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "var(--text)" }}>
                Send Crypto Assets
              </h3>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Native offline-signed single transaction transfer
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ fontSize: "16px", padding: "0 8px", height: "28px" }}
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px" }}>
          {txSuccessHash ? (
            /* ── Success Screen ── */
            <div style={{ textAlign: "center", padding: "20px 8px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "rgba(34, 197, 94, 0.15)",
                  color: "var(--ok)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 14px",
                  border: "2px solid rgba(34, 197, 94, 0.3)",
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>

              <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)", margin: 0 }}>
                Transaction Broadcasted!
              </h3>
              <p style={{ fontSize: "11.5px", color: "var(--text-dim)", marginTop: "6px" }}>
                Sent {amount} {activeChain.symbol} to {shortAddr(recipient)}
              </p>

              <div
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: "9px",
                  padding: "10px 14px",
                  margin: "18px 0",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  On-Chain Transaction Hash
                </span>
                <div className="mono" style={{ fontSize: "11px", color: "var(--accent)", wordBreak: "break-all" }}>
                  {txSuccessHash}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center" }}>
                <a
                  href={`${activeChain.explorerUrl}${txSuccessHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost"
                  style={{ fontSize: "11.5px", height: "34px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                >
                  View on Explorer ↗
                </a>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleResetForm}
                  style={{ fontSize: "11.5px", height: "34px", padding: "0 18px" }}
                >
                  Send Another
                </button>
              </div>
            </div>
          ) : (
            /* ── Send Form ── */
            <>
              {/* Source Account & Network Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div style={{ position: "relative" }} ref={walletDropdownRef}>
                  <label style={{ fontSize: "10.5px", fontWeight: "600", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px", display: "block" }}>
                    Source Wallet
                  </label>
                  <button
                    type="button"
                    className="custom-select-trigger"
                    onClick={() => {
                      setIsWalletDropdownOpen((prev) => !prev);
                      setIsChainDropdownOpen(false);
                    }}
                    style={{
                      width: "100%",
                      fontSize: "11.5px",
                      padding: "7px 10px",
                      borderRadius: "8px",
                      background: "var(--surface-inset)",
                      color: "var(--text)",
                      border: isWalletDropdownOpen ? "1px solid var(--accent)" : "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      textAlign: "left",
                      height: "36px",
                      outline: "none",
                      boxShadow: "none",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", overflow: "hidden" }}>
                      <span style={{ color: "var(--accent)", display: "flex", alignItems: "center", flexShrink: 0 }}>
                        <IconWallet size={15} />
                      </span>
                      <span style={{ fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {currentWallet?.label ? `[${currentWallet.label}] ` : `Wallet #${(wallets.findIndex((w) => w.id === selectedWalletId) + 1) || 1} `}
                        · <span className="mono" style={{ fontSize: "11px", color: "var(--text-dim)" }}>{shortAddr(senderAddress)}</span>
                      </span>
                    </div>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        color: "var(--text-dim)",
                        transform: isWalletDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.15s ease",
                        flexShrink: 0,
                        marginLeft: "6px",
                      }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {/* Wallet Dropdown Popover */}
                  {isWalletDropdownOpen && (
                    <div
                      className="custom-dropdown-panel"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        background: "#1B2028",
                        border: "1px solid var(--border-strong, #39414D)",
                        borderRadius: "10px",
                        boxShadow: "0 16px 36px rgba(0, 0, 0, 0.75)",
                        zIndex: 110,
                        padding: "4px",
                        maxHeight: "200px",
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      {wallets.map((w, idx) => {
                        const isSelected = w.id === selectedWalletId;
                        const addr = selectedChainKey === "sol" ? w.solAddress || "" : w.address || "";
                        return (
                          <button
                            key={w.id}
                            type="button"
                            className="custom-dropdown-item"
                            onClick={() => {
                              setSelectedWalletId(w.id);
                              setIsWalletDropdownOpen(false);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "7px 10px",
                              borderRadius: "6px",
                              border: "none",
                              outline: "none",
                              cursor: "pointer",
                              background: isSelected ? "var(--surface-2)" : "transparent",
                              color: "var(--text)",
                              width: "100%",
                              textAlign: "left",
                              transition: "background 0.12s ease",
                            }}
                          >
                            <span style={{ color: isSelected ? "var(--accent)" : "var(--text-dim)", display: "flex", alignItems: "center" }}>
                              <IconWallet size={14} />
                            </span>
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: "11.5px", fontWeight: isSelected ? "700" : "500", color: "var(--text)" }}>
                                {w.label ? `[${w.label}]` : `Wallet #${idx + 1}`}
                              </span>
                              <span className="mono" style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                                {shortAddr(addr)}
                              </span>
                            </div>
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ position: "relative" }} ref={chainDropdownRef}>
                  <label style={{ fontSize: "10.5px", fontWeight: "600", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px", display: "block" }}>
                    Network / Blockchain
                  </label>
                  <button
                    type="button"
                    className="custom-select-trigger"
                    onClick={() => {
                      setIsChainDropdownOpen((prev) => !prev);
                      setIsWalletDropdownOpen(false);
                    }}
                    style={{
                      width: "100%",
                      fontSize: "11.5px",
                      padding: "7px 10px",
                      borderRadius: "8px",
                      background: "var(--surface-inset)",
                      color: "var(--text)",
                      border: isChainDropdownOpen ? "1px solid var(--accent)" : "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      textAlign: "left",
                      height: "36px",
                      outline: "none",
                      boxShadow: "none",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <ChainIcon chain={selectedChainKey} size={18} />
                      <span style={{ fontWeight: "650", color: "var(--text)", fontSize: "12px" }}>
                        {activeChain.name}
                      </span>
                      <span
                        style={{
                          fontSize: "9.5px",
                          color: "var(--accent)",
                          background: "rgba(204, 255, 0, 0.1)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontWeight: "700",
                        }}
                      >
                        {activeChain.symbol}
                      </span>
                    </div>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        color: "var(--text-dim)",
                        transform: isChainDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.15s ease",
                      }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {/* Chain Dropdown Popover with Logo */}
                  {isChainDropdownOpen && (
                    <div
                      className="custom-dropdown-panel"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        background: "#1B2028",
                        border: "1px solid var(--border-strong, #39414D)",
                        borderRadius: "10px",
                        boxShadow: "0 16px 36px rgba(0, 0, 0, 0.75)",
                        zIndex: 110,
                        padding: "4px",
                        maxHeight: "240px",
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      {Object.values(SWEEP_CHAINS).map((chain) => {
                        const isSelected = chain.key === selectedChainKey;
                        return (
                          <button
                            key={chain.key}
                            type="button"
                            className="custom-dropdown-item"
                            onClick={() => {
                              setSelectedChainKey(chain.key);
                              setIsChainDropdownOpen(false);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "9px",
                              padding: "7px 10px",
                              borderRadius: "6px",
                              border: "none",
                              outline: "none",
                              cursor: "pointer",
                              background: isSelected ? "var(--surface-2)" : "transparent",
                              color: "var(--text)",
                              width: "100%",
                              textAlign: "left",
                              transition: "background 0.12s ease",
                            }}
                          >
                            <ChainIcon chain={chain.key} size={18} />
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontSize: "11.5px", fontWeight: isSelected ? "700" : "500", color: "var(--text)" }}>
                                {chain.name}
                              </span>
                              <span style={{ fontSize: "9.5px", color: "var(--text-dim)" }}>
                                Chain ID: {chain.chainId}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: "650",
                                color: isSelected ? "var(--accent)" : "var(--text-dim)",
                                marginLeft: "auto",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: isSelected ? "rgba(204, 255, 0, 0.12)" : "var(--surface-3)",
                              }}
                            >
                              {chain.symbol}
                            </span>
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "4px" }}>
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Recipient Address */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                  <label style={{ fontSize: "10.5px", fontWeight: "600", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Recipient Address
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteRecipient}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "10px", padding: "1px 6px", height: "20px" }}
                  >
                    Paste
                  </button>
                </div>
                <input
                  type="text"
                  className="text-input mono"
                  placeholder={selectedChainKey === "sol" ? "Solana Base58 Address..." : "0x..."}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "11.5px",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    background: "var(--surface-inset)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                />
                {/* Real-time Address Inspection & Safety Analysis */}
                {recipient.trim() && (
                  <div className="recipient-inspect-wrap">
                    {isInspecting ? (
                      <span className="recipient-inspect-badge neutral">
                        <span className="recipient-inspect-spinner" />
                        Inspecting address on-chain...
                      </span>
                    ) : inspectionResult ? (
                      <>
                        <div className={`recipient-inspect-badge ${inspectionResult.severity}`}>
                          {inspectionResult.type === "eoa" && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                          {inspectionResult.type === "smart_wallet" && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          )}
                          {inspectionResult.type === "token_contract" && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                          )}
                          {(inspectionResult.type === "contract_generic" || inspectionResult.type === "cross_chain_contract") && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                            </svg>
                          )}
                          {(inspectionResult.type === "solana_wallet" || inspectionResult.type === "unknown") && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                          <span>
                            {inspectionResult.label}
                            {inspectionResult.subLabel ? ` · ${inspectionResult.subLabel}` : ""}
                          </span>
                        </div>

                        {/* Token Contract Safety Alert Banner */}
                        {inspectionResult.type === "token_contract" && (
                          <div className="recipient-danger-banner">
                            <div className="recipient-danger-banner-header">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              <span>Blocked: Token Contract Detected</span>
                            </div>
                            <div className="recipient-danger-banner-body">
                              {inspectionResult.warning}
                            </div>

                            {/* Optional One-Click Switch Network Button */}
                            {inspectionResult.suggestedChain && (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  if (inspectionResult.suggestedChain) {
                                    setSelectedChainKey(inspectionResult.suggestedChain);
                                  }
                                }}
                                style={{
                                  height: "26px",
                                  fontSize: "11px",
                                  alignSelf: "flex-start",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  padding: "0 10px",
                                  marginTop: "2px",
                                }}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                </svg>
                                Switch Network to {inspectionResult.deployedChainName || "Deployed Network"}
                              </button>
                            )}

                            <label className="recipient-bypass-label">
                              <input
                                type="checkbox"
                                checked={bypassTokenContractWarning}
                                onChange={(e) => setBypassTokenContractWarning(e.target.checked)}
                              />
                              <span>I understand this is a Token Contract and want to force send anyway</span>
                            </label>
                          </div>
                        )}

                        {/* Cross-Chain Contract Safety Banner */}
                        {inspectionResult.type === "cross_chain_contract" && (
                          <div className="recipient-danger-banner">
                            <div className="recipient-danger-banner-header">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              <span>Network Mismatch: Contract on {inspectionResult.deployedChainName || "Another Chain"}</span>
                            </div>
                            <div className="recipient-danger-banner-body">
                              {inspectionResult.warning}
                            </div>
                            {inspectionResult.suggestedChain && (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  if (inspectionResult.suggestedChain) {
                                    setSelectedChainKey(inspectionResult.suggestedChain);
                                  }
                                }}
                                style={{
                                  height: "26px",
                                  fontSize: "11px",
                                  alignSelf: "flex-start",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  padding: "0 10px",
                                  marginTop: "2px",
                                }}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                </svg>
                                Switch Network to {inspectionResult.deployedChainName || "Deployed Network"}
                              </button>
                            )}
                            <label className="recipient-bypass-label">
                              <input
                                type="checkbox"
                                checked={bypassTokenContractWarning}
                                onChange={(e) => setBypassTokenContractWarning(e.target.checked)}
                              />
                              <span>I understand this contract is not deployed on this network and accept fund loss risk</span>
                            </label>
                          </div>
                        )}

                        {/* Generic Smart Contract Advisory Banner */}
                        {inspectionResult.type === "contract_generic" && (
                          <div className="recipient-warning-banner">
                            <div className="recipient-warning-banner-header">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              <span>Notice: Smart Contract Recipient</span>
                            </div>
                            <div className="recipient-warning-banner-body">
                              {inspectionResult.warning}
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}

                    {/* Standard format or error message if invalid */}
                    {!validationState.isValid && !inspectionResult?.requiresBypass && (
                      <span
                        style={{
                          fontSize: "10px",
                          marginTop: "2px",
                          display: "block",
                          color: "var(--danger)",
                        }}
                      >
                        {validationState.message}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Amount Input & Available Balance */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                  <label style={{ fontSize: "10.5px", fontWeight: "600", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Amount to Send
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>
                      Avail:{" "}
                      <strong style={{ color: "var(--text)" }}>
                        {isFetchingFee ? "..." : balanceFormatted}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleSetMax}
                      className="btn btn-ghost btn-sm"
                      style={{
                        fontSize: "9.5px",
                        fontWeight: "700",
                        padding: "1px 6px",
                        height: "19px",
                        color: "var(--accent)",
                        background: "rgba(204, 255, 0, 0.1)",
                      }}
                    >
                      MAX
                    </button>
                  </div>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="text-input"
                    style={{
                      width: "100%",
                      fontSize: "14px",
                      fontWeight: "700",
                      padding: "9px 65px 9px 12px",
                      borderRadius: "8px",
                      background: "var(--surface-inset)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "11.5px",
                      fontWeight: "650",
                      color: "var(--text-dim)",
                    }}
                  >
                    {activeChain.symbol}
                  </span>
                </div>
              </div>

              {/* Network Fee & Gas Breakdown Card */}
              <div
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                  borderRadius: "9px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>Estimated Network Fee</span>
                  <span className="mono" style={{ fontSize: "11px", color: "var(--text)", fontWeight: "600" }}>
                    {isFetchingFee ? "Calculating..." : estimatedFeeFormatted}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "6px", borderTop: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "11px", fontWeight: "650", color: "var(--text)" }}>Total Outflow</span>
                  <span className="mono" style={{ fontSize: "12px", fontWeight: "700", color: "var(--accent)" }}>
                    {amount ? `${amount} ${activeChain.symbol} + Gas` : "--"}
                  </span>
                </div>
              </div>

              {/* Air-Gap Safe Mode Warning Banner */}
              {isAirGapped && (
                <div
                  style={{
                    background: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "16px",
                  }}
                >
                  <span style={{ color: "var(--warning)" }}>
                    <IconShield size={14} />
                  </span>
                  <div style={{ fontSize: "10.5px", color: "var(--warning)", lineHeight: 1.35 }}>
                    <strong>Safe Mode Active:</strong> Outbound RPC queries are blocked by kernel air-gap. Disable Safe Mode in header to broadcast.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onClose}
                  style={{ height: "36px", fontSize: "11.5px", padding: "0 16px" }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBroadcast}
                  disabled={
                    isBroadcasting ||
                    isAirGapped ||
                    !validationState.isValid ||
                    !amount ||
                    parseFloat(amount) <= 0
                  }
                  style={{
                    flex: 1,
                    height: "36px",
                    fontSize: "11.5px",
                    fontWeight: "650",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {isBroadcasting ? (
                    "Signing & Broadcasting..."
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                      Review &amp; Broadcast Transfer
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
