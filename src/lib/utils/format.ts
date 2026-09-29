import bs58 from "bs58";

// secp256k1 curve order n
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

/**
 * Safely converts hex, number, or string to a native bigint.
 */
export function toBigInt(value: bigint | string | number): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  const str = value.trim();
  if (!str) return 0n;
  if (str.startsWith("0x") || str.startsWith("-0x")) {
    return BigInt(str);
  }
  return BigInt(str);
}

/**
 * Parse an input string into wei / base unit with full decimal precision (no floating point inaccuracy).
 * Supports unit name ("ether", "gwei") or numeric decimal count (e.g. 9, 18).
 */
export function parseUnits(value: string | number, unit: "ether" | "gwei" | number = 18): bigint {
  const decimals = unit === "ether" ? 18 : unit === "gwei" ? 9 : unit;
  const strVal = String(value).trim();
  if (!strVal || strVal === "0") return 0n;

  const [intPart, fracPart = ""] = strVal.split(".");
  const cleanInt = intPart.replace(/[^0-9-]/g, "") || "0";
  const paddedFrac = fracPart.slice(0, decimals).padEnd(decimals, "0");
  const combined = `${cleanInt}${paddedFrac}`;
  return BigInt(combined);
}

/**
 * Formats a base unit (wei / lamports) to a human-readable decimal string.
 */
export function formatUnits(value: bigint | string | number, decimals = 18, maxDecimals = 8): string {
  const bi = toBigInt(value);
  const isNegative = bi < 0n;
  const absBi = isNegative ? -bi : bi;

  const divisor = 10n ** BigInt(decimals);
  const integerPart = absBi / divisor;
  const remainder = absBi % divisor;

  const remainderStr = remainder.toString().padStart(decimals, "0");
  const truncatedFrac = remainderStr.slice(0, maxDecimals).replace(/0+$/, "");

  const prefix = isNegative ? "-" : "";
  if (!truncatedFrac) {
    return `${prefix}${integerPart.toString()}`;
  }
  return `${prefix}${integerPart.toString()}.${truncatedFrac}`;
}

/**
 * Formats wei to Ether string with default 8 decimal places max.
 */
export function formatEther(wei: bigint | string | number, maxDecimals = 8): string {
  return formatUnits(wei, 18, maxDecimals);
}

/**
 * Checks if a string is a valid EVM address (0x followed by 40 hex characters).
 */
export function isEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

/**
 * Validates whether a hex string represents a mathematically valid secp256k1 private key:
 * 1. Exactly 32 bytes (64 hex characters).
 * 2. Non-zero.
 * 3. Strictly less than the elliptic curve order N.
 */
export function isValidSecp256k1PrivateKey(hex: string): boolean {
  const clean = hex.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) return false;
  try {
    const val = BigInt(`0x${clean}`);
    return val > 0n && val < SECP256K1_N;
  } catch {
    return false;
  }
}

/**
 * Validates whether a string is a valid Solana public key (Base58 decoding exactly 32 bytes).
 * Supports standard curve keypairs as well as off-curve Program Derived Addresses (PDAs).
 */
export function isValidSolAddress(addr: string): boolean {
  try {
    const trimmed = addr.trim();
    if (trimmed.length < 32 || trimmed.length > 44) return false;
    const decoded = bs58.decode(trimmed);
    return decoded.length === 32;
  } catch {
    return false;
  }
}
