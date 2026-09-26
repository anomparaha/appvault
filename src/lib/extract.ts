import { invoke } from "@tauri-apps/api/core";
import bs58 from "bs58";
import { isBase58Line, normalizeSolSecret } from "./solana";
import { walletFingerprint, walletFingerprintsBatch } from "./fingerprint";
import { canonicalKey, classify, isSolanaKeyStr, isValidWalletEntry, normalizeInput } from "./wallet";
import { isBip39Word, isValidMnemonic as isValidSeed } from "./bip39-wordlist";
import { isValidSecp256k1PrivateKey } from "./format";

const MNEMONIC_LENGTHS = [24, 21, 18, 15, 12];
const HASH_CONTEXT =
  /\b(tx[_\s-]?hash|transaction[_\s-]?hash|block[_\s-]?hash|merkle|sha256|keccak|signature|checksum)\b/i;
const LABELED_PK =
  /(?:private\s*key|priv(?:ate)?[\s_-]*key|secret\s*key|wallet\s*key)\s*[:=\s"'(]*(?:0x)?([0-9a-fA-F]{64})\b/gi;

function tokenizeWords(text: string): string[] {
  const safeText = text.length > 500_000 ? text.slice(0, 500_000) : text;
  const words: string[] = [];
  const re = /[a-zA-Z]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(safeText)) !== null) {
    words.push(match[0].toLowerCase());
  }
  return words;
}

function hasExcessiveDuplicateWords(words: string[]): boolean {
  const counts = new Map<string, number>();
  for (const w of words) {
    const c = (counts.get(w) || 0) + 1;
    counts.set(w, c);
    if (words.length <= 12 && c >= 3) return true;
    if (words.length > 12 && c >= 4) return true;
  }
  return counts.size < Math.floor(words.length * 0.7);
}

function extractSeedsFromTokens(tokens: string[]): string[] {
  const found: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    if (!isBip39Word(tokens[i])) {
      i++;
      continue;
    }

    let matched = false;
    for (const len of MNEMONIC_LENGTHS) {
      if (i + len > tokens.length) continue;
      const slice = tokens.slice(i, i + len);
      if (!slice.every(isBip39Word)) continue;
      if (hasExcessiveDuplicateWords(slice)) continue;
      const phrase = slice.join(" ");
      if (isValidSeed(phrase)) {
        found.push(phrase);
        i += len;
        matched = true;
        break;
      }
    }

    if (!matched) i++;
  }

  return found;
}

function extractSplitHexKeys(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const found: string[] = [];
  const seen = new Set<string>();

  const addCombined = (part1: string, part2: string) => {
    const combined = `${part1.replace(/^0x/i, "")}${part2.replace(/^0x/i, "")}`.toLowerCase();
    if (!isValidSecp256k1PrivateKey(combined)) return;
    if (seen.has(combined)) return;
    seen.add(combined);
    found.push(combined);
  };

  for (let i = 0; i < lines.length; i++) {
    const part1 = lines[i].replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{32}$/.test(part1)) continue;
    if (i + 1 >= lines.length) continue;
    const part2 = lines[i + 1].replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{32}$/.test(part2)) continue;
    addCombined(part1, part2);
    i++;
  }

  return found;
}

function extractPrivateKeys(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const addKey = (raw: string) => {
    const hex = raw.trim().replace(/^0x/i, "").toLowerCase();
    if (!isValidSecp256k1PrivateKey(hex)) return;
    if (seen.has(hex)) return;
    seen.add(hex);
    found.push(hex);
  };

  let match: RegExpExecArray | null;
  const labeled = new RegExp(LABELED_PK.source, LABELED_PK.flags);
  while ((match = labeled.exec(text)) !== null) addKey(match[1]);

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || HASH_CONTEXT.test(trimmed)) continue;

    const bareHex = trimmed.replace(/^0x/i, "");
    if (/^[0-9a-fA-F]{64}$/.test(bareHex)) {
      addKey(bareHex);
      continue;
    }

    const numbered = trimmed.match(/^(\d{1,3})[.):\-\]]\s+(.+)$/);
    const content = (numbered ? numbered[2] : trimmed).trim().replace(/^["']|["']$/g, "");
    const hex = content.replace(/^0x/i, "");

    if (/^[0-9a-fA-F]{64}$/.test(hex) && content.split(/\s+/).filter(Boolean).length === 1) {
      addKey(hex);
    }
  }

  return found;
}

function extractSplitSolanaKeys(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const found: string[] = [];
  const seen = new Set<string>();

  const addSecret = (secret: string) => {
    if (!isSolanaKeyStr(secret)) return;
    const norm = normalizeSolSecret(secret);
    const fp = canonicalKey(norm);
    if (seen.has(fp)) return;
    seen.add(fp);
    found.push(norm);
  };

  for (let i = 0; i < lines.length; i++) {
    if (!isBase58Line(lines[i])) continue;
    if (i + 1 >= lines.length || !isBase58Line(lines[i + 1])) continue;

    try {
      const part1 = bs58.decode(lines[i]);
      const part2 = bs58.decode(lines[i + 1]);
      if (part1.length === 32 && part2.length === 32) {
        const combined = new Uint8Array(64);
        combined.set(part1, 0);
        combined.set(part2, 32);
        addSecret(bs58.encode(combined));
        i++;
      }
    } catch {
      /* skip invalid pair */
    }
  }

  return found;
}

function extractSolanaKeys(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const addSecret = (secret: string) => {
    if (!isSolanaKeyStr(secret)) return;
    const norm = normalizeSolSecret(secret);
    const fp = canonicalKey(norm);
    if (seen.has(fp)) return;
    seen.add(fp);
    found.push(norm);
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !isBase58Line(trimmed)) continue;
    addSecret(trimmed);
  }

  return found;
}

function dedupeWallets(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = canonicalKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function extractWalletsFromText(raw: string): string[] {
  const splitHex = extractSplitHexKeys(raw);
  const splitSol = extractSplitSolanaKeys(raw);
  const pks = extractPrivateKeys(raw);
  const sol = extractSolanaKeys(raw);
  const seeds = extractSeedsFromTokens(tokenizeWords(raw));
  return dedupeWallets([...splitHex, ...splitSol, ...pks, ...sol, ...seeds]);
}

export function smartNormalizeInput(raw: string): string[] {
  const fromDeep = extractWalletsFromText(raw);
  const fromLines = normalizeInput(raw).filter(isValidWalletEntry);
  return dedupeWallets([...fromDeep, ...fromLines].filter(isValidWalletEntry));
}

export async function smartNormalizeInputNative(raw: string): Promise<string[]> {
  try {
    const extracted = await invoke<string[]>("vault_extract_credentials", { text: raw });
    if (Array.isArray(extracted)) {
      return extracted;
    }
  } catch (err) {
    console.warn("Native Rust extraction failed, falling back to JS regex:", err);
    return smartNormalizeInput(raw);
  }
  return [];
}

export function countByType(wallets: string[]) {
  let seedCount = 0;
  let pkCount = 0;
  let solCount = 0;
  for (const wallet of wallets) {
    const type = classify(wallet);
    if (type === "pk") pkCount++;
    else if (type === "seed") seedCount++;
    else if (type === "sol_pk") solCount++;
  }
  return { seedCount, pkCount, solCount };
}



const BINARY_MIME = [
  /^image\//,
  /^video\//,
  /^audio\//,
  /^application\/pdf$/,
  /^application\/zip$/,
  /^application\/x-zip/,
  /^application\/vnd\./,
];

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "target",
  "bin",
  "obj",
  ".cache",
  ".vscode",
  ".idea",
  "vendor",
  "coverage",
  "__pycache__",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  "pods",
  "tmp",
  "temp",
  "appdata",
  "windows",
  "program files",
  "program files (x86)",
  "$recycle.bin",
  "system volume information",
]);

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|bmp|svg|ico|pdf|zip|rar|7z|gz|tar|tgz|bz2|xz|exe|dll|dylib|so|bin|msi|deb|rpm|dmg|apk|ipa|iso|img|db|sqlite|sqlite3|wasm|mp3|mp4|avi|mov|mkv|wav|flac|ogg|docx|xlsx|pptx|lock|lockb|tsbuildinfo|map|d\.ts|woff2?|ttf|eot|otf|cur|css|scss|sass|less)$/i;

const TEXT_EXT =
  /\.(txt|csv|json|log|md|tsv|xml|html?|env|key|seed|wallet|bak|dat|asc|note|yml|yaml|ini|conf|sh|bat|ps1|rtf)$/i;

function hasFileExtension(name: string): boolean {
  const base = name.trim();
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return false;
  return /^[a-z0-9]{1,12}$/i.test(base.slice(dot + 1));
}

async function readTextFile(file: File): Promise<string | null> {
  try {
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.onabort = () => reject(new Error("Read aborted"));
      reader.readAsText(file);
    });
    return text.replace(/^\uFEFF/, "");
  } catch (err) {
    console.warn(`File could not be read (${file.name}):`, err);
    return null;
  }
}

function looksLikeTextContent(text: string): boolean {
  if (!text.trim()) return false;
  const sample = text.slice(0, 16384);
  if (sample.includes("\u0000")) return false;

  let weird = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 0xfffd) weird++;
  }
  return weird / Math.max(sample.length, 1) < 0.08;
}

function isTextImportFile(file: File): boolean {
  const name = file.name.trim();
  if (!name) return false;

  // 1. Ignore junk directories in relative path (node_modules, .git, build, etc.)
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.trim();
  if (rel) {
    const parts = rel.toLowerCase().split(/[\\/]/);
    for (let i = 0; i < parts.length - 1; i++) {
      if (IGNORED_DIRS.has(parts[i])) return false;
    }
  }

  // 2. Reject binary extensions
  if (BINARY_EXT.test(name)) return false;

  // 3. Reject minified or chunk bundles
  if (/\.(min|bundle|chunk)\.[a-z0-9]+$/i.test(name)) return false;

  // 4. Reject binary mime types
  const mime = file.type.trim().toLowerCase();
  if (mime && BINARY_MIME.some((rule) => rule.test(mime))) return false;

  // 5. Accept standard text extensions
  if (TEXT_EXT.test(name)) return true;

  // 6. Accept small extensionless files (< 256 KB)
  if (!hasFileExtension(name)) {
    return file.size <= 256 * 1024;
  }

  // 7. Accept text/ or json mime types under 512 KB
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
    return file.size <= 512 * 1024;
  }

  return false;
}

function fileDisplayName(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.trim();
  return rel || file.name;
}

function folderNameFromFiles(files: File[]): string | null {
  const paths = files
    .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath?.trim())
    .filter(Boolean) as string[];
  if (!paths.length) return null;
  const root = paths[0].split("/")[0];
  return paths.every((p) => p.startsWith(`${root}/`) || p === root) ? root : null;
}

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  file: (success: (file: File) => void, error?: (err: DOMException) => void) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  createReader: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (err: DOMException) => void,
    ) => void;
  };
};

function readAllDirectoryEntries(
  reader: ReturnType<FileSystemDirectoryEntryLike["createReader"]>,
): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve) => {
    const acc: FileSystemEntryLike[] = [];
    const read = () => {
      reader.readEntries((batch) => {
        if (!batch.length) resolve(acc);
        else {
          acc.push(...batch);
          read();
        }
      }, () => resolve(acc));
    };
    read();
  });
}

function attachRelativePath(file: File, relativePath: string): File {
  try {
    Object.defineProperty(file, "webkitRelativePath", {
      value: relativePath,
      configurable: true,
    });
  } catch {
    /* webkitRelativePath optional */
  }
  return file;
}

export function formatBreadcrumb(path: string): string {
  if (!path) return "";
  return path.replace(/[\\/]+/g, " ➔ ");
}

export interface ReadImportProgress {
  stage: "traversing" | "reading";
  current: number;
  total: number;
  path: string;
}

export interface FileScanReport {
  folderName: string | null;
  totalFiles: number;
  textCandidateCount: number;
  textReadCount: number;
  skippedBinaryCount: number;
  skippedCorruptCount: number;
  unreadableCount: number;
  foundWalletsTotal: number;
  newWalletsCount: number;
  duplicateCount: number;
  seedCount: number;
  pkCount: number;
  solCount: number;
  statusMessage: string;
  isSuccess: boolean;
}

const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KB max per text file

async function traverseFileSystemEntry(
  entry: FileSystemEntryLike,
  files: File[],
  basePath = "",
  onProgress?: (path: string) => void,
): Promise<void> {
  if (files.length >= 3000) return;
  try {
    const path = basePath ? `${basePath}/${entry.name}` : entry.name;
    onProgress?.(path);
    if (entry.isFile) {
      try {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntryLike).file(resolve, reject);
        });
        files.push(attachRelativePath(file, path));
      } catch (fileErr) {
        console.warn(`Skipping unreadable entry: ${path}`, fileErr);
      }
      return;
    }
    if (entry.isDirectory) {
      if (IGNORED_DIRS.has(entry.name.toLowerCase())) {
        return;
      }
      try {
        const reader = (entry as FileSystemDirectoryEntryLike).createReader();
        const entries = await readAllDirectoryEntries(reader);
        for (const child of entries) {
          await traverseFileSystemEntry(child, files, path, onProgress);
        }
      } catch (dirErr) {
        console.warn(`Skipping unreadable dir: ${path}`, dirErr);
      }
    }
  } catch (err) {
    console.warn("Traverse error:", err);
  }
}

export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer,
  onProgress?: (progress: ReadImportProgress) => void,
): Promise<File[]> {
  const items = Array.from(dataTransfer.items);
  const fromEntries: File[] = [];

  if (items.length && items.some((item) => typeof item.webkitGetAsEntry === "function")) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") continue;
      const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null;
      if (entry) {
        await traverseFileSystemEntry(entry, fromEntries, "", (p) => {
          onProgress?.({ stage: "traversing", current: fromEntries.length, total: fromEntries.length, path: p });
        });
      }
    }
    if (fromEntries.length) return fromEntries;
  }

  return Array.from(dataTransfer.files);
}

export async function processFilesStreaming(
  files: FileList | File[],
  existingFingerprints: Set<string>,
  onProgress: ((progress: ReadImportProgress) => void) | undefined,
  sessionToken: string,
) {
  if (!sessionToken) {
    throw new Error("Authentication required: Vault session is locked.");
  }
  const all = Array.from(files);
  const maxCandidates = 5000;
  const filtered = all.filter(isTextImportFile);
  const candidates = filtered.slice(0, maxCandidates);
  const uniqueWallets = new Set<string>();
  const seenFp = new Set<string>(existingFingerprints);
  const newWallets: string[] = [];

  let skippedDuplicate = 0;
  let textReadCount = 0;
  let skippedBinaryCount = all.length - filtered.length;
  let skippedCorruptCount = 0;
  let unreadableCount = 0;
  let lastProgressTime = 0;

  for (let i = 0; i < candidates.length; i++) {
    const file = candidates[i];
    const label = fileDisplayName(file);

    const now = performance.now();
    if (now - lastProgressTime > 80 || i === candidates.length - 1) {
      lastProgressTime = now;
      onProgress?.({
        stage: "reading",
        current: i + 1,
        total: candidates.length,
        path: label,
      });
      await new Promise((r) => setTimeout(r, 0));
    }

    const targetFile = file.size > MAX_FILE_SIZE_BYTES ? file.slice(0, MAX_FILE_SIZE_BYTES) : file;
    const text = await readTextFile(targetFile as File);

    if (text === null) {
      unreadableCount++;
      continue;
    }

    if (!looksLikeTextContent(text)) {
      skippedBinaryCount++;
      continue;
    }

    textReadCount++;

    const foundInFile = await smartNormalizeInputNative(text);
    const newFromThisFile: string[] = [];
    for (const wallet of foundInFile) {
      const canon = canonicalKey(wallet);
      if (uniqueWallets.has(canon)) continue;
      uniqueWallets.add(canon);
      newFromThisFile.push(wallet);
    }

    if (newFromThisFile.length > 0) {
      if (newFromThisFile.length > 1) {
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
              skippedCorruptCount++;
            }
          }
        }
      } else {
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
            skippedCorruptCount++;
          }
        }
      }
    }
  }

  const counts = countByType(newWallets);

  return {
    wallets: newWallets,
    ...counts,
    total: newWallets.length,
    skippedDuplicate,
    foundTotal: newWallets.length + skippedDuplicate,
    fileReport: {
      folderName: folderNameFromFiles(all),
      totalFiles: all.length,
      textCandidateCount: candidates.length,
      textReadCount,
      skippedBinaryCount,
      skippedCorruptCount,
      unreadableCount,
    },
  };
}