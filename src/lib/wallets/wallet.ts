import { invoke } from "@tauri-apps/api/core";
import {
  isBase58Line,
  isSolanaKeyStr,
  normalizeSolSecret,
} from "./solana";
import type { WalletType } from "./types";
import { isBip39Word, isValidMnemonic } from "./bip39-wordlist";
import { isValidSecp256k1PrivateKey } from "../utils/format";

export {
  isSolanaKeyStr,
} from "./solana";

const MNEMONIC_LENGTHS = [12, 15, 18, 21, 24];

export { isBip39Word };

export function isValidSeedPhrase(text: string): boolean {
  try {
    return isValidMnemonic(text.trim());
  } catch {
    return false;
  }
}

export function isValidWalletEntry(text: string): boolean {
  const t = text.trim();
  if (isSolanaKeyStr(t)) return true;
  if (isPrivateKeyStr(t)) return true;
  return isValidSeedPhrase(t);
}

export function isPrivateKeyStr(s: string): boolean {
  return isValidSecp256k1PrivateKey(s);
}

export function classify(line: string): WalletType | "pk_bad_length" {
  const t = line.trim();
  if (t.startsWith("#") || t.startsWith("//")) return "invalid";
  const hex = t.replace(/^0x/i, "");
  const words = t.split(/\s+/).filter(Boolean);
  if (/^[0-9a-fA-F]+$/.test(hex) && words.length === 1) {
    if (hex.length !== 64) return "pk_bad_length";
    return isPrivateKeyStr(t) ? "pk" : "invalid";
  }
  if (MNEMONIC_LENGTHS.includes(words.length) && isValidSeedPhrase(t)) return "seed";
  if (words.length === 1 && isSolanaKeyStr(t)) return "sol_pk";
  return "invalid";
}

function extractFromLine(line: string) {
  const t = line.trim();
  if (!t) return { words: [] as string[] };
  if (isPrivateKeyStr(t)) return { privateKey: t };

  const numbered = t.match(/^(\d{1,3})[.):\-\]]\s+(.+)$/);
  if (numbered) {
    const content = numbered[2].trim();
    if (!content) return { words: [] as string[], number: +numbered[1] };
    return { words: content.split(/\s+/).filter(Boolean), number: +numbered[1] };
  }
  return { words: t.split(/\s+/).filter(Boolean) };
}

function isHexToken(value: string): boolean {
  const hex = value.replace(/^0x/i, "");
  return /^[0-9a-fA-F]{32,64}$/.test(hex);
}

function isLikelyLabelLine(words: string[]): boolean {
  if (!words.length) return true;
  const joined = words.join(" ").toLowerCase();
  if (joined === "sol" || joined === "evm" || joined === "protrader") return true;
  if (words.length <= 3 && words.every((w) => /^[a-zA-Z0-9²]+$/.test(w))) {
    if (words.length === 1 && /^[A-Z]/.test(words[0]) && words[0].length < 28) return true;
    if (words.length > 1 && words.every((w) => /^[A-Z]/.test(w))) return true;
  }
  return false;
}

export function normalizeInput(raw: string): string[] {
  const result: string[] = [];
  let words: string[] = [];

  const flush = () => {
    if (!words.length) return;
    const phrase = words.join(" ");
    if (isValidWalletEntry(phrase)) result.push(phrase);
    words = [];
  };

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (MNEMONIC_LENGTHS.includes(words.length) && isValidSeedPhrase(words.join(" "))) flush();
      words = [];
      continue;
    }

    if (isHexToken(trimmed) || isBase58Line(trimmed)) {
      flush();
      words = [];
      continue;
    }

    const item = extractFromLine(line);
    if ("privateKey" in item && item.privateKey) {
      flush();
      result.push(item.privateKey);
      continue;
    }

    const lineWords = item.words ?? [];
    if (!lineWords.length) continue;
    if (isLikelyLabelLine(lineWords)) {
      flush();
      words = [];
      continue;
    }

    if (item.number === 1 && words.length) flush();

    const seedWords = lineWords.filter((w) => /^[a-z]+$/.test(w) && isBip39Word(w));
    if (!seedWords.length) {
      words = [];
      continue;
    }
    if (seedWords.length !== lineWords.length) {
      words = [];
      continue;
    }

    words.push(...seedWords);
    if (MNEMONIC_LENGTHS.includes(words.length) && isValidSeedPhrase(words.join(" "))) flush();
  }
  flush();
  return result;
}

export function canonicalKey(text: string): string {
  const t = text.trim();
  const hex = t.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(hex) && !/\s/.test(t)) {
    return "pk:" + hex.toLowerCase();
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (MNEMONIC_LENGTHS.includes(words.length) && isValidSeedPhrase(t)) {
    return "seed:" + words.map((w) => w.toLowerCase()).join(" ");
  }
  if (isSolanaKeyStr(t)) return `sol:${normalizeSolSecret(t)}`;
  return "seed:" + words.map((w) => w.toLowerCase()).join(" ");
}

export interface DualCredentials {
  evmAddress: string | null;
  solAddress: string | null;
  btcAddress?: string | null;
  btcLegacyAddress?: string | null;
  evmPrivateKey: string | null;
  solPrivateKey: string | null;
  btcPrivateKey?: string | null;
}

export async function deriveDualCredentialsNative(
  secret: string,
  type: WalletType
): Promise<DualCredentials> {
  return await invoke<DualCredentials>("vault_derive_credentials", {
    secret,
    walletType: type,
  });
}

export async function deriveDualCredentialsBatchNative(
  secrets: string[],
  type: WalletType
): Promise<(DualCredentials | null)[]> {
  return await invoke<(DualCredentials | null)[]>("vault_derive_credentials_batch", {
    secrets,
    walletType: type,
  });
}

export interface PublicAddressesOnly {
  evmAddress: string | null;
  solAddress: string | null;
  btcAddress?: string | null;
  btcLegacyAddress?: string | null;
}

export async function derivePublicAddressesNative(
  secret: string,
  type: WalletType
): Promise<PublicAddressesOnly> {
  return await invoke<PublicAddressesOnly>("vault_derive_public_only", {
    secret,
    walletType: type,
  });
}

export async function derivePublicAddressesBatchNative(
  secrets: string[],
  type: WalletType
): Promise<(PublicAddressesOnly | null)[]> {
  return await invoke<(PublicAddressesOnly | null)[]>("vault_derive_public_only_batch", {
    secrets,
    walletType: type,
  });
}




export function shortAddr(a: string) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

export function walletDisplayAddress(
  wallet: {
    address: string | null;
    solAddress: string | null;
    type: WalletType;
  },
  preferFamily?: "evm" | "sol",
): string | null {
  if (preferFamily === "sol") {
    return wallet.solAddress ?? wallet.address;
  }
  if (preferFamily === "evm") {
    return wallet.address ?? wallet.solAddress;
  }
  if (wallet.type === "sol_pk") return wallet.solAddress ?? wallet.address;
  return wallet.address ?? wallet.solAddress;
}

export function isSolanaWallet(type: WalletType): boolean {
  return type === "sol_pk";
}

export function isEvmWallet(type: WalletType): boolean {
  return type === "seed" || type === "pk";
}

export function walletHasScanTarget(wallet: {
  address: string | null;
  solAddress: string | null;
  type: WalletType;
}): boolean {
  return Boolean(wallet.address || wallet.solAddress);
}