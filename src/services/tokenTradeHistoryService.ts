import { getInitialTokenPrice, fetchLiveTokenPrice, getChainNativeSymbol } from "./tokenPriceService";

export interface TradeTransactionRecord {
  id: string;
  positionId: string;
  type: "BUY" | "SELL"; // BUY = Masuk (Hijau), SELL = Keluar (Merah)
  symbol: string;
  name: string;
  chain: string;
  contractAddress?: string;
  time: string; // Kapan (e.g. "24 Sep 10:15" atau "2 jam lalu")
  mc: number; // Market cap saat transaksi (e.g. 69320)
  priceUsd: number; // Harga per token saat transaksi dalam USD
  priceEth: number; // Harga per token saat transaksi dalam ETH
  amount: number; // Jumlah token (e.g. 56860)
  totalEth: number; // Total ETH saat transaksi (e.g. 0.001)
  totalUsd: number; // Total USD saat transaksi (e.g. 2.68)
  profitEth?: number; // Selisih ETH jika SELL / exit (e.g. -0.00031)
  profitUsd?: number; // Selisih USD jika SELL
  profitPercent?: number; // Persentase profit/minus jika SELL
  isLive?: boolean;
}

export interface TokenTradePosition {
  id: string;
  walletId?: number;
  walletLabel?: string;
  chain: string;
  symbol: string;
  name: string;
  contractAddress?: string;
  holdAmount: number;

  // ── Sisi Masuk (Entry / Buy) ──
  entryTime: string; // Kapan dia masuk
  entryMc: number; // MC saat masuk (misal $69.32K -> 69320)
  entryPriceUsd: number; // Harga per token saat masuk dalam USD
  entryPriceEth: number; // Harga per token saat masuk dalam ETH
  entryAmount: number; // Jumlah token yang dibeli (misal 56.86K -> 56860)
  entryTotalEth: number; // Total ETH yang dikeluarkan (misal 0.001 ETH)
  entryTotalUsd: number; // Total USD yang dikeluarkan (misal $2.68)

  // ── Sisi Keluar (Exit / Sell atau Live Saat Ini) ──
  isExited: boolean; // true = sudah jual/keluar, false = masih hold/drawdown
  exitTime?: string; // Kapan dia keluar (atau "Live (Masih Hold)")
  exitMc: number; // MC saat keluar / live sekarang (misal $29.75K -> 29750)
  exitPriceUsd: number; // Harga per token saat keluar / live USD
  exitPriceEth: number; // Harga per token saat keluar / live ETH
  exitAmount: number; // Jumlah token yang dijual / sisa hold (misal 56.46K -> 56460)
  exitTotalEth: number; // Total ETH yang didapatkan saat keluar / nilai live (misal 0.00069 ETH)
  exitTotalUsd: number; // Total USD hasil penjualan / nilai live (misal $1.85)

  // ── Hasil Akhir Minus / Profit (P&L) ──
  pnlEth: number; // exitTotalEth - entryTotalEth (misal -0.00031 ETH)
  pnlUsd: number; // exitTotalUsd - entryTotalUsd (misal -$0.83 USD)
  pnlPercent: number; // ((exitTotalEth - entryTotalEth) / entryTotalEth) * 100 (misal -31.00%)
  mcDiffPercent: number; // ((exitMc - entryMc) / entryMc) * 100 (misal -57.08%)
  priceDiffPercent: number; // ((exitPriceUsd - entryPriceUsd) / entryPriceUsd) * 100 (misal -46.35%)

  // Backward-compatible properties
  buyPriceUsd: number;
  buyPriceEth: number;
  currentPriceUsd: number;
  currentPriceEth: number;
  priceDiffUsd: number;
  priceDiffEth: number;

  status: "holding" | "sold" | "closed" | "drawdown" | "profit";
  buyDate?: string;
  notes?: string;
}

const STORAGE_KEY = "plurivex_token_trade_positions_v5";
const EVENT_NAME = "plurivex-trade-positions-updated";

/**
 * Format Market Cap (e.g. 69320 -> $69.32K, 2500000 -> $2.50M)
 */
export function formatMarketCap(mc: number): string {
  if (!mc || mc === 0) return "$0";
  const abs = Math.abs(mc);
  if (abs >= 1_000_000) {
    return `$${(mc / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `$${(mc / 1_000).toFixed(2)}K`;
  }
  return `$${mc.toFixed(2)}`;
}

/**
 * Format Crypto Amounts (e.g. 56860 -> 56.86K, 2352941 -> 2.35M)
 */
export function formatCryptoAmount(amount: number): string {
  if (!amount || amount === 0) return "0";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${(amount / 1_000).toFixed(2)}K`;
  }
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Format Native values cleanly without broken subscript padding (e.g. ♦ 0.00100 ETH, ◎ 0.05000 SOL)
 */
export function formatEthValue(eth: number, chain?: string): string {
  const sym = getChainNativeSymbol(chain);
  const icon = sym === "SOL" ? "◎" : sym === "BNB" ? "⬨" : sym === "BTC" ? "₿" : "♦";
  if (!eth || eth === 0) return `${icon} 0.00000 ${sym}`;
  const abs = Math.abs(eth);
  const sign = eth < 0 ? "-" : "";

  if (abs >= 1) {
    return `${sign}${icon} ${abs.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 4 })} ${sym}`;
  }
  if (abs >= 0.01) {
    return `${sign}${icon} ${abs.toFixed(4)} ${sym}`;
  }
  return `${sign}${icon} ${abs.toFixed(5)} ${sym}`;
}

/**
 * Format Token Micro Prices (USD & Chain-Native SOL/BNB/ETH)
 */
export function formatTokenPrice(num: number, isNative = false, chain?: string): string {
  const sym = getChainNativeSymbol(chain);
  if (num === 0) return isNative ? `0 ${sym}` : "$0.00";
  const abs = Math.abs(num);

  let formatted = "";
  if (abs >= 1) {
    formatted = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } else if (abs >= 0.01) {
    formatted = num.toFixed(4);
  } else if (abs >= 0.0001) {
    formatted = num.toFixed(6);
  } else if (abs >= 0.000001) {
    formatted = num.toFixed(8);
  } else {
    formatted = num.toFixed(10).replace(/\.?0+$/, "");
  }

  if (isNative) {
    return `${formatted} ${sym}`;
  }
  return `$${formatted} USD`;
}

export function getTradePositions(): TokenTradePosition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, "[]");
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // These records were shipped as hard-coded demo trades in early builds.
    // Remove them so a fresh vault never reports sample data as the user's P&L.
    const demoIds = new Set(["pos-sma", "pos-jev", "pos-ast", "pos-usdg"]);
    const realPositions = parsed.filter(
      (position: TokenTradePosition) => !demoIds.has(position.id),
    );
    if (realPositions.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(realPositions));
    }

    return realPositions.map((position: TokenTradePosition) => {
      if (position.isExited || position.status === "sold") {
        return { ...position, holdAmount: 0 };
      }
      return position;
    });
  } catch (err) {
    console.error("Failed to load trade positions:", err);
    return [];
  }
}

export function saveTradePositions(positions: TokenTradePosition[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: positions }));
  } catch (err) {
    console.error("Failed to save trade positions:", err);
  }
}

export function subscribeTradePositions(
  callback: (positions: TokenTradePosition[]) => void
): () => void {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<TokenTradePosition[]>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    } else {
      callback(getTradePositions());
    }
  };

  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

/**
 * Generate flattened transaction rows (seperti tabel GMGN di screenshot user):
 * - Baris MERAH untuk KELUAR (SELL / EXIT)
 * - Baris HIJAU untuk MASUK (BUY / ENTRY)
 */
export function getTradeTransactions(positions: TokenTradePosition[]): TradeTransactionRecord[] {
  const transactions: TradeTransactionRecord[] = [];

  for (const pos of positions) {
    // 1. Baris KELUAR (SELL / EXIT) - Merah
    transactions.push({
      id: `${pos.id}-sell`,
      positionId: pos.id,
      type: "SELL",
      symbol: pos.symbol,
      name: pos.name,
      chain: pos.chain,
      contractAddress: pos.contractAddress,
      time: pos.exitTime || "Live (Sedang Hold)",
      mc: pos.exitMc,
      priceUsd: pos.exitPriceUsd,
      priceEth: pos.exitPriceEth,
      amount: pos.exitAmount || pos.entryAmount,
      totalEth: pos.exitTotalEth,
      totalUsd: pos.exitTotalUsd,
      profitEth: pos.pnlEth,
      profitUsd: pos.pnlUsd,
      profitPercent: pos.pnlPercent,
      isLive: !pos.isExited,
    });

    // 2. Baris MASUK (BUY / ENTRY) - Hijau
    transactions.push({
      id: `${pos.id}-buy`,
      positionId: pos.id,
      type: "BUY",
      symbol: pos.symbol,
      name: pos.name,
      chain: pos.chain,
      contractAddress: pos.contractAddress,
      time: pos.entryTime,
      mc: pos.entryMc,
      priceUsd: pos.entryPriceUsd,
      priceEth: pos.entryPriceEth,
      amount: pos.entryAmount,
      totalEth: pos.entryTotalEth,
      totalUsd: pos.entryTotalUsd,
      profitEth: undefined,
      profitUsd: undefined,
      profitPercent: undefined,
      isLive: false,
    });
  }

  return transactions;
}

export function updatePositionBuyPrice(
  id: string,
  newBuyPriceUsd: number,
  ethUsdPrice = 0
): void {
  const list = getTradePositions();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return;

  const target = { ...list[idx] };
  target.entryPriceUsd = newBuyPriceUsd;
  target.buyPriceUsd = newBuyPriceUsd;
  target.entryPriceEth = ethUsdPrice > 0 ? newBuyPriceUsd / ethUsdPrice : 0;
  target.buyPriceEth = target.entryPriceEth;

  target.priceDiffUsd = target.exitPriceUsd - target.entryPriceUsd;
  target.priceDiffEth = target.exitPriceEth - target.entryPriceEth;
  target.priceDiffPercent =
    target.entryPriceUsd > 0
      ? (target.priceDiffUsd / target.entryPriceUsd) * 100
      : 0;

  list[idx] = target;
  saveTradePositions(list);
}

export function addTradePosition(
  pos: Omit<
    TokenTradePosition,
    | "id"
    | "currentPriceUsd"
    | "currentPriceEth"
    | "priceDiffUsd"
    | "priceDiffEth"
    | "priceDiffPercent"
    | "pnlEth"
    | "pnlUsd"
    | "pnlPercent"
    | "mcDiffPercent"
    | "buyPriceUsd"
    | "buyPriceEth"
  > & {
    id?: string;
  },
  options: { livePriceEnabled?: boolean; ethUsdPrice?: number } = {},
): TokenTradePosition {
  const ethUsdPrice = options.ethUsdPrice && options.ethUsdPrice > 0 ? options.ethUsdPrice : 0;
  const quote = getInitialTokenPrice(pos.symbol, pos.contractAddress, ethUsdPrice, pos.chain);

  const exitPriceUsd = quote.usd > 0 ? quote.usd : pos.exitPriceUsd || pos.entryPriceUsd;
  const exitPriceEth =
    quote.eth > 0 ? quote.eth : (ethUsdPrice > 0 ? exitPriceUsd / ethUsdPrice : 0);

  const priceDiffUsd = exitPriceUsd - pos.entryPriceUsd;
  const priceDiffEth = exitPriceEth - pos.entryPriceEth;
  const priceDiffPercent =
    pos.entryPriceUsd > 0 ? (priceDiffUsd / pos.entryPriceUsd) * 100 : 0;

  const exitTotalEth = pos.exitTotalEth > 0 ? pos.exitTotalEth : pos.entryTotalEth * (1 + priceDiffPercent / 100);
  const exitTotalUsd = exitTotalEth * ethUsdPrice;
  const pnlEth = exitTotalEth - pos.entryTotalEth;
  const pnlUsd = exitTotalUsd - pos.entryTotalUsd;
  const pnlPercent = pos.entryTotalEth > 0 ? (pnlEth / pos.entryTotalEth) * 100 : 0;
  const mcDiffPercent = pos.entryMc > 0 ? ((pos.exitMc - pos.entryMc) / pos.entryMc) * 100 : 0;

  const newRecord: TokenTradePosition = {
    ...pos,
    id: pos.id || `trade-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    exitPriceUsd,
    exitPriceEth,
    exitTotalEth,
    exitTotalUsd,
    pnlEth,
    pnlUsd,
    pnlPercent,
    mcDiffPercent,
    priceDiffUsd,
    priceDiffEth,
    priceDiffPercent,
    buyPriceUsd: pos.entryPriceUsd,
    buyPriceEth: pos.entryPriceEth,
    currentPriceUsd: exitPriceUsd,
    currentPriceEth: exitPriceEth,
  };

  const existing = getTradePositions();
  const updated = [newRecord, ...existing.filter((p) => p.id !== newRecord.id)];
  saveTradePositions(updated);

  // Background fetch live quote
  if (pos.contractAddress && options.livePriceEnabled !== false) {
    fetchLiveTokenPrice(pos.contractAddress, ethUsdPrice, pos.chain).then((live) => {
      if (live) {
        updatePositionWithLivePrice(newRecord.id, live.usd, live.eth, ethUsdPrice);
      }
    });
  }

  return newRecord;
}

export function deleteTradePosition(id: string): void {
  const existing = getTradePositions();
  const updated = existing.filter((p) => p.id !== id);
  saveTradePositions(updated);
}

export function updatePositionWithLivePrice(
  id: string,
  priceUsd: number,
  priceEth: number,
  ethUsdPrice = 0
): void {
  const list = getTradePositions();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return;

  const target = { ...list[idx] };
  if (!target.isExited) {
    target.exitPriceUsd = priceUsd;
    target.exitPriceEth =
      priceEth > 0 ? priceEth : (ethUsdPrice > 0 ? priceUsd / ethUsdPrice : 0);
    target.currentPriceUsd = target.exitPriceUsd;
    target.currentPriceEth = target.exitPriceEth;

    target.priceDiffUsd = target.exitPriceUsd - target.entryPriceUsd;
    target.priceDiffEth = target.exitPriceEth - target.entryPriceEth;
    target.priceDiffPercent =
      target.entryPriceUsd > 0
        ? (target.priceDiffUsd / target.entryPriceUsd) * 100
        : 0;

    target.exitTotalEth = target.entryTotalEth * (1 + target.priceDiffPercent / 100);
    target.exitTotalUsd = target.exitTotalEth * ethUsdPrice;
    target.pnlEth = target.exitTotalEth - target.entryTotalEth;
    target.pnlUsd = target.exitTotalUsd - target.entryTotalUsd;
    target.pnlPercent = target.entryTotalEth > 0 ? (target.pnlEth / target.entryTotalEth) * 100 : 0;
  }

  list[idx] = target;
  saveTradePositions(list);
}
