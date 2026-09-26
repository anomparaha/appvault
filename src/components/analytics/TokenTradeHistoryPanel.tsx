import { useState, useEffect, useMemo } from "react";
import {
  getTradePositions,
  subscribeTradePositions,
  addTradePosition,
  deleteTradePosition,
  updatePositionBuyPrice,
  formatMarketCap,
  formatEthValue,
  formatTokenPrice,
  type TokenTradePosition,
} from "../../services/tokenTradeHistoryService";
import { TokenIcon } from "../../icons/TokenIcon";
import { useApp } from "../../context/AppContext";
import { IconTrash } from "../../icons";
import type { WalletView } from "../../lib/types/index";

interface TokenTradeHistoryPanelProps {
  activeWallets?: WalletView[];
  ethUsdPrice?: number;
}

export function TokenTradeHistoryPanel({
  activeWallets,
  ethUsdPrice = 0,
}: TokenTradeHistoryPanelProps) {
  const { isAirGapped, sessionToken, toast } = useApp();
  const [positions, setPositions] = useState<TokenTradePosition[]>(() => getTradePositions());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State for Add Trade Modal
  const [formSymbol, setFormSymbol] = useState("");
  const [formName, setFormName] = useState("");
  const [formChain, setFormChain] = useState("robinhood");
  const [formContract, setFormContract] = useState("");
  const [formHoldAmount, setFormHoldAmount] = useState("");
  const [formEntryTime, setFormEntryTime] = useState("");
  const [formEntryMc, setFormEntryMc] = useState("");
  const [formEntryPriceUsd, setFormEntryPriceUsd] = useState("");
  const [formEntryTotalEth, setFormEntryTotalEth] = useState("");

  const [formIsExited, setFormIsExited] = useState(false);
  const [formExitTime, setFormExitTime] = useState("");
  const [formExitMc, setFormExitMc] = useState("");
  const [formExitPriceUsd, setFormExitPriceUsd] = useState("");
  const [formExitTotalEth, setFormExitTotalEth] = useState("");

  // Inline Quick Edit for Buy Price
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPriceInput, setEditPriceInput] = useState("");

  useEffect(() => {
    const unsub = subscribeTradePositions((latest) => {
      setPositions(latest);
    });
    return unsub;
  }, []);

  // Filter positions for active wallet
  const filteredPositions = useMemo(() => {
    if (!activeWallets) return positions;
    if (activeWallets.length === 0) return [];
    const activeIds = new Set(activeWallets.map((w) => w.id));

    return positions.filter((position) =>
      position.walletId !== undefined && activeIds.has(position.walletId),
    );
  }, [positions, activeWallets]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalPnlEth = 0;
    let totalPnlUsd = 0;
    let minusCount = 0;
    let profitCount = 0;

    for (const p of filteredPositions) {
      totalPnlEth += p.pnlEth;
      totalPnlUsd += p.pnlUsd;
      if (p.pnlEth < 0) minusCount++;
      else if (p.pnlEth > 0) profitCount++;
    }

    return {
      totalPnlEth,
      totalPnlUsd,
      minusCount,
      profitCount,
    };
  }, [filteredPositions]);

  const handleSaveTrade = (e: React.FormEvent) => {
    e.preventDefault();
    const entryMcNum = parseFloat(formEntryMc) || 0;
    const entryPriceUsdNum = parseFloat(formEntryPriceUsd) || 0;
    const entryPriceEthNum = ethUsdPrice > 0 ? entryPriceUsdNum / ethUsdPrice : 0;
    const entryTotalEthNum = parseFloat(formEntryTotalEth) || 0;
    const entryTotalUsdNum = entryTotalEthNum * ethUsdPrice;
    const holdAmountNum = parseFloat(formHoldAmount) || 0;

    const exitMcNum = parseFloat(formExitMc) || 0;
    const exitPriceUsdNum = parseFloat(formExitPriceUsd) || 0;
    const exitPriceEthNum = ethUsdPrice > 0 ? exitPriceUsdNum / ethUsdPrice : 0;
    const exitTotalEthNum = parseFloat(formExitTotalEth) || 0;
    const exitTotalUsdNum = exitTotalEthNum * ethUsdPrice;

    if (!formSymbol.trim() || holdAmountNum <= 0 || entryPriceUsdNum <= 0 || entryTotalEthNum <= 0 ||
      (formIsExited && (exitPriceUsdNum <= 0 || exitTotalEthNum <= 0))) {
      toast("Isi simbol, jumlah token, harga masuk, dan total transaksi yang valid.", "error");
      return;
    }
    if (activeWallets && activeWallets.length !== 1) return;
    const activeId = activeWallets?.[0]?.id;

    addTradePosition({
      walletId: activeId,
      walletLabel: activeId === undefined ? undefined : `Wallet #${activeId}`,
      chain: formChain,
      symbol: formSymbol.trim().toUpperCase(),
      name: formName.trim() || formSymbol.trim().toUpperCase(),
      contractAddress: formContract.trim(),
      holdAmount: holdAmountNum,

      entryTime: formEntryTime,
      entryMc: entryMcNum,
      entryPriceUsd: entryPriceUsdNum,
      entryPriceEth: entryPriceEthNum,
      entryAmount: holdAmountNum,
      entryTotalEth: entryTotalEthNum,
      entryTotalUsd: entryTotalUsdNum,

      isExited: formIsExited,
      exitTime: formIsExited ? formExitTime : "Live (Sedang Hold)",
      exitMc: exitMcNum,
      exitPriceUsd: exitPriceUsdNum,
      exitPriceEth: exitPriceEthNum,
      exitAmount: holdAmountNum,
      exitTotalEth: exitTotalEthNum,
      exitTotalUsd: exitTotalUsdNum,

      status: formIsExited ? "sold" : exitPriceUsdNum < entryPriceUsdNum ? "drawdown" : "profit",
      buyDate: formEntryTime.slice(0, 10),
    }, { livePriceEnabled: Boolean(sessionToken) && !isAirGapped, ethUsdPrice });

    setIsAddModalOpen(false);
  };

  const handleStartEdit = (pos: TokenTradePosition) => {
    setEditingId(pos.id);
    setEditPriceInput(pos.entryPriceUsd.toString());
  };

  const handleSaveEditPrice = (posId: string) => {
    const parsed = parseFloat(editPriceInput.replace(/,/g, ""));
    if (!isNaN(parsed) && parsed >= 0) {
      updatePositionBuyPrice(posId, parsed, ethUsdPrice);
    }
    setEditingId(null);
  };

  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#FFFFFF" }}>
              Riwayat Beli & Monitor Minus Token
            </span>
            <span
              style={{
                fontSize: "10px",
                background: "rgba(56, 189, 248, 0.15)",
                color: "#38bdf8",
                padding: "2px 6px",
                borderRadius: "4px",
                fontWeight: 600,
              }}
            >
              {filteredPositions.length} Token
            </span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "2px" }}>
            Perhitungan minus riil berdasarkan modal masuk vs nilai keluar/sekarang (ETH, USD, MC, & Harga).
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            disabled={activeWallets !== undefined && activeWallets.length !== 1}
            title={activeWallets !== undefined && activeWallets.length !== 1
              ? "Pilih tepat satu wallet agar trade tercatat pada wallet yang benar."
              : undefined}
            onClick={() => setIsAddModalOpen(true)}
            style={{
              background: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              borderRadius: "6px",
              padding: "5px 10px",
              fontSize: "11px",
              fontWeight: 650,
              cursor: activeWallets !== undefined && activeWallets.length !== 1 ? "not-allowed" : "pointer",
              opacity: activeWallets !== undefined && activeWallets.length !== 1 ? 0.5 : 1,
            }}
          >
            + Catat Trade
          </button>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "10px",
          background: "var(--surface-2)",
          padding: "10px 14px",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          fontSize: "12px",
        }}
      >
        <div>
          <div style={{ color: "var(--text-secondary)", fontSize: "11px", fontWeight: 500 }}>Total Minus / PnL ETH:</div>
          <div
            className="mono"
            style={{
              fontWeight: 750,
              fontSize: "13.5px",
              color: stats.totalPnlEth < 0 ? "#f43f5e" : "#10b981",
              marginTop: "2px",
            }}
          >
            {stats.totalPnlEth < 0 ? "" : "+"}
            {stats.totalPnlEth.toFixed(5)} ETH
          </div>
        </div>

        <div>
          <div style={{ color: "var(--text-secondary)", fontSize: "11px", fontWeight: 500 }}>Total Minus / PnL USD:</div>
          <div
            className="mono"
            style={{
              fontWeight: 750,
              fontSize: "13.5px",
              color: stats.totalPnlUsd < 0 ? "#f43f5e" : "#10b981",
              marginTop: "2px",
            }}
          >
            {stats.totalPnlUsd < 0 ? "-" : "+"}${Math.abs(stats.totalPnlUsd).toFixed(2)} USD
          </div>
        </div>

        <div>
          <div style={{ color: "var(--text-secondary)", fontSize: "11px", fontWeight: 500 }}>Status Posisi:</div>
          <div style={{ fontWeight: 650, fontSize: "12.5px", marginTop: "2px" }}>
            <span style={{ color: "#f43f5e" }}>{stats.minusCount} Minus</span>
            <span style={{ color: "var(--text-faint)", margin: "0 6px" }}>/</span>
            <span style={{ color: "#10b981" }}>{stats.profitCount} Profit</span>
          </div>
        </div>
      </div>

      {/* ── GRID KARTU TOKEN (Font Size Lebih Besar & Jelas Dibaca) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))",
          gap: "14px",
          overflowY: "auto",
          maxHeight: "520px",
          paddingRight: "2px",
        }}
      >
        {filteredPositions.length === 0 ? (
          <div
            style={{
              padding: "36px 16px",
              textAlign: "center",
              color: "var(--text-dim)",
              fontSize: "12px",
              background: "var(--surface-2)",
              borderRadius: "8px",
              border: "1px dashed var(--border)",
              gridColumn: "1 / -1",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "20px" }}>📊</span>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>
              Belum ada riwayat transaksi token pada dompet terpilih.
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>
              Gunakan tombol <b>+ Catat Trade</b> di atas untuk menambahkan riwayat transaksi token baru.
            </span>
          </div>
        ) : (
          filteredPositions.map((pos) => {
          const isLoss = pos.pnlEth < 0;
          const isEditing = editingId === pos.id;

          // Rasio sisa nilai ETH terhadap modal masuk ETH
          const ratioPercent =
            pos.entryTotalEth > 0
              ? Math.max(0, Math.min(100, (pos.exitTotalEth / pos.entryTotalEth) * 100))
              : 0;

          return (
            <div
              key={pos.id}
              style={{
                background: "var(--surface-2)",
                border: isLoss ? "1px solid rgba(244, 63, 94, 0.3)" : "1px solid var(--border)",
                borderRadius: "10px",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "11px",
              }}
            >
              {/* Header Kartu: Simbol + Edit + Status + Delete */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <TokenIcon
                    chain={pos.chain}
                    contractAddress={pos.contractAddress}
                    symbol={pos.symbol}
                    name={pos.name}
                    size={24}
                  />
                  <span style={{ fontWeight: 800, fontSize: "16px", color: "#FFFFFF" }}>{pos.symbol}</span>
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(pos)}
                      title="Klik untuk ubah harga beli masuk"
                      style={{
                        background: "rgba(163, 230, 53, 0.2)",
                        border: "1px solid rgba(163, 230, 53, 0.4)",
                        borderRadius: "4px",
                        color: "#a3e635",
                        cursor: "pointer",
                        padding: "2px 6px",
                        fontSize: "12px",
                      }}
                    >
                      ✏️
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "10.5px",
                      fontWeight: 750,
                      padding: "3px 8px",
                      borderRadius: "4px",
                      background: pos.isExited ? "rgba(244, 63, 94, 0.18)" : "rgba(56, 189, 248, 0.18)",
                      color: pos.isExited ? "#f43f5e" : "#38bdf8",
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                    }}
                  >
                    {pos.isExited ? "TERJUAL / SOLD" : pos.pnlEth < 0 ? "DRAWDOWN" : "HOLDING"}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTradePosition(pos.id)}
                    title="Hapus token ini"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-faint)",
                      cursor: "pointer",
                      padding: "3px",
                    }}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>

              {/* Sub-header: Nama Token & Hold Amount */}
              <div
                style={{
                  fontSize: "12.5px",
                  color: "var(--text-secondary)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{pos.name}</span>
                {pos.isExited || pos.holdAmount <= 0 ? (
                  <span className="mono" style={{ color: "#f43f5e", fontWeight: 700, fontSize: "12px" }}>
                    Sudah Terjual (0 {pos.symbol})
                  </span>
                ) : (
                  <span className="mono" style={{ color: "#FFFFFF", fontWeight: 650 }}>
                    Hold: {pos.holdAmount.toLocaleString()} {pos.symbol}
                  </span>
                )}
              </div>

              {/* Box Perbandingan: Masuk vs Keluar / Sekarang */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  background: "rgba(0, 0, 0, 0.3)",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              >
                {/* Sisi Kiri: Masuk */}
                <div style={{ borderRight: "1px solid rgba(255, 255, 255, 0.06)", paddingRight: "6px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 650, display: "flex", alignItems: "center", gap: "3px", marginBottom: "3px" }}>
                    <span>Harga Beli (Masuk):</span>
                  </div>

                  {isEditing ? (
                    <div style={{ display: "flex", gap: "3px", marginTop: "3px" }}>
                      <input
                        type="text"
                        value={editPriceInput}
                        onChange={(e) => setEditPriceInput(e.target.value)}
                        autoFocus
                        style={{
                          width: "80px",
                          padding: "2px 5px",
                          fontSize: "11.5px",
                          background: "var(--surface)",
                          color: "#fff",
                          border: "1px solid var(--accent)",
                          borderRadius: "4px",
                          fontFamily: "var(--mono)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEditPrice(pos.id)}
                        style={{
                          background: "var(--ok)",
                          color: "#000",
                          border: "none",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          fontSize: "10px",
                          fontWeight: 750,
                          cursor: "pointer",
                        }}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mono" style={{ fontWeight: 750, fontSize: "13.5px", color: "#FFFFFF" }}>
                        {formatTokenPrice(pos.entryPriceUsd)}
                      </div>
                      <div className="mono" style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "1px" }}>
                        ≈ {formatTokenPrice(pos.entryPriceEth, true, pos.chain)}
                      </div>
                    </>
                  )}

                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "6px" }}>
                    MC: <strong className="mono" style={{ color: "#10b981", fontSize: "11.5px" }}>{formatMarketCap(pos.entryMc)}</strong>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Modal: <strong className="mono" style={{ color: "#10b981", fontSize: "11.5px" }}>{formatEthValue(pos.entryTotalEth, pos.chain)}</strong>
                  </div>
                  <div style={{ fontSize: "10.5px", color: "var(--text-dim)", marginTop: "3px" }}>
                    {pos.entryTime}
                  </div>
                </div>

                {/* Sisi Kanan: Keluar / Sekarang */}
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 650, marginBottom: "3px" }}>
                    {pos.isExited ? "Harga Jual (Keluar):" : "Harga Sekarang:"}
                  </div>
                  <div className="mono" style={{ fontWeight: 750, fontSize: "13.5px", color: isLoss ? "#fb7185" : "#4ade80" }}>
                    {formatTokenPrice(pos.exitPriceUsd)}
                  </div>
                  <div className="mono" style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "1px" }}>
                    ≈ {formatTokenPrice(pos.exitPriceEth, true, pos.chain)}
                  </div>

                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "6px" }}>
                    MC: <strong className="mono" style={{ color: isLoss ? "#fb7185" : "#4ade80", fontSize: "11.5px" }}>{formatMarketCap(pos.exitMc)}</strong>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {pos.isExited ? "Hasil Jual: " : "Nilai Sekarang: "}
                    <strong className="mono" style={{ color: isLoss ? "#fb7185" : "#4ade80", fontSize: "11.5px" }}>
                      {formatEthValue(pos.exitTotalEth, pos.chain)}
                    </strong>
                  </div>
                  <div style={{ fontSize: "10.5px", color: "var(--text-dim)", marginTop: "3px" }}>
                    {pos.exitTime || "Live (Sedang Hold)"}
                  </div>
                </div>
              </div>

              {/* ── KOTAK HIGHLIGHT MINUS (Font Jelas, Mudah Dibaca) ── */}
              <div
                style={{
                  background: isLoss ? "rgba(244, 63, 94, 0.14)" : "rgba(16, 185, 129, 0.14)",
                  border: isLoss ? "1px solid rgba(244, 63, 94, 0.35)" : "1px solid rgba(16, 185, 129, 0.35)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {/* Header Highlight: Label & Persentase */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 800,
                      color: isLoss ? "#f43f5e" : "#10b981",
                    }}
                  >
                    {isLoss ? "Minus Penurunan:" : "Kenaikan Profit:"}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: "15px",
                      fontWeight: 800,
                      color: isLoss ? "#f43f5e" : "#10b981",
                    }}
                  >
                    {pos.pnlPercent < 0 ? "" : "+"}
                    {pos.pnlPercent.toFixed(2)}%
                  </span>
                </div>

                {/* Rincian Minus Native: Berapa dari Berapa */}
                <div style={{ fontSize: "12px", color: "var(--text-primary)", fontFamily: "var(--mono)", lineHeight: "1.4" }}>
                  <span>
                    {isLoss ? "Minus " : "Profit "}
                    <strong style={{ color: isLoss ? "#fb7185" : "#4ade80", fontSize: "12.5px" }}>
                      {formatEthValue(pos.pnlEth, pos.chain)}
                    </strong>
                    {" "}(Modal masuk {formatEthValue(pos.entryTotalEth, pos.chain)} → {pos.isExited ? "Hasil jual" : "Nilai sekarang"} {formatEthValue(pos.exitTotalEth, pos.chain)})
                  </span>
                </div>

                {/* Rincian Minus USD */}
                <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", fontFamily: "var(--mono)" }}>
                  <span>
                    USD: <strong style={{ color: isLoss ? "#fb7185" : "#4ade80" }}>{pos.pnlUsd < 0 ? "-" : "+"}${Math.abs(pos.pnlUsd).toFixed(2)} USD</strong>
                    {" "}(dari ${pos.entryTotalUsd.toFixed(2)} → ${pos.exitTotalUsd.toFixed(2)})
                  </span>
                </div>

                {/* Rincian Penurunan MC & Harga */}
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--mono)", marginTop: "2px", lineHeight: "1.35" }}>
                  <div>
                    MC: {formatMarketCap(pos.entryMc)} → {formatMarketCap(pos.exitMc)}{" "}
                    <span style={{ color: pos.mcDiffPercent < 0 ? "#fb7185" : "#4ade80" }}>
                      ({pos.mcDiffPercent < 0 ? "" : "+"}{pos.mcDiffPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div>
                    Harga: {formatTokenPrice(pos.entryPriceUsd)} → {formatTokenPrice(pos.exitPriceUsd)}{" "}
                    <span style={{ color: pos.priceDiffPercent < 0 ? "#fb7185" : "#4ade80" }}>
                      ({pos.priceDiffPercent < 0 ? "" : "+"}{pos.priceDiffPercent.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                {/* Visual Ratio Progress Bar */}
                <div
                  style={{
                    height: "5px",
                    width: "100%",
                    background: "rgba(244, 63, 94, 0.35)",
                    borderRadius: "3px",
                    overflow: "hidden",
                    marginTop: "5px",
                  }}
                  title={`Sisa nilai ${ratioPercent.toFixed(1)}% dari modal masuk`}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${ratioPercent}%`,
                      background: isLoss ? "#f43f5e" : "#10b981",
                      borderRadius: "3px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        }))}
      </div>

      {/* ── MODAL: CATAT TRADE BARU (MASUK / KELUAR) ── */}
      {isAddModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "20px",
              width: "100%",
              maxWidth: "460px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "15px", color: "#FFFFFF" }}>Catat Trade Masuk & Keluar</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "16px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTrade} style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "11.5px" }}>
              {/* Token Info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ display: "block", color: "var(--text-dim)", marginBottom: "3px" }}>Simbol Token</label>
                  <input
                    type="text"
                    value={formSymbol}
                    onChange={(e) => setFormSymbol(e.target.value)}
                    required
                    style={{ width: "100%", padding: "6px", background: "var(--surface-2)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-dim)", marginBottom: "3px" }}>Nama Token</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    style={{ width: "100%", padding: "6px", background: "var(--surface-2)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ display: "block", color: "var(--text-dim)", marginBottom: "3px" }}>Chain</label>
                  <select
                    value={formChain}
                    onChange={(e) => setFormChain(e.target.value)}
                    style={{ width: "100%", padding: "6px", background: "var(--surface-2)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                  >
                    <option value="robinhood">Robinhood Chain</option>
                    <option value="base">Base</option>
                    <option value="ethereum">Ethereum</option>
                    <option value="solana">Solana</option>
                    <option value="arbitrum">Arbitrum</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-dim)", marginBottom: "3px" }}>Jumlah Token (Hold Amount)</label>
                  <input
                    type="text"
                    value={formHoldAmount}
                    onChange={(e) => setFormHoldAmount(e.target.value)}
                    placeholder="Token amount"
                    style={{ width: "100%", padding: "6px", background: "var(--surface-2)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", color: "var(--text-dim)", marginBottom: "3px" }}>Contract Address</label>
                <input
                  type="text"
                  value={formContract}
                  onChange={(e) => setFormContract(e.target.value)}
                  placeholder="0x..."
                  style={{ width: "100%", padding: "6px", background: "var(--surface-2)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px", fontFamily: "var(--mono)" }}
                />
              </div>

              {/* Sisi Masuk (Entry / Buy) */}
              <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "6px", padding: "10px" }}>
                <div style={{ fontWeight: 700, color: "#10b981", marginBottom: "6px" }}>🟢 Sisi Masuk (Entry / Buy)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ display: "block", color: "var(--text-dim)", fontSize: "10px" }}>Waktu Masuk</label>
                    <input
                      type="text"
                      value={formEntryTime}
                      onChange={(e) => setFormEntryTime(e.target.value)}
                      style={{ width: "100%", padding: "4px", background: "var(--surface)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "var(--text-dim)", fontSize: "10px" }}>MC Masuk ($ USD)</label>
                    <input
                      type="number"
                      step="any"
                      value={formEntryMc}
                      onChange={(e) => setFormEntryMc(e.target.value)}
                      placeholder="Entry market cap (optional)"
                      style={{ width: "100%", padding: "4px", background: "var(--surface)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "var(--text-dim)", fontSize: "10px" }}>Harga Masuk ($ USD)</label>
                    <input
                      type="text"
                      value={formEntryPriceUsd}
                      onChange={(e) => setFormEntryPriceUsd(e.target.value)}
                      placeholder="Entry price in USD"
                      style={{ width: "100%", padding: "4px", background: "var(--surface)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", color: "var(--text-dim)", fontSize: "10px" }}>
                      Total {formChain === "solana" ? "SOL" : formChain === "bsc" ? "BNB" : "ETH"} Masuk
                    </label>
                    <input
                      type="text"
                      value={formEntryTotalEth}
                      onChange={(e) => setFormEntryTotalEth(e.target.value)}
                      placeholder="Total invested in native coin"
                      style={{ width: "100%", padding: "4px", background: "var(--surface)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                    />
                  </div>
                </div>
              </div>

              {/* Sisi Keluar (Exit / Sell) */}
              <div style={{ background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.25)", borderRadius: "6px", padding: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 700, color: "#f43f5e" }}>🔴 Sisi Keluar (Exit / Sell)</span>
                  <label style={{ fontSize: "10.5px", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={formIsExited}
                      onChange={(e) => setFormIsExited(e.target.checked)}
                    />
                    Sudah Keluar / Jual
                  </label>
                </div>

                {formIsExited ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ display: "block", color: "var(--text-dim)", fontSize: "10px" }}>Waktu Keluar</label>
                      <input
                        type="text"
                        value={formExitTime}
                        onChange={(e) => setFormExitTime(e.target.value)}
                        style={{ width: "100%", padding: "4px", background: "var(--surface)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", color: "var(--text-dim)", fontSize: "10px" }}>MC Keluar ($ USD)</label>
                      <input
                        type="number"
                        step="any"
                        value={formExitMc}
                        onChange={(e) => setFormExitMc(e.target.value)}
                        placeholder="Exit market cap (optional)"
                        style={{ width: "100%", padding: "4px", background: "var(--surface)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", color: "var(--text-dim)", fontSize: "10px" }}>Harga Keluar ($ USD)</label>
                      <input
                        type="text"
                        value={formExitPriceUsd}
                        onChange={(e) => setFormExitPriceUsd(e.target.value)}
                        placeholder="Exit price in USD"
                        style={{ width: "100%", padding: "4px", background: "var(--surface)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", color: "var(--text-dim)", fontSize: "10px" }}>
                        Total {formChain === "solana" ? "SOL" : formChain === "bsc" ? "BNB" : "ETH"} Keluar
                      </label>
                      <input
                        type="text"
                        value={formExitTotalEth}
                        onChange={(e) => setFormExitTotalEth(e.target.value)}
                        placeholder="Total received in native coin"
                        style={{ width: "100%", padding: "4px", background: "var(--surface)", color: "#fff", border: "1px solid var(--border)", borderRadius: "4px" }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "10.5px", color: "var(--text-dim)", fontStyle: "italic" }}>
                    Token masih di-hold. Nilai saat ini akan dipantau secara live dari DexScreener.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-dim)", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ background: "var(--accent)", border: "none", color: "#FFFFFF", padding: "6px 14px", borderRadius: "4px", fontWeight: 700, cursor: "pointer" }}
                >
                  Simpan Transaksi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
