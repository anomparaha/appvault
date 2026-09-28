import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  current_version: string;
  body?: string | null;
  date?: string | null;
}

interface UpdateProgressPayload {
  chunk_length: number;
  content_length?: number | null;
}

export interface UseAppUpdaterReturn {
  updateAvailable: boolean;
  checking: boolean;
  downloading: boolean;
  downloadProgress: number;
  newVersion: string | null;
  releaseNotes: string | null;
  readyToRestart: boolean;
  error: string | null;
  showModal: boolean;
  setShowModal: (open: boolean) => void;
  checkForUpdates: (silent?: boolean) => Promise<boolean>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
}

export function useAppUpdater(isAirGapped: boolean, sessionToken: string): UseAppUpdaterReturn {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [readyToRestart, setReadyToRestart] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);

  /**
   * Fail-closed update check with Air-Gapped Safe Mode guardrail.
   * Executed via isolated Rust command (vault_updater_check).
   */
  const checkForUpdates = useCallback(
    async (silent: boolean = true): Promise<boolean> => {
      if (!sessionToken) {
        if (!silent) setError("An unlocked vault session is required to check for updates.");
        setUpdateAvailable(false);
        setNewVersion(null);
        setReleaseNotes(null);
        return false;
      }

      // 1. Guardrail Air-Gapped Safe Mode
      try {
        const airGappedActive = await invoke<boolean>("get_air_gapped_mode");
        if (airGappedActive || isAirGapped) {
          if (!silent) {
            setError("Safe Mode is active. This app's updater requests are disabled.");
          }
          setUpdateAvailable(false);
          setNewVersion(null);
          setReleaseNotes(null);
          return false;
        }
      } catch {
        if (isAirGapped) {
          setUpdateAvailable(false);
          return false;
        }
      }

      setChecking(true);
      setError(null);

      try {
        const update = await invoke<UpdateInfo | null>("vault_updater_check", { sessionToken });
        if (update && update.version) {
          setUpdateAvailable(true);
          setNewVersion(update.version);
          setReleaseNotes(update.body ?? null);
          return true;
        } else {
          setUpdateAvailable(false);
          setNewVersion(null);
          setReleaseNotes(null);
          return false;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Reset state fail-closed if check fails
        setUpdateAvailable(false);
        setNewVersion(null);
        setReleaseNotes(null);

        if (!silent) {
          setError(`Failed to check for updates: ${errMsg}`);
        } else {
          console.debug("Updater check notice (silent):", errMsg);
        }
        return false;
      } finally {
        setChecking(false);
      }
    },
    [isAirGapped, sessionToken]
  );

  /**
   * Download new release binary in chunks and verify the Minisign signature in the Rust backend.
   * Fail-closed: resets state completely on network error or invalid signature.
   */
  const downloadAndInstall = useCallback(async () => {
    if (!sessionToken) {
      setError("An unlocked vault session is required to install updates.");
      return;
    }
    if (isAirGapped) {
      setError("Air-Gapped Safe Mode is active. Update downloads are blocked.");
      return;
    }
    if (!newVersion) {
      setError("No update package is ready to download.");
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);
    setError(null);
    setReadyToRestart(false);

    let unlistenProgress: UnlistenFn | null = null;
    let unlistenFinished: UnlistenFn | null = null;
    let downloaded = 0;
    let totalLength = 0;

    try {
      unlistenProgress = await listen<UpdateProgressPayload>("updater-progress", (event) => {
        if (event.payload.content_length && event.payload.content_length > 0) {
          totalLength = event.payload.content_length;
        }
        downloaded += event.payload.chunk_length;
        if (totalLength > 0) {
          const pct = Math.min(100, Math.round((downloaded / totalLength) * 100));
          setDownloadProgress(pct);
        }
      });

      unlistenFinished = await listen("updater-finished", () => {
        setDownloadProgress(100);
        setReadyToRestart(true);
      });

      await invoke("vault_updater_download_and_install", { sessionToken });
      setDownloadProgress(100);
      setReadyToRestart(true);
      try {
        await relaunch();
      } catch (err: unknown) {
        console.debug("Auto-relaunch handled by backend restart:", err);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Fail-closed cleanup: reset restart readiness and progress
      setError(`Failed to download update: ${errMsg}`);
      setReadyToRestart(false);
      setDownloadProgress(0);
    } finally {
      setDownloading(false);
      if (unlistenProgress) {
        unlistenProgress();
      }
      if (unlistenFinished) {
        unlistenFinished();
      }
    }
  }, [newVersion, sessionToken, isAirGapped]);

  /**
   * Restart application immediately to apply new version.
   */
  const restartApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to restart application: ${errMsg}`);
    }
  }, []);

  // Automatic check when app loads (800ms delay), window focus, and periodic polling (every 5 mins)
  useEffect(() => {
    if (isAirGapped || !sessionToken) return;

    // 1. Fast initial check after mount or switching to online mode
    const initialTimer = setTimeout(() => {
      checkForUpdates(true);
    }, 800);

    // 2. Periodic background check every 5 minutes while online
    const intervalTimer = setInterval(() => {
      checkForUpdates(true);
    }, 5 * 60 * 1000);

    // 3. Immediate check when window regains focus (e.g. user switches back from browser)
    const handleFocus = () => {
      checkForUpdates(true);
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAirGapped, sessionToken, checkForUpdates]);

  return {
    updateAvailable,
    checking,
    downloading,
    downloadProgress,
    newVersion,
    releaseNotes,
    readyToRestart,
    error,
    showModal,
    setShowModal,
    checkForUpdates,
    downloadAndInstall,
    restartApp,
  };
}
