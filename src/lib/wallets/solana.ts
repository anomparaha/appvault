import bs58 from "bs58";

const BASE58_LINE = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;

export function isBase58Line(value: string): boolean {
  return BASE58_LINE.test(value.trim());
}

export function isSolanaKeyStr(secret: string): boolean {
  const trimmed = secret.trim();
  if (!isBase58Line(trimmed)) return false;
  try {
    const bytes = bs58.decode(trimmed);
    return bytes.length === 64 || bytes.length === 32;
  } catch {
    return false;
  }
}

export function normalizeSolSecret(secret: string): string {
  try {
    const trimmed = secret.trim();
    if (!isBase58Line(trimmed)) return trimmed;
    const bytes = bs58.decode(trimmed);
    if (bytes.length === 64 || bytes.length === 32) {
      return bs58.encode(bytes);
    }
    return trimmed;
  } catch {
    return secret.trim();
  }
}

export function formatSolBalance(lamports: bigint): string {
  const amount = Number(lamports) / 1e9;
  if (!Number.isFinite(amount) || amount === 0) return "0 SOL";
  if (amount < 0.00001) return `${amount.toFixed(9).replace(/\.?0+$/, "")} SOL`;
  if (amount < 1) return `${amount.toFixed(6).replace(/\.?0+$/, "")} SOL`;
  return `${amount.toFixed(5)} SOL`;
}