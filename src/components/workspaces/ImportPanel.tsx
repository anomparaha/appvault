import { useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import { getExistingFingerprints } from "../../lib/db/db";
import {
  collectFilesFromDataTransfer,
  countByType,
  formatBreadcrumb,
  processFilesStreaming,
  smartNormalizeInputNative,
  type FileScanReport,
  type ReadImportProgress,
} from "../../lib/wallets/extract";
import { canonicalKey } from "../../lib/wallets/wallet";
import { walletFingerprint, walletFingerprintsBatch } from "../../lib/crypto/fingerprint";
import { IconFolder, IconImport, IconKey, IconSeed, IconUpload } from "../../icons";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { MnemonicRepairModal } from "../modals/MnemonicRepairModal";

interface ImportPanelProps {
  floating?: boolean;
  onClose?: () => void;
}

export function ImportPanel({ floating = false, onClose }: ImportPanelProps) {
  const { importWallets, sessionToken, toast } = useApp();
  const [raw, setRaw] = useState("");
  const [stagedWallets, setStagedWallets] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsingType, setParsingType] = useState<"folder" | "file" | "drop" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [readProgress, setReadProgress] = useState<ReadImportProgress | null>(null);
  const [scanReport, setScanReport] = useState<FileScanReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isRepairOpen, setIsRepairOpen] = useState(false);

  const apply = async () => {
    if ((!raw.trim() && (!stagedWallets || !stagedWallets.length)) || loading || parsing) return;
    setLoading(true);
    try {
      let payload: string | string[];
      if (stagedWallets && stagedWallets.length > 0) {
        payload = stagedWallets;
      } else {
        payload = raw
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"))
          .join("\n");
      }
      const { added, skipped } = await importWallets(payload);
      setRaw("");
      setStagedWallets(null);
      setScanReport(null);

      if (added > 0 && skipped > 0) {
        toast(`${added} wallets added · ${skipped} duplicates skipped`, "info");
      } else if (added > 0) {
        toast(`${added} wallets added`, "success");
      } else if (skipped > 0) {
        toast("All duplicates — no new wallets found", "error");
      } else {
        toast("No valid wallets found", "error");
      }
      if (added > 0) onClose?.();
    } catch (err) {
      console.error("Import failed:", err);
      toast(`Import failed: ${String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = async (files: FileList | File[], sourceLabel?: string, type: "folder" | "file" | "drop" = "file") => {
    setParsing(true);
    setParsingType(type);
    setScanReport(null);
    setReadProgress({
      stage: "reading",
      current: 0,
      total: files.length,
      path: "Initializing file scanner…",
    });

    try {
      const existing = await getExistingFingerprints(sessionToken);
      const summary = await processFilesStreaming(
        files,
        existing,
        (p) => setReadProgress(p),
        sessionToken,
      );

      const label = sourceLabel ?? summary.fileReport.folderName ?? `${summary.fileReport.totalFiles} files`;
      setStagedWallets(summary.wallets);

      setRaw(summary.wallets.join("\n"));

      let statusMessage = "";
      let isSuccess = false;

      if (summary.total > 0 && summary.skippedDuplicate > 0) {
        statusMessage = `Found ${summary.foundTotal} wallets (${summary.total} new ready to import, ${summary.skippedDuplicate} duplicates already in vault).`;
        isSuccess = true;
      } else if (summary.total > 0) {
        statusMessage = `Found ${summary.total} new wallets (${summary.seedCount} Seed Phrases, ${summary.pkCount} EVM PKs, ${summary.solCount} Solana PKs).`;
        isSuccess = true;
      } else if (summary.skippedDuplicate > 0) {
        statusMessage = `All ${summary.skippedDuplicate} wallets found in this folder already exist in your vault (duplicates).`;
        isSuccess = false;
      } else if (summary.fileReport.textReadCount === 0) {
        statusMessage = summary.fileReport.unreadableCount > 0
          ? `All ${summary.fileReport.unreadableCount} text files could not be read due to file locks or OneDrive cloud syncing.`
          : `No supported text files found (discovered ${summary.fileReport.totalFiles} binary/media files).`;
        isSuccess = false;
      } else {
        statusMessage = `Scan complete: Out of ${summary.fileReport.textReadCount} text files scanned, no valid BIP-39 seed phrases or 64-hex/Solana private keys were found.`;
        isSuccess = false;
      }

      if (summary.fileReport.unreadableCount > 0 && summary.fileReport.textReadCount > 0) {
        statusMessage += ` · Note: ${summary.fileReport.unreadableCount} locked/cloud files were skipped.`;
      }

      setScanReport({
        folderName: label,
        totalFiles: summary.fileReport.totalFiles,
        textCandidateCount: summary.fileReport.textCandidateCount,
        textReadCount: summary.fileReport.textReadCount,
        skippedBinaryCount: summary.fileReport.skippedBinaryCount,
        skippedCorruptCount: summary.fileReport.skippedCorruptCount,
        unreadableCount: summary.fileReport.unreadableCount,
        foundWalletsTotal: summary.foundTotal,
        newWalletsCount: summary.total,
        duplicateCount: summary.skippedDuplicate,
        seedCount: summary.seedCount,
        pkCount: summary.pkCount,
        solCount: summary.solCount,
        statusMessage,
        isSuccess,
      });

      if (isSuccess) {
        toast(statusMessage, "success");
      } else if (summary.skippedDuplicate > 0) {
        toast("All duplicates — no new wallets found", "info");
      } else {
        toast("No valid wallets found", "error");
      }
    } catch (err) {
      console.error("handleFiles error:", err);
      toast(`Scan failed: ${String(err)}`, "error");
    } finally {
      setParsing(false);
      setParsingType(null);
      setReadProgress(null);
    }
  };

  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (parsing || loading) return;
    const files = e.target.files;
    if (files?.length) await handleFiles(files, undefined, "file");
    e.target.value = "";
  };

  const onFolderPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (parsing || loading) return;
    const files = e.target.files;
    if (!files?.length) return;
    const first = files[0] as File & { webkitRelativePath?: string };
    const folder = first.webkitRelativePath?.split("/")[0] ?? "folder";
    await handleFiles(files, folder, "folder");
    e.target.value = "";
  };

  const handleNativeFolderPick = async () => {
    if (parsing || loading) return;
    try {
      let folderPath: string | null = null;
      if (isTauri()) {
        const selected = await openDialog({
          directory: true,
          multiple: false,
          title: "Select Folder to Scan for Wallets",
        });
        if (!selected) return;
        folderPath = typeof selected === "string" ? selected : selected[0];
      } else {
        folderInputRef.current?.click();
        return;
      }

      if (!folderPath) return;

      setParsing(true);
      setParsingType("folder");
      setScanReport(null);
      setReadProgress({
        stage: "traversing",
        current: 0,
        total: 0,
        path: `Scanning ${folderPath}…`,
      });

      interface NativeFileContent {
        path: string;
        content: string;
      }

      interface NativeScanResult {
        folder_name: string;
        total_files_visited: number;
        text_files_read: number;
        skipped_count: number;
        files: NativeFileContent[];
      }

      const scanRes = await invoke<NativeScanResult>("scan_directory_native", { path: folderPath });

      setReadProgress({
        stage: "reading",
        current: 0,
        total: scanRes.files.length,
        path: `Parsing ${scanRes.text_files_read} candidate files…`,
      });

      const existing = await getExistingFingerprints(sessionToken);
      const uniqueWallets = new Set<string>();
      const seenFp = new Set<string>(existing);
      const newWallets: string[] = [];
      let skippedDuplicate = 0;
      let skippedErrors = 0;
      let lastTime = 0;

      for (let i = 0; i < scanRes.files.length; i++) {
        const file = scanRes.files[i];
        const now = performance.now();
        if (now - lastTime > 80 || i === scanRes.files.length - 1) {
          lastTime = now;
          setReadProgress({
            stage: "reading",
            current: i + 1,
            total: scanRes.files.length,
            path: file.path,
          });
          await new Promise((r) => setTimeout(r, 0));
        }

        const foundInFile = await smartNormalizeInputNative(file.content);
        const newFromThisFile: string[] = [];
        for (const wallet of foundInFile) {
          const canon = canonicalKey(wallet);
          if (uniqueWallets.has(canon)) continue;
          uniqueWallets.add(canon);
          newFromThisFile.push(wallet);
        }

        if (newFromThisFile.length > 0) {
          if (sessionToken && newFromThisFile.length > 1) {
            try {
              const fps = await walletFingerprintsBatch(newFromThisFile, sessionToken);
              for (let j = 0; j < newFromThisFile.length; j++) {
                const w = newFromThisFile[j];
                const fp = fps[j];
                if (seenFp.has(fp)) {
                  skippedDuplicate++;
                } else {
                  seenFp.add(fp);
                  newWallets.push(w);
                }
              }
            } catch {
              for (const wallet of newFromThisFile) {
                try {
                  const fp = await walletFingerprint(wallet, sessionToken);
                  if (seenFp.has(fp)) {
                    skippedDuplicate++;
                  } else {
                    seenFp.add(fp);
                    newWallets.push(wallet);
                  }
                } catch {
                  skippedErrors++;
                }
              }
            }
          } else if (sessionToken) {
            for (const wallet of newFromThisFile) {
              try {
                const fp = await walletFingerprint(wallet, sessionToken);
                if (seenFp.has(fp)) {
                  skippedDuplicate++;
                } else {
                  seenFp.add(fp);
                  newWallets.push(wallet);
                }
              } catch {
                skippedErrors++;
              }
            }
          }
        }
      }

      const counts = countByType(newWallets);
      setStagedWallets(newWallets);

      setRaw(newWallets.join("\n"));

      let statusMessage = "";
      let isSuccess = false;

      if (newWallets.length > 0 && skippedDuplicate > 0) {
        statusMessage = `Deep scan complete: Dissected ${scanRes.total_files_visited.toLocaleString()} files across all subdirectories (including AppData, node_modules, .git). Found ${newWallets.length + skippedDuplicate} wallets (${newWallets.length} new ready to import, ${skippedDuplicate} duplicates).`;
        isSuccess = true;
      } else if (newWallets.length > 0) {
        statusMessage = `Deep scan complete: Dissected ${scanRes.total_files_visited.toLocaleString()} files across all subdirectories (including AppData, node_modules, .git). Found ${newWallets.length} new wallets (${counts.seedCount} Seeds, ${counts.pkCount} EVM PKs, ${counts.solCount} Solana PKs).`;
        isSuccess = true;
      } else if (skippedDuplicate > 0) {
        statusMessage = `Deep scan complete: Dissected ${scanRes.total_files_visited.toLocaleString()} files. All ${skippedDuplicate} wallets found already exist in your vault (duplicates).`;
        isSuccess = false;
      } else if (scanRes.text_files_read === 0) {
        statusMessage = `Deep scan complete: Dissected ${scanRes.total_files_visited.toLocaleString()} files across all subdirectories. No text files containing wallet patterns were detected.`;
        isSuccess = false;
      } else {
        statusMessage = `Deep scan complete: Dissected ${scanRes.total_files_visited.toLocaleString()} files (${scanRes.text_files_read} candidate files inspected). No valid BIP-39 seeds or private keys were found.`;
        isSuccess = false;
      }

      setScanReport({
        folderName: scanRes.folder_name,
        totalFiles: scanRes.total_files_visited,
        textCandidateCount: scanRes.text_files_read,
        textReadCount: scanRes.text_files_read,
        skippedBinaryCount: scanRes.skipped_count,
        skippedCorruptCount: skippedErrors,
        unreadableCount: 0,
        foundWalletsTotal: newWallets.length + skippedDuplicate,
        newWalletsCount: newWallets.length,
        duplicateCount: skippedDuplicate,
        seedCount: counts.seedCount,
        pkCount: counts.pkCount,
        solCount: counts.solCount,
        statusMessage,
        isSuccess,
      });

      if (isSuccess) {
        toast(statusMessage, "success");
      } else if (skippedDuplicate > 0) {
        toast("All duplicates — no new wallets found", "info");
      } else {
        toast("No valid wallets found", "error");
      }
    } catch (err) {
      console.error("handleNativeFolderPick error:", err);
      toast(`Scan failed: ${String(err)}`, "error");
    } finally {
      setParsing(false);
      setParsingType(null);
      setReadProgress(null);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (parsing || loading) return;
    setDragOver(false);
    setParsing(true);
    setParsingType("drop");
    setReadProgress({ stage: "traversing", current: 0, total: 0, path: "Traversing folder…" });
    try {
      const files = await collectFilesFromDataTransfer(e.dataTransfer, (p) => setReadProgress(p));
      if (files.length) {
        await handleFiles(files, undefined, "drop");
      }
    } finally {
      setParsing(false);
      setParsingType(null);
      setReadProgress(null);
    }
  };

  const uploadButtons = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="import-file-input"
        accept="*/*"
        multiple
        disabled={loading || parsing}
        onChange={onFilePick}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="import-file-input"
        multiple
        disabled={loading || parsing}
        onChange={onFolderPick}
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
      />
      <button
        type="button"
        className={`btn btn-ghost import-file-btn ${parsing && parsingType === "file" ? "is-busy" : ""}`}
        onClick={() => !parsing && !loading && fileInputRef.current?.click()}
        disabled={loading || parsing}
      >
        {parsing && parsingType === "file" ? (
          <>
            <span className="btn-spinner-teal" />
            Reading…
          </>
        ) : (
          <>
            <IconUpload size={14} /> File
          </>
        )}
      </button>
      <button
        type="button"
        className={`btn btn-ghost import-file-btn ${parsing && parsingType === "folder" ? "is-busy" : ""}`}
        onClick={() => !parsing && !loading && handleNativeFolderPick()}
        disabled={loading || parsing}
      >
        {parsing && parsingType === "folder" ? (
          <>
            <span className="btn-spinner-teal" />
            Reading Folder…
          </>
        ) : (
          <>
            <IconFolder size={14} /> Folder
          </>
        )}
      </button>
    </>
  );

  return (
    <div className={`import-panel ${floating ? "import-panel-floating" : ""}`}>
      <div className="import-floating-tags">
        <span className="import-floating-tag">
          <IconSeed size={12} /> 12/24 words
        </span>
        <span className="import-floating-tag">
          <IconKey size={12} /> 64-hex
        </span>
        <span className="import-floating-tag accent">Files + folders</span>
        <button
          type="button"
          className="import-floating-tag"
          style={{ cursor: "pointer", background: "rgba(16, 185, 129, 0.12)", borderColor: "rgba(16, 185, 129, 0.35)", color: "#34d399", fontWeight: 600 }}
          onClick={() => setIsRepairOpen(true)}
          data-tooltip="Open Mnemonic Typo Repair Tool (BIP-39 Levenshtein Heuristic Recovery)"
        >
          🪄 Typo Repair
        </button>
      </div>

      {parsing && readProgress && (
        <div className="import-live-progress">
          <div className="import-live-header">
            <div className="import-live-spinner" />
            <div className="import-live-text">
              <span className="import-live-title">
                {readProgress.stage === "traversing"
                  ? "Traversing folder directory…"
                  : `Reading file (${readProgress.current}/${readProgress.total})`}
              </span>
              <span className="import-live-path" data-tooltip={readProgress.path}>
                {formatBreadcrumb(readProgress.path)}
              </span>
            </div>
          </div>
          {readProgress.total > 0 && (
            <div className="import-live-bar-wrap">
              <div
                className="import-live-bar-fill"
                style={{
                  width: `${Math.min(100, Math.round((readProgress.current / Math.max(readProgress.total, 1)) * 100))}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {scanReport && !parsing && (
        <div className={`scan-report-card ${scanReport.isSuccess ? "is-success" : "is-empty"}`}>
          <div className="scan-report-top">
            <span className="scan-report-folder-name">📁 {scanReport.folderName}</span>
            <span className={`scan-report-badge ${scanReport.isSuccess ? "badge-success" : "badge-neutral"}`}>
              {scanReport.newWalletsCount > 0 ? `${scanReport.newWalletsCount} New Found` : "0 New Wallets"}
            </span>
          </div>

          <div className="scan-report-grid">
            <div className="scan-report-stat">
              <span className="scan-report-stat-lbl">Total Files</span>
              <span className="scan-report-stat-val">{scanReport.totalFiles}</span>
            </div>
            <div className="scan-report-stat">
              <span className="scan-report-stat-lbl">Text Read</span>
              <span className="scan-report-stat-val text-accent">{scanReport.textReadCount}</span>
            </div>
            <div className="scan-report-stat">
              <span className="scan-report-stat-lbl">Non-Text Skipped</span>
              <span className="scan-report-stat-val">{scanReport.skippedBinaryCount + scanReport.skippedCorruptCount}</span>
            </div>
            <div className="scan-report-stat">
              <span className="scan-report-stat-lbl">Duplicates</span>
              <span className="scan-report-stat-val">{scanReport.duplicateCount}</span>
            </div>
          </div>

          <div className="scan-report-msg">
            {scanReport.statusMessage}
          </div>
        </div>
      )}

      <div
        className={`import-dropzone${raw.trim() ? " has-content" : ""}${dragOver ? " is-dragover" : ""}${parsing ? " is-parsing" : ""}`}
        onDragEnter={(e) => { e.preventDefault(); if (!parsing) setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); if (!parsing) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {parsing && (
          <div className="import-dropzone-loading-overlay">
            <div className="loading-radar-wrap">
              <div className="radar-circle-pulse" />
              <div className="radar-circle-pulse outer" />
              <div className="radar-spinner-core">
                {parsingType === "folder" ? <IconFolder size={22} /> : <IconUpload size={22} />}
              </div>
            </div>

            <div className="loading-overlay-info">
              <h4 className="loading-overlay-title">
                {readProgress?.stage === "traversing"
                  ? "Traversing Folder Directory…"
                  : `Reading & Scanning Files (${readProgress?.current || 0}/${readProgress?.total || 0})`}
              </h4>
              <p className="loading-overlay-path">
                {readProgress?.path ? formatBreadcrumb(readProgress.path) : "Discovering text files…"}
              </p>
            </div>

            {readProgress && readProgress.total > 0 && (
              <div className="loading-overlay-progress-box">
                <div className="loading-overlay-bar-wrap">
                  <div
                    className="loading-overlay-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.round((readProgress.current / Math.max(readProgress.total, 1)) * 100))}%`,
                    }}
                  />
                </div>
                <div className="loading-overlay-stat-row">
                  <span>{Math.round((readProgress.current / Math.max(readProgress.total, 1)) * 100)}% parsed</span>
                  <span>{readProgress.current} / {readProgress.total} files</span>
                </div>
              </div>
            )}

            <span className="loading-overlay-hint">
              Processing in background · Please wait
            </span>
          </div>
        )}

        {!raw.trim() && !parsing && !scanReport && (
          <div className="import-dropzone-empty" aria-hidden>
            <span className="import-dropzone-icon">
              <IconImport size={20} />
            </span>
            <span className="import-dropzone-label">Paste, drop files, or drag a folder</span>
            <span className="import-dropzone-hint">Drag folder · subfolders · extensionless files supported</span>
          </div>
        )}
        <textarea
          value={raw}
          disabled={parsing}
          onChange={(e) => {
            const val = e.target.value;
            setRaw(val);
            setStagedWallets(null);
            if (!val.trim() && scanReport) {
              setScanReport(null);
            }
          }}
          placeholder=""
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              apply();
            }
          }}
        />
      </div>

      <div className="import-floating-footer">
        <div className="import-floating-footer-left">
          {uploadButtons}
          <span className="import-hint">Ctrl+Enter to import</span>
        </div>
        <button
          className="btn btn-primary import-floating-btn"
          onClick={apply}
          disabled={(!raw.trim() && (!stagedWallets || !stagedWallets.length)) || loading || parsing}
        >
          {loading
            ? "Processing…"
            : parsing
            ? "Reading…"
            : stagedWallets && stagedWallets.length > 0
            ? `Import ${stagedWallets.length} Wallets →`
            : "Import →"}
        </button>
      </div>

      <MnemonicRepairModal
        isOpen={isRepairOpen}
        initialPhrase={raw}
        onClose={() => setIsRepairOpen(false)}
        onApplyRepairedPhrase={(repaired) => {
          setRaw(repaired);
          toast("Repaired phrase applied to import input!", "success");
        }}
      />
    </div>
  );
}