import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { generateQrSvg } from "../lib/qr";
import { shortAddr } from "../lib/wallet";
import { ChainIcon, IconShield } from "../icons";

interface ReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenImport?: () => void;
}

type NetworkTab = "evm" | "sol" | "btc";

interface NetworkOption {
  id: NetworkTab;
  name: string;
  tabLabel: string;
  badge: string;
  symbol: string;
  explorerBase: string;
  notes: string;
}

const NETWORKS: NetworkOption[] = [
  {
    id: "evm",
    name: "EVM Chains (Multi-Chain 0x)",
    tabLabel: "EVM",
    badge: "Multi-Chain 0x",
    symbol: "ETH / EVM",
    explorerBase: "https://etherscan.io/address/",
    notes: "Universal EVM address. Compatible with Ethereum, BNB Chain, Base, Arbitrum, Robinhood, and all EVM networks.",
  },
  {
    id: "sol",
    name: "Solana",
    tabLabel: "Solana",
    badge: "SPL / Native",
    symbol: "SOL",
    explorerBase: "https://solscan.io/account/",
    notes: "Supports native SOL and all SPL tokens on Solana Mainnet-Beta.",
  },
  {
    id: "btc",
    name: "Bitcoin",
    tabLabel: "Bitcoin",
    badge: "Native SegWit",
    symbol: "BTC",
    explorerBase: "https://mempool.space/address/",
    notes: "Supports native Bitcoin SegWit (Bech32) transactions.",
  },
];

export const ReceiveModal: React.FC<ReceiveModalProps> = ({
  isOpen,
  onClose,
  onOpenImport,
}) => {
  const { wallets, toast } = useApp();
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkTab>("evm");
  const [qrSvg, setQrSvg] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isLoadingQr, setIsLoadingQr] = useState<boolean>(false);

  // Initialize selected wallet
  useEffect(() => {
    if (wallets.length > 0 && selectedWalletId === null) {
      setSelectedWalletId(wallets[0].id);
    }
  }, [wallets, selectedWalletId]);

  const currentWallet = useMemo(() => {
    return wallets.find((w) => w.id === selectedWalletId) || wallets[0] || null;
  }, [wallets, selectedWalletId]);

  const targetAddress = useMemo(() => {
    if (!currentWallet) return "";
    if (selectedNetwork === "evm") {
      return currentWallet.address || "";
    }
    if (selectedNetwork === "sol") {
      return currentWallet.solAddress || "";
    }
    if (selectedNetwork === "btc") {
      return currentWallet.btcAddress || "";
    }
    return "";
  }, [currentWallet, selectedNetwork]);

  const activeNetConfig = useMemo(() => {
    return NETWORKS.find((n) => n.id === selectedNetwork) || NETWORKS[0];
  }, [selectedNetwork]);

  // Generate QR Code whenever targetAddress changes and modal is open
  useEffect(() => {
    if (!isOpen || !targetAddress) {
      setQrSvg("");
      return;
    }

    setIsLoadingQr(true);
    generateQrSvg(targetAddress, {
      margin: 1,
      darkColor: "#0f172a",
      lightColor: "#ffffff",
    })
      .then((svg) => {
        setQrSvg(svg);
      })
      .catch((err) => {
        console.error("QR Code rendering error:", err);
      })
      .finally(() => {
        setIsLoadingQr(false);
      });
  }, [targetAddress]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!targetAddress) return;
    try {
      await navigator.clipboard.writeText(targetAddress);
      setIsCopied(true);
      toast(`Copied ${activeNetConfig.name} address to clipboard`, "success");
      setTimeout(() => setIsCopied(false), 2200);
    } catch {
      toast("Failed to copy address", "error");
    }
  };

  const handleOpenExplorer = () => {
    if (!targetAddress) return;
    const url = `${activeNetConfig.explorerBase}${targetAddress}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card receive-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "490px",
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
                background: "rgba(34, 197, 94, 0.12)",
                color: "var(--ok)",
                border: "1px solid rgba(34, 197, 94, 0.25)",
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
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "var(--text)" }}>
                Receive Crypto Assets
              </h3>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Scan QR or copy public address to deposit funds
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
          {wallets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>📭</div>
              <strong style={{ fontSize: "13.5px", color: "var(--text)" }}>
                No Wallets Configured in Vault
              </strong>
              <p
                style={{
                  fontSize: "11.5px",
                  color: "var(--text-dim)",
                  marginTop: "6px",
                  maxWidth: "360px",
                  marginInline: "auto",
                  lineHeight: 1.5,
                }}
              >
                You have not registered any wallet credentials yet. Import a Seed Phrase or Private
                Key to generate deposit addresses.
              </p>
              {onOpenImport && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    onOpenImport();
                  }}
                  style={{ marginTop: "16px", fontSize: "11.5px" }}
                >
                  + Import Wallet Now
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Wallet Selector (if multi-wallet) */}
              {wallets.length > 1 && (
                <div style={{ marginBottom: "14px" }}>
                  <label
                    style={{
                      fontSize: "10.5px",
                      fontWeight: "600",
                      color: "var(--text-dim)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: "6px",
                      display: "block",
                    }}
                  >
                    Select Receiving Wallet
                  </label>
                  <select
                    value={selectedWalletId || ""}
                    onChange={(e) => setSelectedWalletId(Number(e.target.value))}
                    className="select-input"
                    style={{
                      width: "100%",
                      fontSize: "12px",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      background: "var(--surface-inset)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {wallets.map((w, idx) => (
                      <option key={w.id} value={w.id}>
                        {w.label ? `[${w.label}] ` : `Wallet #${idx + 1} `}·{" "}
                        {shortAddr(w.address || w.solAddress || "")}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Network Family Tabs */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    fontSize: "10.5px",
                    fontWeight: "600",
                    color: "var(--text-dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "6px",
                    display: "block",
                  }}
                >
                  Network &amp; Standard
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "6px",
                    background: "var(--surface-inset)",
                    padding: "4px",
                    borderRadius: "9px",
                    border: "1px solid var(--border)",
                  }}
                >
                  {NETWORKS.map((n) => {
                    const isActive = selectedNetwork === n.id;
                    const hasAddr =
                      n.id === "evm"
                        ? Boolean(currentWallet?.address)
                        : n.id === "sol"
                        ? Boolean(currentWallet?.solAddress)
                        : Boolean(currentWallet?.btcAddress);

                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setSelectedNetwork(n.id)}
                        disabled={!hasAddr}
                        style={{
                          padding: "8px 6px",
                          borderRadius: "7px",
                          border: "none",
                          cursor: hasAddr ? "pointer" : "not-allowed",
                          background: isActive ? "var(--surface-2)" : "transparent",
                          color: isActive ? "var(--text)" : "var(--text-dim)",
                          opacity: hasAddr ? 1 : 0.45,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "4px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <ChainIcon chain={n.id} size={14} />
                          <span style={{ fontSize: "11px", fontWeight: "700" }}>{n.tabLabel}</span>
                        </div>
                        <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>{n.badge}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* QR Code Presentation Box */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    background: "#ffffff",
                    padding: "14px",
                    borderRadius: "14px",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
                    position: "relative",
                    width: "208px",
                    height: "208px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isLoadingQr ? (
                    <div style={{ color: "#0f172a", fontSize: "11px", fontWeight: "600" }}>
                      Generating QR...
                    </div>
                  ) : qrSvg ? (
                    <>
                      <div
                        dangerouslySetInnerHTML={{ __html: qrSvg }}
                        style={{ width: "180px", height: "180px" }}
                      />
                      {/* Center Emblem Badge */}
                      <div
                        style={{
                          position: "absolute",
                          width: "36px",
                          height: "36px",
                          background: "#ffffff",
                          borderRadius: "50%",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "2px solid #ffffff",
                        }}
                      >
                        <ChainIcon chain={selectedNetwork} size={20} />
                      </div>
                    </>
                  ) : (
                    <div style={{ color: "#ef4444", fontSize: "11px", textAlign: "center" }}>
                      No address available for this network
                    </div>
                  )}
                </div>
              </div>

              {/* Target Address Monospace Display */}
              <div
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  marginBottom: "14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: "600",
                      color: "var(--text-dim)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Public Deposit Address
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--ok)", fontWeight: "600" }}>
                    Verified Local Key
                  </span>
                </div>

                <div
                  className="mono"
                  style={{
                    fontSize: "11px",
                    color: "var(--text)",
                    wordBreak: "break-all",
                    lineHeight: 1.45,
                  }}
                >
                  {targetAddress || "No address found"}
                </div>
              </div>

              {/* EVM Multi-Chain Compatibility Indicators */}
              {selectedNetwork === "evm" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 12px",
                    background: "var(--surface-2)",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    marginBottom: "14px",
                  }}
                >
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", fontWeight: "600" }}>
                    Compatible EVM Chains:
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "var(--text)" }}>
                      <ChainIcon chain="eth" size={13} /> ETH
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "var(--text)" }}>
                      <ChainIcon chain="bsc" size={13} /> BNB
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "var(--text)" }}>
                      <ChainIcon chain="base" size={13} /> Base
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "var(--text)" }}>
                      <ChainIcon chain="arb" size={13} /> Arb
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "var(--text)" }}>
                      <ChainIcon chain="robinhood" size={13} /> RH
                    </span>
                  </div>
                </div>
              )}

              {/* Safety & Protocol Notice */}
              <div
                style={{
                  background: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.22)",
                  borderRadius: "8px",
                  padding: "9px 12px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "9px",
                  marginBottom: "16px",
                }}
              >
                <span style={{ color: "#60a5fa", marginTop: "1px" }}>
                  <IconShield size={14} />
                </span>
                <div style={{ fontSize: "10.5px", color: "var(--text-dim)", lineHeight: 1.4 }}>
                  <strong style={{ color: "var(--text)", fontWeight: "600" }}>
                    Deposit Protocol Notice:{" "}
                  </strong>
                  {activeNetConfig.notes} Sending incompatible assets may result in permanent loss.
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCopy}
                  disabled={!targetAddress}
                  style={{
                    flex: 1,
                    height: "36px",
                    fontSize: "11.5px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {isCopied ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Address Copied!
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy Address
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleOpenExplorer}
                  disabled={!targetAddress}
                  style={{
                    height: "36px",
                    fontSize: "11px",
                    padding: "0 14px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  Explorer ↗
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
