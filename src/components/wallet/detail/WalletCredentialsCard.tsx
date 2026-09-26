import { IconEye, IconLock, IconSprout } from "../../../icons";
import type { WalletType } from "../../../lib/types/index";
import { SolanaDiagnosticCard, type SolanaAccountDetails } from "./SolanaDiagnosticCard";

interface WalletCredentialsCardProps {
  walletType: WalletType;
  revealed: boolean;
  secret: string | null;
  evmAddr: string | null;
  solAddr: string | null;
  btcAddr: string | null;
  btcLegacyAddr?: string | null;
  evmPk?: string | null;
  solPk?: string | null;
  btcPk?: string | null;
  solAccount: SolanaAccountDetails | null;
  loadingSolAccount: boolean;
  solAccountError: string | null;
  fetchSolAccount: () => void;
  toggleReveal: () => void;
  copyEvmAddr: () => void;
  copySolAddr: () => void;
  copyBtcAddr: () => void;
  copyBtcLegacyAddr: () => void;
  copyEvmPk: () => void;
  copySolPk: () => void;
  copyBtcPk: () => void;
  copySeed: () => void;
  toast: (msg: string, type?: "info" | "success" | "error") => void;
}

export function WalletCredentialsCard({
  walletType,
  revealed,
  secret,
  evmAddr,
  solAddr,
  btcAddr,
  btcLegacyAddr,
  evmPk,
  solPk,
  btcPk,
  solAccount,
  loadingSolAccount,
  solAccountError,
  fetchSolAccount,
  toggleReveal,
  copyEvmAddr,
  copySolAddr,
  copyBtcAddr,
  copyBtcLegacyAddr,
  copyEvmPk,
  copySolPk,
  copyBtcPk,
  copySeed,
  toast,
}: WalletCredentialsCardProps) {
  return (
    <>
      <div className="hero-credentials-grid">
        {/* EVM Credentials Box */}
        <div className="credential-box evm-box">
          <div className="credential-header-bar">
            <span className="credential-label">EVM IDENTITY (0x ADDRESS)</span>
            {evmAddr && (
              <button type="button" className="btn-credential-action" onClick={copyEvmAddr}>
                Copy 0x
              </button>
            )}
          </div>
          <div className="credential-body">
            <div className="credential-row">
              <span className="credential-sub-lbl mono">Address:</span>
              <span className="credential-val mono" onClick={copyEvmAddr} data-tooltip="Click to copy EVM address">
                {evmAddr ?? "Not derived"}
              </span>
            </div>
            <div className="credential-row">
              <span className="credential-sub-lbl mono">Private Key:</span>
              <span className="credential-val mono secret-val">
                {revealed && evmPk ? evmPk : "••••••••••••••••••••••••••••••••"}
              </span>
              {revealed && evmPk && (
                <button type="button" className="btn-credential-action" onClick={copyEvmPk}>
                  Copy PK
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Solana Credentials Box */}
        <div className="credential-box sol-box">
          <div className="credential-header-bar">
            <span className="credential-label">SOLANA IDENTITY (BASE58)</span>
            {solAddr && (
              <button type="button" className="btn-credential-action" onClick={copySolAddr}>
                Copy Sol
              </button>
            )}
          </div>
          <div className="credential-body">
            <div className="credential-row">
              <span className="credential-sub-lbl mono">Address:</span>
              <span className="credential-val mono" onClick={copySolAddr} data-tooltip="Click to copy Solana address">
                {solAddr ?? "Not derived"}
              </span>
            </div>
            <div className="credential-row">
              <span className="credential-sub-lbl mono">Secret Key:</span>
              <span className="credential-val mono secret-val">
                {revealed && solPk ? solPk : "••••••••••••••••••••••••••••••••"}
              </span>
              {revealed && solPk && (
                <button type="button" className="btn-credential-action" onClick={copySolPk}>
                  Copy Sol PK
                </button>
              )}
            </div>

            <SolanaDiagnosticCard
              solAccount={solAccount}
              loadingSolAccount={loadingSolAccount}
              solAccountError={solAccountError}
              fetchSolAccount={fetchSolAccount}
              toast={toast}
            />
          </div>
        </div>

        {/* Bitcoin Credentials Box */}
        {(btcAddr || btcLegacyAddr) && (
          <div className="credential-box btc-box">
            <div className="credential-header-bar">
              <span className="credential-label" style={{ color: "#f7931a" }}>BITCOIN IDENTITY (SEGWIT / LEGACY)</span>
              {btcAddr && (
                <button type="button" className="btn-credential-action" onClick={copyBtcAddr}>
                  Copy BTC
                </button>
              )}
            </div>
            <div className="credential-body">
              <div className="credential-row">
                <span className="credential-sub-lbl mono">Native SegWit:</span>
                <span className="credential-val mono" onClick={copyBtcAddr} data-tooltip="Click to copy Bitcoin Native SegWit address">
                  {btcAddr ?? "Not derived"}
                </span>
              </div>
              {btcLegacyAddr && (
                <div className="credential-row">
                  <span className="credential-sub-lbl mono">Legacy (1...):</span>
                  <span className="credential-val mono" onClick={copyBtcLegacyAddr} data-tooltip="Click to copy Bitcoin Legacy address">
                    {btcLegacyAddr}
                  </span>
                  <button type="button" className="btn-credential-action" onClick={copyBtcLegacyAddr}>
                    Copy 1...
                  </button>
                </div>
              )}
              <div className="credential-row">
                <span className="credential-sub-lbl mono">WIF Key:</span>
                <span className="credential-val mono secret-val">
                  {revealed && btcPk ? btcPk : "••••••••••••••••••••••••••••••••"}
                </span>
                {revealed && btcPk && (
                  <button type="button" className="btn-credential-action" onClick={copyBtcPk}>
                    Copy WIF
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BIP-39 Master Mnemonic Banner (If wallet is seed phrase) */}
      {walletType === "seed" && (
        <div className="mnemonic-seed-banner">
          <div className="mnemonic-meta">
            <span className="mnemonic-title mono"><IconSprout size={12} /> BIP-39 MASTER SEED PHRASE</span>
            <span className="mnemonic-content mono">
              {revealed && secret ? secret : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
            </span>
          </div>
          <div className="mnemonic-actions">
            <button type="button" className="btn-credential-reveal" onClick={toggleReveal}>
              {revealed ? <><IconLock size={12} /> Hide Vault Secrets</> : <><IconEye size={12} /> Reveal All Secrets</>}
            </button>
            {revealed && secret && (
              <button type="button" className="btn-credential-copy-seed" onClick={copySeed}>
                Copy Seed
              </button>
            )}
          </div>
        </div>
      )}

      {/* Reveal Bar for PK Wallets */}
      {walletType !== "seed" && (
        <div className="pk-reveal-bar">
          <button type="button" className="btn-credential-reveal" onClick={toggleReveal}>
            {revealed ? <><IconLock size={12} /> Hide Vault Keys</> : <><IconEye size={12} /> Reveal Private Keys</>}
          </button>
        </div>
      )}
    </>
  );
}
