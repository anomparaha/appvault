import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { IconShield, IconAlertTriangle, IconX, IconTrash, IconEye, IconEyeOff } from "../icons";

export function ResetAllWalletsModal() {
  const { isResetModalOpen, setIsResetModalOpen, wallets, resetAllWallets } = useApp();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isResetModalOpen) {
      setPassword("");
      setError(null);
      setLoading(false);
      setShowPassword(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isResetModalOpen]);

  if (!isResetModalOpen) return null;

  const handleClose = () => {
    if (loading) return;
    setIsResetModalOpen(false);
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
      const res = await resetAllWallets(password);
      if (res.success) {
        setIsResetModalOpen(false);
      } else {
        setError(res.error || "Incorrect password. Verification failed.");
        inputRef.current?.focus();
      }
    } catch (err) {
      setError(`Failed to reset: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={handleClose}>
      <div
        className="modal-card reset-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Glow Header Accent Bar */}
        <div className="reset-card-glow-bar" />

        <div className="reset-modal-header">
          <div className="reset-modal-title-row">
            <div className="reset-modal-icon-wrap">
              <IconShield size={20} />
            </div>
            <div>
              <h3 className="reset-title-text">Reset All Wallets</h3>
              <p className="reset-modal-subtitle">Permanent Action & Vault Database Purge</p>
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
            {/* Warning Card */}
            <div className="reset-warning-banner">
              <div className="reset-warning-accent-line" />
              <div className="reset-warning-top">
                <span className="reset-warning-badge">
                  <IconAlertTriangle size={12} />
                  CRITICAL WARNING
                </span>
                <span className="reset-counter-pill mono">
                  {wallets.length.toLocaleString()} Wallets
                </span>
              </div>
              <p className="reset-warning-text">
                You are about to permanently wipe all <strong className="text-white">{wallets.length.toLocaleString()} wallets</strong>,
                balances, and private key data from the local encrypted database. This action <strong className="text-red-highlight">cannot be undone</strong>.
              </p>
            </div>

            {/* Password Input Field */}
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
                  <span>Purging Database…</span>
                </>
              ) : (
                <>
                  <IconTrash size={14} />
                  <span>Wipe All {wallets.length.toLocaleString()} Wallets</span>
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
