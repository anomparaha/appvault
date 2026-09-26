import React from "react";
import { createPortal } from "react-dom";
import type { UseAppUpdaterReturn } from "../../context/hooks/useAppUpdater";
import { APP_VERSION } from "../../version";

interface UpdateModalProps {
  updater: UseAppUpdaterReturn;
  currentVersion?: string;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  updater,
  currentVersion = APP_VERSION,
  onClose,
}) => {
  const {
    newVersion,
    releaseNotes,
    downloading,
    downloadProgress,
    readyToRestart,
    error,
    downloadAndInstall,
    restartApp,
  } = updater;

  return createPortal(
    <div className="update-modal-overlay" onClick={onClose}>
      <div
        className="update-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="update-dialog-title"
      >
        {/* Header */}
        <div className="update-modal-header">
          <div className="update-modal-title-wrap">
            <div className="update-modal-icon">🚀</div>
            <div>
              <h3 id="update-dialog-title">Plurivex Update Available</h3>
              <p className="update-modal-subtitle">
                A new version is ready to install with cryptographic signature verification.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="update-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Version Badge Comparison */}
        <div className="update-version-pills">
          <div className="version-pill current">
            <span className="pill-label">Current Version</span>
            <span className="pill-val">v{currentVersion}</span>
          </div>
          <div className="version-arrow">→</div>
          <div className="version-pill latest">
            <span className="pill-label">Latest Version</span>
            <span className="pill-val">v{newVersion || "New"}</span>
          </div>
        </div>

        {/* Release Notes */}
        {releaseNotes && (
          <div className="update-changelog-wrap">
            <div className="update-changelog-header">Release Notes &amp; Changelog:</div>
            <div className="update-changelog-body">{releaseNotes}</div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="update-error-banner">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Download Progress Bar */}
        {downloading && (
          <div className="update-progress-wrap">
            <div className="update-progress-info">
              <span>Downloading signed official release...</span>
              <span className="update-progress-pct">{downloadProgress}%</span>
            </div>
            <div className="update-progress-bar-bg">
              <div
                className="update-progress-bar-fill"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <div className="update-progress-subtext">
              Verifying Minisign digital signature and hash integrity.
            </div>
          </div>
        )}

        {/* Ready to Restart Banner */}
        {readyToRestart && (
          <div className="update-ready-banner">
            <div className="ready-icon">✅</div>
            <div>
              <b>Update Successfully Prepared!</b>
              <p>Click the button below to restart Plurivex into the new version.</p>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="update-modal-actions">
          {!readyToRestart && !downloading && (
            <>
              <button
                type="button"
                className="btn-update-dismiss"
                onClick={onClose}
              >
                Remind Me Later
              </button>
              <button
                type="button"
                className="btn-update-download"
                onClick={downloadAndInstall}
              >
                Download &amp; Install Now
              </button>
            </>
          )}

          {downloading && (
            <button type="button" className="btn-update-downloading" disabled>
              Downloading ({downloadProgress}%)…
            </button>
          )}

          {readyToRestart && (
            <button
              type="button"
              className="btn-update-restart"
              onClick={restartApp}
            >
              🚀 Restart Application Now
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
