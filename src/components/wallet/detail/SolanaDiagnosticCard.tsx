import { shortAddr } from "../../../lib/wallets/wallet";
import { IconAlertTriangle, IconCheckCircle } from "../../../icons";

export interface SolanaAccountDetails {
  exists: boolean;
  owner: string;
  owner_label: string;
  is_system_program: boolean;
  account_type: string;
  authority?: string | null;
  token_mint?: string | null;
  lamports: number;
  sol_balance: number;
  executable: boolean;
  space: number;
}

interface SolanaDiagnosticCardProps {
  solAccount: SolanaAccountDetails | null;
  loadingSolAccount: boolean;
  solAccountError: string | null;
  fetchSolAccount: () => void;
  toast: (msg: string, type?: "info" | "success" | "error") => void;
}

export function SolanaDiagnosticCard({
  solAccount,
  loadingSolAccount,
  solAccountError,
  fetchSolAccount,
  toast,
}: SolanaDiagnosticCardProps) {
  return (
    <div className="sol-account-analysis">
      <span className="sol-account-analysis-title">ON-CHAIN ACCOUNT ANALYSIS</span>
      <div className="credential-row sol-owner-credential-row">
        <span className="credential-sub-lbl mono">Account Owner:</span>
        {loadingSolAccount ? (
          <span className="credential-val mono text-muted text-xs">Querying Solana on-chain validator…</span>
        ) : solAccountError ? (
          <div className="sol-owner-row">
            <span className="credential-val mono text-danger text-xs">
              <IconAlertTriangle size={12} /> Query failed: {solAccountError}
            </span>
            <button type="button" className="btn-credential-action" onClick={fetchSolAccount}>
              Retry
            </button>
          </div>
        ) : solAccount ? (
          <div className="sol-owner-row">
            <span
              className={`sol-owner-badge ${
                solAccount.is_system_program ? "badge-sys-safe" : "badge-non-sys-warn"
              }`}
            >
              {solAccount.is_system_program ? (
                <>
                  <IconCheckCircle size={11} /> System Program (Standard EOA)
                </>
              ) : (
                <>
                  <IconAlertTriangle size={11} /> {solAccount.owner_label}
                </>
              )}
            </span>
            <span
              className="sol-owner-id-code mono"
              data-tooltip={`Owner Program ID: ${solAccount.owner} (Click to copy)`}
              onClick={() => {
                navigator.clipboard.writeText(solAccount.owner);
                toast("Owner Program ID copied to clipboard", "success");
              }}
            >
              {solAccount.owner}
            </span>
            <button
              type="button"
              className="btn-credential-action btn-copy-owner-id"
              onClick={() => {
                navigator.clipboard.writeText(solAccount.owner);
                toast("Owner Program ID copied to clipboard", "success");
              }}
              data-tooltip={`Copy full owner Program ID: ${solAccount.owner}`}
            >
              Copy ID
            </button>
          </div>
        ) : null}
      </div>

      {solAccount && solAccount.authority && (
        <div className="credential-row">
          <span className="credential-sub-lbl mono">
            {solAccount.account_type === "nonce_account" ? "Nonce Authority:" : "Token Owner (Authority):"}
          </span>
          <div className="sol-owner-row">
            <span
              className="sol-owner-id-code mono"
              data-tooltip={`Authority: ${solAccount.authority} (Click to copy)`}
              onClick={() => {
                navigator.clipboard.writeText(solAccount.authority!);
                toast("Authority address copied to clipboard", "success");
              }}
            >
              {solAccount.authority}
            </span>
            <button
              type="button"
              className="btn-credential-action btn-copy-owner-id"
              onClick={() => {
                navigator.clipboard.writeText(solAccount.authority!);
                toast("Authority address copied to clipboard", "success");
              }}
              data-tooltip={`Copy full authority address: ${solAccount.authority}`}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {solAccount && solAccount.token_mint && (
        <div className="credential-row">
          <span className="credential-sub-lbl mono">Token Mint:</span>
          <div className="sol-owner-row">
            <span
              className="sol-owner-id-code mono"
              data-tooltip={`Token Mint: ${solAccount.token_mint} (Click to copy)`}
              onClick={() => {
                navigator.clipboard.writeText(solAccount.token_mint!);
                toast("Token Mint copied to clipboard", "success");
              }}
            >
              {solAccount.token_mint}
            </span>
            <button
              type="button"
              className="btn-credential-action btn-copy-owner-id"
              onClick={() => {
                navigator.clipboard.writeText(solAccount.token_mint!);
                toast("Token Mint copied to clipboard", "success");
              }}
              data-tooltip={`Copy full token mint: ${solAccount.token_mint}`}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {solAccount && !solAccount.is_system_program && (
        <div className="sol-non-standard-alert">
          {solAccount.account_type === "nonce_account" ? (
            <>
              <b>Durable Nonce Account:</b> This is a Durable Nonce account (80-byte size). The balance of{" "}
              {solAccount.sol_balance} SOL is rent reserve. Validators reject standard native transfers against rent
              reserves. Withdraw balances using a <code>nonceWithdraw</code> instruction signed by the Nonce
              Authority ({solAccount.authority ? shortAddr(solAccount.authority) : "listed above"}).
            </>
          ) : solAccount.account_type === "token_account" ? (
            <>
              <b>SPL Token Account (ATA):</b> This is an SPL Token Account / Wrapped SOL. Reclaiming the SOL rent
              reserve requires closing the token account via a Token Program <code>closeAccount</code> instruction.
            </>
          ) : (
            <>
              <b>Custom Program Account:</b> This account is managed by program <code>{solAccount.owner}</code>.
              Standard native transfers cannot debit funds directly.
            </>
          )}
        </div>
      )}
    </div>
  );
}
