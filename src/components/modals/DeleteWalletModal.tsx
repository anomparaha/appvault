import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../context/AppContext";
import type { WalletRecord } from "../../lib/types/index";
import { IconShield, IconAlertTriangle, IconX, IconTrash, IconEye, IconEyeOff } from "../../icons";

interface DeleteWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: WalletRecord | null;
  onSuccess?: () => void;
}

export function DeleteWalletModal({
  isOpen,
  onClose,
  wallet,
  onSuccess,
}: DeleteWalletModalProps) {
  const { removeWallet } = useApp();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setError(null);
      setLoading(false);
      setShowPassword(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !wallet) return null;

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleConfirm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim()) {
      setError("Please enter your Master Password.");
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await removeWallet(wallet.id, password);
      if (res.success) {
        onClose();
        if (onSuccess) onSuccess();
      } else {
        setError(res.error || "Incorrect Master Password. Verification failed.");
        inputRef.current?.focus();
      }
    } catch (err) {
      setError(`Failed to delete wallet: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const walletIdentifier = wallet.label
    ? `"${wallet.label}"`
    : `${wallet.type.toUpperCase()} Wallet #${wallet.id}`;

  const primaryAddress = wallet.address || wallet.solAddress || wallet.btcAddress || "";

  return createPortal(
    <div className="modal-backdrop" onClick={handleClose}>
      <div
        className="modal-card reset-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-wallet-title"
      >
        {/* Danger Red Glow Bar */}
        <div className="reset-card-glow-bar" />

        <div className="reset-modal-header">
          <div className="reset-modal-title-row">
            <div className="reset-modal-icon-wrap">
              <IconTrash size={20} />
            </div>
            <div>
              <h3 id="delete-wallet-title" className="reset-title-text">
                Delete Wallet
              </h3>
              <p className="reset-modal-subtitle">
                Permanent Removal & Master Password Verification
              </p>
            </div>
          </div>
          <button
            type="button"
            className="reset-modal-close-btn"
            onClick={handleClose}
            disabled={loading}
            data-tooltip="Close (ESC)"
          >
            <IconX size={14} />
          </button>
        </div>

        <form onSubmit={handleConfirm}>
          <div className="reset-modal-body">
            {/* Wallet Info Summary Box */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                padding: "10px 14px",
                borderRadius: "var(--r-sm)",
                background: "var(--surface-inset)",
                border: "1px solid var(--border-strong)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                  {walletIdentifier}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: "var(--r-pill)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-dim)",
                  }}
                >
                  {wallet.type.toUpperCase()}
                </span>
              </div>
              {primaryAddress && (
                <span
                  className="mono"
                  style={{
                    fontSize: "11px",
                    color: "var(--text-dim)",
                    wordBreak: "break-all",
                  }}
                >
                  {primaryAddress}
                </span>
              )}
            </div>

            {/* Warning Banner */}
            <div className="reset-warning-banner">
              <div className="reset-warning-accent-line" />
              <div className="reset-warning-top">
                <span className="reset-warning-badge">
                  <IconAlertTriangle size={12} />
                  IRREVERSIBLE ACTION
                </span>
                <span className="reset-counter-pill mono">ID #{wallet.id}</span>
              </div>
              <p className="reset-warning-text">
                You are about to permanently delete this wallet from your encrypted vault. Make sure you have
                backed up any secret key or recovery mnemonic before proceeding. This action{" "}
                <strong className="text-red-highlight">cannot be undone</strong>.
              </p>
            </div>

            {/* Master Password Input Field */}
            <div className="reset-input-group">
              <label className="reset-input-label">
                <span>Confirm with Master Password:</span>
              </label>

              <div className={`reset-password-input-wrap ${error ? "has-error" : ""}`}>
                <span className="reset-input-prefix-icon">
                  <IconShield size={14} />
                </span>

                <input
                  ref={inputRef}
                  type={showPassword ? "text" : "password"}
                  className="reset-password-input"
                  style={{
                    paddingLeft: "38px",
                    paddingRight: "88px",
                    background: "transparent",
                    border: "none",
                  }}
                  placeholder="Enter your Master Password…"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={loading}
                />

                <button
                  type="button"
                  className="reset-pwd-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  data-tooltip={showPassword ? "Hide Password" : "Show Password"}
                >
                  {showPassword ? (
                    <>
                      <IconEyeOff size={13} />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <IconEye size={13} />
                      <span>Show</span>
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div className="reset-error-msg">
                  <IconAlertTriangle size={14} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>

          <div className="reset-modal-footer">
            <button
              type="button"
              className="reset-btn-cancel"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="reset-btn-danger"
              disabled={loading || !password.trim()}
            >
              {loading ? (
                <>
                  <span className="btn-spinner-red" />
                  <span>Deleting…</span>
                </>
              ) : (
                <>
                  <IconTrash size={14} />
                  <span>Permanently Delete</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
