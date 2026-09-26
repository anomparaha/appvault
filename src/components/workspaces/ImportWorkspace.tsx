import React, { useRef, useState, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { getExistingFingerprints } from "../../lib/db/db";
import {
  collectFilesFromDataTransfer,
  countByType,
  formatBreadcrumb,
  processFilesStreaming,
  smartNormalizeInput,
  smartNormalizeInputNative,
  type FileScanReport,
  type ReadImportProgress,
} from "../../lib/wallets/extract";
import { canonicalKey, classify } from "../../lib/wallets/wallet";
import { walletFingerprintsBatch } from "../../lib/crypto/fingerprint";
import { isValidMnemonic, isBip39Word } from "../../lib/wallets/bip39-wordlist";
import {
  IconArrowLeft,
  IconFolder,
  IconImport,
  IconKey,
  IconSeed,
  IconUpload,
  IconCheckCircle,
} from "../../icons";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke, isTauri } from "@tauri-apps/api/core";

type SourceMode = "all" | "seed";

interface ImportWorkspaceProps {
  onBack?: () => void;
  onComplete?: () => void;
}

export function ImportWorkspace({ onBack, onComplete }: ImportWorkspaceProps) {
  const { importWallets, sessionToken, toast } = useApp();

  // Step 1 = Source & Upload / Input, Step 2 = Verification & Commit
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [activeMode, setActiveMode] = useState<SourceMode>("all");
  const [seedTargetLength, setSeedTargetLength] = useState<12 | 15 | 18 | 21 | 24>(12);

  // Input & Parsing State
  const [raw, setRaw] = useState<string>("");
  const [stagedWallets, setStagedWallets] = useState<string[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [parsing, setParsing] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [readProgress, setReadProgress] = useState<ReadImportProgress | null>(null);
  const [scanReport, setScanReport] = useState<FileScanReport | null>(null);

  // Hidden file inputs
  const txtInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const seedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const mainTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Seed phrase live validation analysis
  const seedAnalysis = useMemo(() => {
    const words = raw
      .replace(/[0-9]+[.:)\-]\s*/g, " ")
      .replace(/[,;\n\r\t]/g, " ")
      .trim()
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
      .filter(Boolean);
    const validCount = words.filter(isBip39Word).length;
    const isValid = words.length >= 12 && isValidMnemonic(words.join(" "));
    const isTargetCount = words.length === seedTargetLength;
    const isReady = isTargetCount && isValid;
    return { words, validCount, isValid, isTargetCount, isReady };
  }, [raw, seedTargetLength]);

  // Parse discovered candidates
  const candidateWallets = useMemo(() => {
    if (stagedWallets && stagedWallets.length > 0) return stagedWallets;
    if (!raw.trim()) return [];

    if (activeMode === "seed") {
      if (seedAnalysis.isReady) {
        return [seedAnalysis.words.join(" ")];
      }
      return [];
    }

    // In 'all' mode: rigorously extract and validate wallets
    return smartNormalizeInput(raw);
  }, [stagedWallets, raw, activeMode, seedAnalysis]);

  const candidateCounts = useMemo(() => {
    return countByType(candidateWallets);
  }, [candidateWallets]);

  // Handle file streaming from input or drop
  const handleFiles = async (
    files: FileList | File[],
    sourceLabel?: string,
    _type: "folder" | "file" | "drop" = "file"
  ) => {
    setParsing(true);
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
        sessionToken
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
        statusMessage = `Discovered ${summary.total} valid wallets from ${label}!`;
        isSuccess = true;
      } else if (summary.skippedDuplicate > 0) {
        statusMessage = `All ${summary.skippedDuplicate} wallets found in ${label} already exist in your vault.`;
      } else {
        statusMessage = `No valid private keys or seed phrases detected in ${label}.`;
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

      if (summary.total > 0) {
        setCurrentStep(2);
        toast(statusMessage, "success");
      } else if (summary.skippedDuplicate > 0) {
        toast("All discovered wallets already exist in vault", "info");
      } else {
        toast("No valid wallets discovered in selected files", "error");
      }
    } catch (err) {
      console.error("handleFiles error:", err);
      toast(`Scan failed: ${String(err)}`, "error");
    } finally {
      setParsing(false);
      setReadProgress(null);
    }
  };

  const onTxtPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (parsing || loading) return;
    const files = e.target.files;
    if (files?.length) await handleFiles(files, undefined, "file");
    e.target.value = "";
  };

  const onJsonPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

      for (let i = 0; i < scanRes.files.length; i++) {
        const file = scanRes.files[i];
        if (i % 10 === 0 || i === scanRes.files.length - 1) {
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
                const fp = fps[j];
                if (fp && seenFp.has(fp)) {
                  skippedDuplicate++;
                } else {
                  if (fp) seenFp.add(fp);
                  newWallets.push(newFromThisFile[j]);
                }
              }
            } catch {
              for (const w of newFromThisFile) newWallets.push(w);
            }
          } else {
            for (const w of newFromThisFile) newWallets.push(w);
          }
        }
      }

      setStagedWallets(newWallets);
      setRaw(newWallets.join("\n"));

      let statusMessage = "";
      let isSuccess = false;

      if (newWallets.length > 0 && skippedDuplicate > 0) {
        statusMessage = `Found ${newWallets.length + skippedDuplicate} wallets (${newWallets.length} new ready to import, ${skippedDuplicate} duplicates skipped).`;
        isSuccess = true;
      } else if (newWallets.length > 0) {
        statusMessage = `Discovered ${newWallets.length} valid wallets from ${scanRes.folder_name}!`;
        isSuccess = true;
      } else if (skippedDuplicate > 0) {
        statusMessage = `All ${skippedDuplicate} wallets found in ${scanRes.folder_name} already exist in your vault.`;
      } else {
        statusMessage = `No valid credentials detected in ${scanRes.folder_name}.`;
      }

      const counts = countByType(newWallets);
      setScanReport({
        folderName: scanRes.folder_name,
        totalFiles: scanRes.total_files_visited,
        textCandidateCount: scanRes.text_files_read,
        textReadCount: scanRes.text_files_read,
        skippedBinaryCount: scanRes.skipped_count,
        skippedCorruptCount: 0,
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
        setCurrentStep(2);
        toast(statusMessage, "success");
      } else if (skippedDuplicate > 0) {
        toast("All wallets already in vault", "info");
      } else {
        toast("No valid wallets discovered in directory", "error");
      }
    } catch (err) {
      console.error("Native folder scan failed:", err);
      toast(`Native scan failed: ${String(err)}`, "error");
    } finally {
      setParsing(false);
      setReadProgress(null);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (parsing || loading) return;
    setDragOver(false);
    setParsing(true);
    setReadProgress({ stage: "traversing", current: 0, total: 0, path: "Traversing drop target…" });
    try {
      const files = await collectFilesFromDataTransfer(e.dataTransfer, (p) => setReadProgress(p));
      if (files.length) {
        await handleFiles(files, undefined, "drop");
      }
    } finally {
      setParsing(false);
      setReadProgress(null);
    }
  };

  const commitToVault = async () => {
    if (candidateWallets.length === 0 || loading || parsing) return;
    setLoading(true);
    try {
      const res = await importWallets(candidateWallets);
      const added = res.added ?? 0;
      const skipped = res.skipped ?? 0;

      if (added > 0 && skipped > 0) {
        toast(`${added} wallets added · ${skipped} duplicates skipped`, "info");
      } else if (added > 0) {
        toast(`${added} wallets securely imported to vault!`, "success");
      } else if (skipped > 0) {
        toast("All duplicates — no new wallets added", "info");
      } else {
        toast("No valid wallets found", "error");
      }

      if (added > 0) {
        setRaw("");
        setStagedWallets(null);
        setScanReport(null);
        onComplete?.();
      }
    } catch (err) {
      console.error("Failed to commit wallets to vault:", err);
      toast(`Import failed: ${String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="import-workspace-view">
      {/* Hidden File / Folder Inputs */}
      <input
        type="file"
        ref={txtInputRef}
        onChange={onTxtPick}
        multiple
        accept=".txt,.csv,.log,.tsv,.text"
        style={{ display: "none" }}
      />
      <input
        type="file"
        ref={jsonInputRef}
        onChange={onJsonPick}
        multiple
        accept=".json"
        style={{ display: "none" }}
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={onFolderPick}
        style={{ display: "none" }}
        {...({ webkitdirectory: "", directory: "" } as any)}
      />

      {/* Page Header */}
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            {onBack && (
              <button
                type="button"
                className="btn sm"
                onClick={onBack}
                style={{ height: "26px", padding: "0 8px" }}
              >
                <IconArrowLeft size={13} />
                <span>Back</span>
              </button>
            )}
            <h1>Import Wallet</h1>
          </div>
          <p>Import wallets from files, folders, or recovery phrases into your local encrypted vault.</p>
        </div>

        <div className="page-head-actions">
          <span
            className="import-sec-badge"
            data-tooltip="Parsed in temporary RAM only. Cleared automatically after import."
            data-tooltip-pos="bottom"
          >
            <span className="sec-dot" />
            Local RAM Only
          </span>
          <span
            className="import-sec-badge"
            data-tooltip="Runs locally on this device. Keys never touch a server or network."
            data-tooltip-pos="bottom"
          >
            <span className="sec-dot" />
            Zero-Cloud Shield
          </span>
          <span
            className="import-sec-badge"
            data-tooltip="Encrypted on disk with Argon2id and AES-256-GCM using your master password."
            data-tooltip-pos="bottom"
          >
            <span className="sec-dot" />
            Argon2id Encrypted
          </span>
        </div>
      </div>

      {/* 2-Step Streamlined Navigation */}
      <div className="import-steps-bar">
        <button
          type="button"
          className={`import-step-item ${currentStep === 1 ? "is-active" : "is-done"}`}
          onClick={() => setCurrentStep(1)}
        >
          <span className="step-num">1</span>
          <span>Source &amp; Upload</span>
        </button>

        <div className="import-step-divider" />

        <button
          type="button"
          className={`import-step-item ${currentStep === 2 ? "is-active" : ""}`}
          disabled={candidateWallets.length === 0}
          onClick={() => {
            if (candidateWallets.length > 0) setCurrentStep(2);
          }}
        >
          <span className="step-num">2</span>
          <span>Verification &amp; Import</span>
        </button>
      </div>

      {/* STEP 1: Direct Action Cards & Unified Input */}
      {currentStep === 1 && (
        <div>
          <div className="sec-title" style={{ marginBottom: "14px" }}>
            <h3 style={{ fontSize: "13.5px", fontWeight: 650, color: "var(--text)" }}>
              Choose Import Source or Click to Upload Directly
            </h3>
          </div>

          {/* 4 Direct Action Cards */}
          <div className="import-src-grid">
            {/* Card 1: TXT / CSV */}
            <div
              className="import-src-card no-tooltip"
              data-no-tooltip="true"
              onClick={() => {
                setActiveMode("all");
                txtInputRef.current?.click();
              }}
            >
              <div className="src-icon-box">
                <IconUpload size={22} />
              </div>
              <h4>TXT / CSV File</h4>
              <p>Plain text backup lists with private keys, hex strings, or addresses.</p>
              <span className="src-card-action">
                <IconUpload size={11} /> Browse Files ↗
              </span>
            </div>

            {/* Card 2: JSON Keystore */}
            <div
              className="import-src-card no-tooltip"
              data-no-tooltip="true"
              onClick={() => {
                setActiveMode("all");
                jsonInputRef.current?.click();
              }}
            >
              <div className="src-icon-box">
                <IconKey size={22} />
              </div>
              <h4>JSON / Keystore</h4>
              <p>Encrypted JSON keystore files exported from MetaMask or MyEtherWallet.</p>
              <span className="src-card-action">
                <IconKey size={11} /> Browse JSON ↗
              </span>
            </div>

            {/* Card 3: Deep Folder Scan */}
            <div
              className="import-src-card no-tooltip"
              data-no-tooltip="true"
              onClick={() => {
                setActiveMode("all");
                handleNativeFolderPick();
              }}
            >
              <div className="src-icon-box">
                <IconFolder size={22} />
              </div>
              <h4>Deep Folder Scan</h4>
              <p>Recursively scan local directories and subfolders for credentials.</p>
              <span className="src-card-action">
                <IconFolder size={11} /> Select Folder ↗
              </span>
            </div>

            {/* Card 4: Recovery Mnemonic */}
            <div
              className={`import-src-card no-tooltip ${activeMode === "seed" ? "is-selected" : ""}`}
              data-no-tooltip="true"
              onClick={() => {
                setActiveMode("seed");
                setTimeout(() => seedTextareaRef.current?.focus(), 50);
              }}
            >
              <div className="src-icon-box">
                <IconSeed size={22} />
              </div>
              <h4>Recovery Mnemonic</h4>
              <p>12, 15, 18, 21, or 24 BIP-39 secret recovery seed words.</p>
              <span className="src-card-action">
                <IconSeed size={11} /> Enter Phrase ↓
              </span>
            </div>
          </div>

          {/* Dedicated Seed Phrase Editor Deck */}
          {activeMode === "seed" && (
            <div className="import-seed-deck">
              <div className="import-seed-toolbar">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 650, color: "var(--text)" }}>
                    Target Word Length:
                  </span>
                  <div className="import-word-pills">
                    {([12, 15, 18, 21, 24] as const).map((len) => (
                      <button
                        key={len}
                        type="button"
                        className={`import-word-pill ${seedTargetLength === len ? "is-active" : ""}`}
                        onClick={() => setSeedTargetLength(len)}
                      >
                        {len} Words
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {seedAnalysis.isReady ? (
                    <span className="badge b-ok">✓ Valid BIP-39 Seed Phrase</span>
                  ) : seedAnalysis.words.length === seedTargetLength ? (
                    <span className="badge b-danger">⚠️ Invalid Checksum</span>
                  ) : seedAnalysis.words.length > 0 ? (
                    <span className="badge b-warn">
                      {seedAnalysis.words.length} / {seedTargetLength} words ({seedAnalysis.validCount} valid BIP-39)
                    </span>
                  ) : (
                    <span className="badge b-ghost">Enter {seedTargetLength} BIP-39 words</span>
                  )}
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setActiveMode("all")}
                    style={{ fontSize: "10.5px" }}
                  >
                    Switch to All Formats
                  </button>
                </div>
              </div>

              <div
                className="import-workspace-dropzone"
                style={{ minHeight: "140px" }}
              >
                <textarea
                  ref={seedTextareaRef}
                  className="import-workspace-textarea"
                  style={{ minHeight: "140px" }}
                  value={raw}
                  placeholder={`Type or paste your ${seedTargetLength} BIP-39 secret seed recovery words separated by spaces...`}
                  onChange={(e) => {
                    setRaw(e.target.value);
                    setStagedWallets(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      if (seedAnalysis.isReady) setCurrentStep(2);
                    }
                  }}
                />
              </div>

              <div className="import-step-footer" style={{ marginTop: "14px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                  Words detected: <b style={{ color: "var(--text)" }}>{seedAnalysis.words.length}</b>
                  {!seedAnalysis.isTargetCount ? (
                    <span style={{ marginLeft: "6px", color: "var(--warning, #f59e0b)" }}>
                      (Requires exactly {seedTargetLength} words)
                    </span>
                  ) : !seedAnalysis.isValid ? (
                    <span style={{ marginLeft: "6px", color: "var(--danger, #f87171)" }}>
                      (Invalid checksum — check words)
                    </span>
                  ) : (
                    <span style={{ marginLeft: "6px", color: "var(--ok, #10b981)" }}>
                      (Valid seed phrase ready to import)
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!seedAnalysis.isReady}
                  onClick={() => {
                    if (seedAnalysis.isReady) setCurrentStep(2);
                  }}
                >
                  {!seedAnalysis.isTargetCount
                    ? `Enter ${Math.max(0, seedTargetLength - seedAnalysis.words.length)} More Words (${seedAnalysis.words.length}/${seedTargetLength})`
                    : !seedAnalysis.isValid
                    ? "Invalid Seed Checksum"
                    : "Review & Verify Seed (1) →"}
                </button>
              </div>
            </div>
          )}

          {/* Unified Dropzone & Paste Deck (for all formats) */}
          {activeMode === "all" && (
            <div className="import-input-deck">
              {/* Quick Actions Bar */}
              <div className="import-actions-bar">
                <div className="import-quick-tools">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={handleNativeFolderPick}
                    disabled={parsing || loading}
                  >
                    <IconFolder size={13} />
                    <span>Scan Folder</span>
                  </button>

                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => txtInputRef.current?.click()}
                    disabled={parsing || loading}
                  >
                    <IconUpload size={13} />
                    <span>Pick Files</span>
                  </button>

                  {raw && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        setRaw("");
                        setStagedWallets(null);
                        setScanReport(null);
                      }}
                    >
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                <span className="mono" style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                  Shortcut: <b style={{ color: "var(--text)" }}>Ctrl + Enter</b> to review
                </span>
              </div>

              {/* Live Progress Bar */}
              {parsing && readProgress && (
                <div className="import-live-progress">
                  <div className="import-live-header">
                    <div className="import-live-spinner" />
                    <div className="import-live-text">
                      <span className="import-live-title">
                        {readProgress.stage === "traversing"
                          ? "Traversing folder structure…"
                          : `Processing file (${readProgress.current}/${readProgress.total})`}
                      </span>
                      <span className="import-live-path" title={readProgress.path}>
                        {formatBreadcrumb(readProgress.path)}
                      </span>
                    </div>
                  </div>
                  {readProgress.total > 0 && (
                    <div className="import-live-bar-wrap" style={{ marginTop: "8px" }}>
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

              {/* Dropzone with Textarea */}
              <div
                className={`import-workspace-dropzone ${dragOver ? "is-dragover" : ""}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (!parsing) setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!parsing) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                {!raw.trim() && !parsing && !scanReport && (
                  <div className="import-dropzone-placeholder">
                    <IconImport size={28} />
                    <b>Drag &amp; drop files, folders, or paste keys directly</b>
                    <span>Supports 12/24 BIP-39 mnemonic seeds, 64-hex EVM keys, and base58 Solana keys</span>
                  </div>
                )}

                <textarea
                  ref={mainTextareaRef}
                  className="import-workspace-textarea"
                  value={raw}
                  disabled={parsing}
                  onChange={(e) => {
                    setRaw(e.target.value);
                    setStagedWallets(null);
                    if (!e.target.value.trim() && scanReport) {
                      setScanReport(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      if (candidateWallets.length > 0) {
                        setCurrentStep(2);
                      }
                    }
                  }}
                  placeholder=""
                />
              </div>

              {/* Live Detected Counter Badges */}
              {candidateWallets.length > 0 && (
                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className="badge b-acc">{candidateWallets.length} Candidates Detected</span>
                  {candidateCounts.seedCount > 0 && (
                    <span className="badge b-ghost">{candidateCounts.seedCount} Seed Phrases</span>
                  )}
                  {candidateCounts.pkCount > 0 && (
                    <span className="badge b-ghost">{candidateCounts.pkCount} EVM Private Keys</span>
                  )}
                  {candidateCounts.solCount > 0 && (
                    <span className="badge b-ghost">{candidateCounts.solCount} Solana Keys</span>
                  )}
                </div>
              )}

              <div className="import-step-footer" style={{ marginTop: "16px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                  Detected: <b style={{ color: "var(--text)" }}>{candidateWallets.length} valid credentials</b>
                </span>
                <button
                  type="button"
                  className="btn primary"
                  disabled={candidateWallets.length === 0 || parsing}
                  onClick={() => setCurrentStep(2)}
                >
                  Review &amp; Verify ({candidateWallets.length}) →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Verification & Vault Commit */}
      {currentStep === 2 && (
        <div>
          <div className="sec-title" style={{ marginBottom: "14px" }}>
            <h3 style={{ fontSize: "13.5px", fontWeight: 650, color: "var(--text)" }}>
              2. Verify Discovered Wallets &amp; Import to Vault
            </h3>
          </div>

          <div className="import-results-deck">
            {/* Banner */}
            <div className="import-banner-success">
              <div className="import-banner-icon">
                <IconCheckCircle size={20} />
              </div>
              <div className="import-banner-text">
                <b>{candidateWallets.length} Wallets Ready to Import</b>
                <span>Duplicate keys already in your vault will be skipped automatically.</span>
              </div>
            </div>

            {/* Wallets List Preview */}
            <div className="import-discovered-list">
              {candidateWallets.map((item, idx) => {
                const type = classify(item);
                const isSeed = type === "seed";
                const isSol = type === "sol_pk";
                const isEvm = type === "pk";

                const displaySnippet = isSeed
                  ? `${item.split(/\s+/).slice(0, 3).join(" ")} … (${item.split(/\s+/).length} words)`
                  : item.length > 20
                  ? `${item.slice(0, 8)}…${item.slice(-6)}`
                  : item;

                return (
                  <div key={idx} className="import-discovered-row">
                    <div className="import-discovered-left">
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-dim)", width: "24px" }}>
                        #{idx + 1}
                      </span>
                      {isSeed ? (
                        <span className="badge b-acc">
                          <IconSeed size={10} /> Seed Phrase
                        </span>
                      ) : isSol ? (
                        <span className="badge b-ok">
                          <IconKey size={10} /> Solana PK
                        </span>
                      ) : isEvm ? (
                        <span className="badge b-acc">
                          <IconKey size={10} /> EVM PK
                        </span>
                      ) : (
                        <span className="badge b-ghost">Raw Credential</span>
                      )}
                      <span className="import-discovered-addr">{displaySnippet}</span>
                    </div>

                    <span className="badge b-ok" style={{ height: "18px", fontSize: "9px" }}>
                      Ready
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="import-step-footer">
            <div className="import-footer-left">
              <button
                type="button"
                className="btn"
                onClick={() => setCurrentStep(1)}
                disabled={loading}
              >
                ← Back to Source &amp; Edit
              </button>
            </div>
            <div className="import-footer-right">
              <button
                type="button"
                className="btn primary"
                onClick={commitToVault}
                disabled={candidateWallets.length === 0 || loading || parsing}
                style={{ minWidth: "160px" }}
              >
                {loading ? "Importing to Vault…" : `Import ${candidateWallets.length} Wallets →`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
