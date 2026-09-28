import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useApp } from "../../context/AppContext";
import { WindowControls } from "../layout/WindowControls";
import { APP_VERSION } from "../../version";
import { IconShield, IconLock, IconScan, IconZap, IconKey, IconEye, IconEyeOff } from "../../icons";

function AuthLayout({ children, title, desc }: { children: ReactNode; title: string; desc: string }) {
  return (
    <section className="opening">
      {/* ── Window Titlebar ── */}
      <div className="opening-topbar" data-tauri-drag-region>
        <div className="opening-topbar-left">
          <img src="/app-icon.png" alt="Plurivex" style={{ width: "16px", height: "16px", borderRadius: "4px", objectFit: "contain" }} />
          <span className="opening-topbar-title">Plurivex — Secure Vault</span>
        </div>
        <div className="opening-topbar-status">
          <span><span className="tb-dot" />Secure · Argon2id</span>
          <span>Encrypted Local Vault</span>
        </div>
        <WindowControls />
      </div>

      {/* ── Split Screen Body ── */}
      <div className="opening-body">
        {/* Left Hero Panel */}
        <div className="op-left">
          <div>
            <div className="brand-row">
              <img src="/app-icon.png" alt="Plurivex" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "contain" }} />
              <div className="brand-txt">
                <b>PLURIVEX</b>
                <span>SECURE WALLET VAULT</span>
              </div>
            </div>

            <div className="hero-badge">
              <span className="hero-badge-dot" />
              <span>Local-First Vault Architecture</span>
            </div>

            <h1 className="op-title">
              Your Private Multi-Chain Vault
            </h1>

            <p className="sub">
              Scan live balances, recover seed phrases, and protect digital assets with an encrypted local vault.
            </p>

            <ul className="feat">
              <li>
                <span className="ic"><IconShield size={16} /></span>
                <div className="feat-content">
                  <b>Multi-Layered Security</b>
                  <p>6-digit quick PIN, master password, and AES-256 local encryption.</p>
                </div>
              </li>
              <li>
                <span className="ic"><IconScan size={16} /></span>
                <div className="feat-content">
                  <b>Real-Time Balance Scan</b>
                  <p>Discover assets across thousands of multi-chain addresses instantly.</p>
                </div>
              </li>
              <li>
                <span className="ic"><IconZap size={16} /></span>
                <div className="feat-content">
                  <b>One-Click Batch Sweep</b>
                  <p>Consolidate funds from multiple wallets safely with gas optimization.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="foot">
            <span className="dot" />
            Safe Mode available · Encrypted local SQLite vault · v{APP_VERSION}
          </div>
        </div>

        {/* Right Auth Card Panel */}
        <div className="op-right">
          <div className="lock-card">
            <div className="lock-ic">
              <IconLock size={22} />
            </div>
            <h2>{title}</h2>
            <p className="hint">{desc}</p>
            {children}
            <div className="auth-features">
              <span>Argon2id</span>
              <span>AES-256</span>
              <span>Local Database</span>
              <span>Encrypted Local Vault</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SetupScreen() {
  const { setupPassword } = useApp();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pin, setPin] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (pw.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (pw !== confirm) { setError("Passwords do not match"); return; }
    if (pin && pin.trim().length > 0 && pin.trim().length !== 6) {
      setError("Quick PIN must be exactly 6 numeric digits");
      return;
    }
    setLoading(true);
    try {
      await setupPassword(pw, pin.trim());
    } catch {
      setError("Failed to create vault");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create New Vault" desc="Your master password encrypts all seed phrases and private keys on this device.">
      <div className="field">
        <label><IconLock size={12} /> Master Password</label>
        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="At least 8 characters"
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ paddingRight: "36px" }}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
            data-tooltip={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </button>
        </div>
      </div>

      <div className="field">
        <label><IconLock size={12} /> Confirm Password</label>
        <input
          type={showPw ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat master password"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      <div className="field" style={{ marginTop: "12px", borderTop: "1px dashed var(--border)", paddingTop: "12px" }}>
        <label><IconKey size={12} /> Quick 6-Digit PIN (Optional)</label>
        <input
          type="password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="e.g. 123456 (for quick unlock)"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <span style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginTop: "3px" }}>
          Use a 6-digit PIN for daily instant unlocks via the keypad.
        </span>
      </div>

      {error && <p className="field-error">{error}</p>}
      <button className="btn btn-primary btn-block" style={{ height: "44px", marginTop: "14px" }} onClick={submit} disabled={loading}>
        {loading ? "Creating vault…" : "Create Local Vault →"}
      </button>
    </AuthLayout>
  );
}

export function UnlockScreen() {
  const { unlock, unlockWithPin, resetVault, hasPin } = useApp();
  const [authMode, setAuthMode] = useState<"pin" | "password">(hasPin ? "pin" : "password");
  const [pin, setPin] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Handle PIN submission
  const handlePinSubmit = useCallback(async (pinToSubmit: string) => {
    if (pinToSubmit.length < 4) {
      setError("Please enter a 4 to 6 digit PIN");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const ok = await unlockWithPin(pinToSubmit);
      if (!ok) {
        setError("Incorrect PIN entered");
        setPin("");
      }
    } catch (err) {
      setError(`Failed to unlock vault: ${String(err)}`);
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [unlockWithPin]);

  // Handle Master Password submission
  const handlePwSubmit = async () => {
    if (!pw.trim()) {
      setError("Please enter master password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const ok = await unlock(pw);
      if (!ok) setError("Incorrect master password");
    } catch (err) {
      setError(`Failed to unlock vault: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard listener for PIN mode
  useEffect(() => {
    if (authMode !== "pin" || isForgotOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        setPin((prev) => {
          if (prev.length < 6) {
            const next = prev + e.key;
            if (next.length === 6) {
              setTimeout(() => handlePinSubmit(next), 50);
            }
            return next;
          }
          return prev;
        });
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (pin.length > 0) {
          handlePinSubmit(pin);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [authMode, pin, isForgotOpen, handlePinSubmit]);

  const handleKeypadPress = (val: string) => {
    if (loading) return;
    setError("");
    if (val === "backspace") {
      setPin((prev) => prev.slice(0, -1));
    } else if (val === "switch") {
      setAuthMode((m) => (m === "pin" ? "password" : "pin"));
    } else {
      setPin((prev) => {
        if (prev.length < 6) {
          const next = prev + val;
          if (next.length === 6) {
            setTimeout(() => handlePinSubmit(next), 50);
          }
          return next;
        }
        return prev;
      });
    }
  };

  const handleExecuteReset = async () => {
    const clean = resetConfirmInput.trim();
    if (clean !== "CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY") {
      setError("Type 'CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY' to confirm wiping vault");
      return;
    }
    setIsResetting(true);
    try {
      await resetVault(clean);
      setIsForgotOpen(false);
    } catch (err) {
      setError(`Failed to reset vault: ${String(err)}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <AuthLayout
        title="Unlock Vault"
        desc={
          authMode === "pin"
            ? "Enter your 6-digit PIN to unlock your vault"
            : "Enter your master password to access encrypted wallets"
        }
      >
        {authMode === "pin" ? (
          <div>
            {/* 6 Pindots Indicator */}
            <div className="pindots">
              {Array.from({ length: 6 }).map((_, i) => (
                <i key={i} className={i < pin.length ? "on" : ""} />
              ))}
            </div>

            {/* 3x4 Keypad Grid */}
            <div className="keypad">
              <button type="button" onClick={() => handleKeypadPress("1")}>1</button>
              <button type="button" onClick={() => handleKeypadPress("2")}>2</button>
              <button type="button" onClick={() => handleKeypadPress("3")}>3</button>
              <button type="button" onClick={() => handleKeypadPress("4")}>4</button>
              <button type="button" onClick={() => handleKeypadPress("5")}>5</button>
              <button type="button" onClick={() => handleKeypadPress("6")}>6</button>
              <button type="button" onClick={() => handleKeypadPress("7")}>7</button>
              <button type="button" onClick={() => handleKeypadPress("8")}>8</button>
              <button type="button" onClick={() => handleKeypadPress("9")}>9</button>
              <button
                type="button"
                className="ghost"
                onClick={() => handleKeypadPress("switch")}
                data-tooltip="Switch to Master Password"
              >
                <IconKey size={17} />
              </button>
              <button type="button" onClick={() => handleKeypadPress("0")}>0</button>
              <button
                type="button"
                className="ghost"
                onClick={() => handleKeypadPress("backspace")}
                data-tooltip="Delete Digit (Backspace)"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 5H8.5L2.5 12l6 7H21a1 1 0 001-1V6a1 1 0 00-1-1z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>
                </svg>
              </button>
            </div>

            {error && <p className="field-error" style={{ textAlign: "center", marginBottom: "12px" }}>{error}</p>}

            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ height: "46px" }}
              onClick={() => handlePinSubmit(pin)}
              disabled={loading || pin.length === 0}
            >
              {loading ? "Unlocking Vault…" : "Unlock Vault →"}
            </button>
          </div>
        ) : (
          <div>
            <div className="field">
              <label><IconLock size={12} /> Master Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Enter master password..."
                  onKeyDown={(e) => e.key === "Enter" && handlePwSubmit()}
                  autoFocus
                  style={{ paddingRight: "36px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
                  data-tooltip={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                </button>
              </div>
            </div>

            {error && <p className="field-error">{error}</p>}

            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ height: "46px", marginTop: "14px" }}
              onClick={handlePwSubmit}
              disabled={loading}
            >
              {loading ? "Unlocking Vault…" : "Unlock Vault →"}
            </button>
          </div>
        )}

        {/* Alternative Links (Switcher & Forgot Password) */}
        <div className="alt-links-row">
          <button
            type="button"
            className="alt-link"
            onClick={() => {
              setError("");
              setAuthMode((m) => (m === "pin" ? "password" : "pin"));
            }}
          >
            {authMode === "pin" ? "Unlock with Master Password" : "Unlock with Quick PIN"}
          </button>
          <button
            type="button"
            className="alt-link"
            onClick={() => {
              setError("");
              setResetConfirmInput("");
              setIsForgotOpen(true);
            }}
          >
            Forgot password?
          </button>
        </div>
      </AuthLayout>

      {/* ── Modal Dialog: Forgot Password / Reset Vault ── */}
      {isForgotOpen && (
        <div className="forgot-modal-overlay" onClick={() => !isResetting && setIsForgotOpen(false)}>
          <div className="forgot-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="forgot-modal-header">
              <div className="forgot-modal-ic">
                <IconShield size={20} />
              </div>
              <div className="forgot-modal-title">
                <h3>Vault Recovery &amp; Reset</h3>
                <span>Local Vault Storage</span>
              </div>
            </div>

            <div className="forgot-modal-body">
              <p>
                <b>Plurivex</b> operates locally on your machine. Your master password is never sent to any server, and cannot be recovered remotely if lost.
              </p>
              <p style={{ color: "var(--warning)" }}>
                ⚠️ If you lose your master password, you must wipe this vault and re-import your wallets using your backup Seed Phrases or Private Keys.
              </p>

              <div className="field" style={{ marginTop: "16px" }}>
                <label style={{ fontSize: "11px" }}>
                  Type <b style={{ color: "var(--danger)", userSelect: "all" }}>CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY</b> to confirm:
                </label>
                <input
                  type="text"
                  value={resetConfirmInput}
                  onChange={(e) => setResetConfirmInput(e.target.value)}
                  placeholder="CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY"
                  autoFocus
                  style={{ fontSize: "11px", fontFamily: "var(--mono)" }}
                />
              </div>
            </div>

            <div className="forgot-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsForgotOpen(false)}
                disabled={isResetting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleExecuteReset}
                disabled={resetConfirmInput.trim() !== "CONFIRM_FACTORY_RESET_VAULT_PERMANENTLY" || isResetting}
              >
                {isResetting ? "Resetting…" : "Wipe & Reset Vault"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}