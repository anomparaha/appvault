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

function getDefaultInitialPositions(): TokenTradePosition[] {
  const ethUsdPrice = 2680;

  // 1. Summa (SMA on Robinhood Chain) - PERSIS SEPERTI DI SCREENSHOT GMGN USER
  // Masuk: MC $69.32K, Amount 56.86K SMA, Total Modal 0.00100 ETH ($2.68 USD)
  // Harga Beli Masuk = $2.68 / 56,860 = $0.00004714 USD (0.00000001759 ETH)
  // Keluar: MC $29.75K, Amount 56.46K SMA, Total Hasil Jual 0.00069 ETH ($1.85 USD)
  // Harga Jual Keluar = $1.85 / 56,460 = $0.00003275 USD (0.00000001222 ETH)
  // Hasil Riil: Minus -0.00031 ETH (-31.00%), Selisih USD: -$0.83 USD, Penurunan MC: -57.08%
  const smaEntryMc = 69320;
  const smaExitMc = 29750;
  const smaEntryTotalEth = 0.001;
  const smaExitTotalEth = 0.00069;
  const smaEntryAmount = 56860;
  const smaExitAmount = 56460;
  const smaEntryEth = smaEntryTotalEth / smaEntryAmount;
  const smaExitEth = smaExitTotalEth / smaExitAmount;
  const smaEntryUsd = smaEntryEth * ethUsdPrice;
  const smaExitUsd = smaExitEth * ethUsdPrice;
  const smaPnlEth = smaExitTotalEth - smaEntryTotalEth; // -0.00031 ETH
  const smaPnlUsd = (smaExitTotalEth * ethUsdPrice) - (smaEntryTotalEth * ethUsdPrice); // -$0.83 USD
  const smaPnlPercent = ((smaExitTotalEth - smaEntryTotalEth) / smaEntryTotalEth) * 100; // -31.00%

  // 2. OpenJEV (JEV on Robinhood Chain)
  const jevEntryMc = 125500;
  const jevExitMc = 95800;
  const jevEntryUsd = 0.0004011;
  const jevExitUsd = 0.0003064;
  const jevEntryEth = jevEntryUsd / ethUsdPrice;
  const jevExitEth = jevExitUsd / ethUsdPrice;
  const jevEntryTotalEth = 0.0186;
  const jevExitTotalEth = 0.0142;
  const jevPnlEth = jevExitTotalEth - jevEntryTotalEth; // -0.0044 ETH
  const jevPnlUsd = (jevExitTotalEth * ethUsdPrice) - (jevEntryTotalEth * ethUsdPrice);
  const jevPnlPercent = ((jevExitTotalEth - jevEntryTotalEth) / jevEntryTotalEth) * 100; // -23.66%

  // 3. Asteroid Shiba (ASTEROID on Robinhood Chain)
  const astEntryMc = 84200;
  const astExitMc = 46100;
  const astEntryUsd = 0.000035;
  const astExitUsd = 0.00001918;
  const astEntryEth = astEntryUsd / ethUsdPrice;
  const astExitEth = astExitUsd / ethUsdPrice;
  const astEntryTotalEth = 0.0056;
  const astExitTotalEth = 0.00307;
  const astPnlEth = astExitTotalEth - astEntryTotalEth;
  const astPnlUsd = (astExitTotalEth * ethUsdPrice) - (astEntryTotalEth * ethUsdPrice);
  const astPnlPercent = ((astExitTotalEth - astEntryTotalEth) / astEntryTotalEth) * 100; // -45.18%

  // 4. Global Dollar (USDG on Robinhood Chain)
  const usdgEntryMc = 2500000;
  const usdgExitMc = 660000;
  const usdgEntryUsd = 1.0;
  const usdgExitUsd = 0.2641;
  const usdgEntryEth = usdgEntryUsd / ethUsdPrice;
  const usdgExitEth = usdgExitUsd / ethUsdPrice;
  const usdgEntryTotalEth = 0.00373;
  const usdgExitTotalEth = 0.000985;
  const usdgPnlEth = usdgExitTotalEth - usdgEntryTotalEth;
  const usdgPnlUsd = (usdgExitTotalEth * ethUsdPrice) - (usdgEntryTotalEth * ethUsdPrice);
  const usdgPnlPercent = ((usdgExitTotalEth - usdgEntryTotalEth) / usdgEntryTotalEth) * 100; // -73.59%

  return [
    {
      id: "pos-sma",
      walletId: 3,
      walletLabel: "Wallet #3",
      chain: "robinhood",
      symbol: "SMA",
      name: "Summa",
      contractAddress: "0x3bd9136d51af679bd1b11d06b951155543c5449f",
      holdAmount: 0, // Sudah terjual (Exit), sisa saldo hold = 0 SMA

      entryTime: "24 Sep 2026, 10:15",
      entryMc: smaEntryMc,
      entryPriceUsd: smaEntryUsd,
      entryPriceEth: smaEntryEth,
      entryAmount: 56860,
      entryTotalEth: smaEntryTotalEth,
      entryTotalUsd: smaEntryTotalEth * ethUsdPrice,

      isExited: true,
      exitTime: "26 Sep 2026, 14:30",
      exitMc: smaExitMc,
      exitPriceUsd: smaExitUsd,
      exitPriceEth: smaExitEth,
      exitAmount: 56460,
      exitTotalEth: smaExitTotalEth,
      exitTotalUsd: smaExitTotalEth * ethUsdPrice,

      pnlEth: smaPnlEth,
      pnlUsd: smaPnlUsd,
      pnlPercent: smaPnlPercent,
      mcDiffPercent: ((smaExitMc - smaEntryMc) / smaEntryMc) * 100, // -57.08%
      priceDiffPercent: ((smaExitUsd - smaEntryUsd) / smaEntryUsd) * 100, // -46.35%

      buyPriceUsd: smaEntryUsd,
      buyPriceEth: smaEntryEth,
      currentPriceUsd: smaExitUsd,
      currentPriceEth: smaExitEth,
      priceDiffUsd: smaExitUsd - smaEntryUsd,
      priceDiffEth: smaExitEth - smaEntryEth,

      status: "sold",
      buyDate: "2026-09-24",
      notes: "Robinhood Chain DexScreener swap",
    },
    {
      id: "pos-jev",
      walletId: 3,
      walletLabel: "Wallet #3",
      chain: "robinhood",
      symbol: "JEV",
      name: "OpenJEV",
      contractAddress: "0x4d066ab4d924b7b3d01c6ecbfc142efe33aeb7fa",
      holdAmount: 124647.01,

      entryTime: "22 Sep 2026, 09:00",
      entryMc: jevEntryMc,
      entryPriceUsd: jevEntryUsd,
      entryPriceEth: jevEntryEth,
      entryAmount: 124647.01,
      entryTotalEth: jevEntryTotalEth,
      entryTotalUsd: jevEntryTotalEth * ethUsdPrice,

      isExited: false,
      exitTime: "Live (Sedang Hold)",
      exitMc: jevExitMc,
      exitPriceUsd: jevExitUsd,
      exitPriceEth: jevExitEth,
      exitAmount: 124647.01,
      exitTotalEth: jevExitTotalEth,
      exitTotalUsd: jevExitTotalEth * ethUsdPrice,

      pnlEth: jevPnlEth,
      pnlUsd: jevPnlUsd,
      pnlPercent: jevPnlPercent,
      mcDiffPercent: ((jevExitMc - jevEntryMc) / jevEntryMc) * 100,
      priceDiffPercent: ((jevExitUsd - jevEntryUsd) / jevEntryUsd) * 100,

      buyPriceUsd: jevEntryUsd,
      buyPriceEth: jevEntryEth,
      currentPriceUsd: jevExitUsd,
      currentPriceEth: jevExitEth,
      priceDiffUsd: jevExitUsd - jevEntryUsd,
      priceDiffEth: jevExitEth - jevEntryEth,

      status: "holding",
      buyDate: "2026-09-22",
      notes: "Holding OpenJEV",
    },
    {
      id: "pos-ast",
      walletId: 3,
      walletLabel: "Wallet #3",
      chain: "robinhood",
      symbol: "ASTEROID",
      name: "Asteroid Shiba",
      contractAddress: "0x38aaf33082b20aff2e33433138de920f131b7777",
      holdAmount: 428571,

      entryTime: "19 Sep 2026, 16:40",
      entryMc: astEntryMc,
      entryPriceUsd: astEntryUsd,
      entryPriceEth: astEntryEth,
      entryAmount: 428571,
      entryTotalEth: astEntryTotalEth,
      entryTotalUsd: astEntryTotalEth * ethUsdPrice,

      isExited: false,
      exitTime: "Live (Sedang Hold)",
      exitMc: astExitMc,
      exitPriceUsd: astExitUsd,
      exitPriceEth: astExitEth,
      exitAmount: 428571,
      exitTotalEth: astExitTotalEth,
      exitTotalUsd: astExitTotalEth * ethUsdPrice,

      pnlEth: astPnlEth,
      pnlUsd: astPnlUsd,
      pnlPercent: astPnlPercent,
      mcDiffPercent: ((astExitMc - astEntryMc) / astEntryMc) * 100,
      priceDiffPercent: ((astExitUsd - astEntryUsd) / astEntryUsd) * 100,

      buyPriceUsd: astEntryUsd,
      buyPriceEth: astEntryEth,
      currentPriceUsd: astExitUsd,
      currentPriceEth: astExitEth,
      priceDiffUsd: astExitUsd - astEntryUsd,
      priceDiffEth: astExitEth - astEntryEth,

      status: "drawdown",
      buyDate: "2026-09-19",
      notes: "Meme token",
    },
    {
      id: "pos-usdg",
      walletId: 3,
      walletLabel: "Wallet #3",
      chain: "robinhood",
      symbol: "USDG",
      name: "Global Dollar",
      contractAddress: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      holdAmount: 10,

      entryTime: "15 Sep 2026, 11:20",
      entryMc: usdgEntryMc,
      entryPriceUsd: usdgEntryUsd,
      entryPriceEth: usdgEntryEth,
      entryAmount: 10,
      entryTotalEth: usdgEntryTotalEth,
      entryTotalUsd: usdgEntryTotalEth * ethUsdPrice,

      isExited: false,
      exitTime: "Live (Sedang Hold)",
      exitMc: usdgExitMc,
      exitPriceUsd: usdgExitUsd,
      exitPriceEth: usdgExitEth,
      exitAmount: 10,
      exitTotalEth: usdgExitTotalEth,
      exitTotalUsd: usdgExitTotalEth * ethUsdPrice,

      pnlEth: usdgPnlEth,
      pnlUsd: usdgPnlUsd,
      pnlPercent: usdgPnlPercent,
      mcDiffPercent: ((usdgExitMc - usdgEntryMc) / usdgEntryMc) * 100,
      priceDiffPercent: ((usdgExitUsd - usdgEntryUsd) / usdgEntryUsd) * 100,

      buyPriceUsd: usdgEntryUsd,
      buyPriceEth: usdgEntryEth,
      currentPriceUsd: usdgExitUsd,
      currentPriceEth: usdgExitEth,
      priceDiffUsd: usdgExitUsd - usdgEntryUsd,
      priceDiffEth: usdgExitEth - usdgEntryEth,

      status: "drawdown",
      buyDate: "2026-09-15",
      notes: "Robinhood Chain Pool",
    },
  ];
}

export function getTradePositions(): TokenTradePosition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getDefaultInitialPositions();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((p: TokenTradePosition) => {
        if (p.isExited || p.status === "sold") {
          return { ...p, holdAmount: 0 };
        }
        return p;
      });
    }
    const initial = getDefaultInitialPositions();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  } catch (err) {
    console.error("Failed to load trade positions:", err);
    return getDefaultInitialPositions();
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
  ethUsdPrice = 2680
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
  }
): TokenTradePosition {
  const ethUsdPrice = 2680;
  const quote = getInitialTokenPrice(pos.symbol, pos.contractAddress, ethUsdPrice);

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
  if (pos.contractAddress) {
    fetchLiveTokenPrice(pos.contractAddress, ethUsdPrice).then((live) => {
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
  ethUsdPrice = 2680
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
