import { useState, useEffect, useMemo } from "react";
import type { Chain } from "../../../lib/chains/chains";
import type { WalletView } from "../../../lib/types/index";
import { ChainIcon } from "../../../icons/ChainIcon";
import { TokenIcon } from "../../../icons/TokenIcon";
import { IconCoin } from "../../../icons";
import { BalanceCard } from "./BalanceCard";
import { isOfficialTokenRecord } from "../../../services/officialTokenService";
import { useApp } from "../../../context/AppContext";
import { TokenValuationBadge } from "../../../services/tokenPriceService";
import { TokenTradeHistoryPanel } from "../../analytics/TokenTradeHistoryPanel";
import { getTradePositions, subscribeTradePositions, type TokenTradePosition } from "../../../services/tokenTradeHistoryService";

interface BalancePortfolioViewProps {
  wallet: WalletView;
  walletChains: readonly Chain[];
  isSol: boolean;
}

export function BalancePortfolioView({
  wallet,
  walletChains,
  isSol,
}: BalancePortfolioViewProps) {
  const { pricing, isAirGapped, sessionToken } = useApp();

  const [tradePositions, setTradePositions] = useState<TokenTradePosition[]>(() => getTradePositions());
  useEffect(() => {
    return subscribeTradePositions((latest) => setTradePositions(latest));
  }, []);

  const tradePositionsMap = useMemo(() => {
    const map = new Map<string, TokenTradePosition>();
    for (const position of tradePositions) {
      if (position.walletId !== wallet.id) continue;
      const chain = position.chain.toLowerCase();
      if (position.contractAddress) {
        map.set(`${chain}_${position.contractAddress.toLowerCase()}`, position);
      }
      map.set(`${chain}_${position.symbol.toLowerCase()}`, position);
    }
    return map;
  }, [tradePositions, wallet.id]);

  const sortedTokens = useMemo(() => {
    const list = wallet.tokens ? [...wallet.tokens] : [];

    return list.sort((a, b) => {
      const aIsOfficial = isOfficialTokenRecord(a);
      const bIsOfficial = isOfficialTokenRecord(b);
      if (aIsOfficial && !bIsOfficial) return -1;
      if (!aIsOfficial && bIsOfficial) return 1;
      return 0;
    });
  }, [wallet.tokens]);

  return (
    <>
      {/* Module B: Native Chain Balance Grid */}
      <div className="balance-section">
        <div className="balance-section-head">
          <h4 className="balance-section-title">
            {isSol ? "NATIVE SOLANA BALANCE" : "MULTI-CHAIN NATIVE BALANCES"}
          </h4>
          <span className="balance-section-hint">Realtime RPC Gas Reserves</span>
        </div>
        <div className="balance-cards">
          {walletChains.map((c) => (
            <BalanceCard key={c.key} chain={c} value={wallet.balances[c.key]} />
          ))}
        </div>
      </div>

      {/* Module C: Detected Token Holdings & Historical Traded Tokens Dual Layout */}
      <div
        className="token-holdings-dual-container"
        style={{
          borderTop: "1px dashed var(--border)",
          padding: "16px 0 0 0",
          marginTop: "16px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
          gap: "20px",
          alignItems: "start",
        }}
      >
        <div className="balance-section token-section" style={{ padding: 0, margin: 0, border: "none" }}>
          <div className="token-section-header" style={{ marginBottom: "12px" }}>
            <h4 className="balance-section-title" style={{ margin: 0 }}>
              DETECTED TOKEN HOLDINGS {wallet.tokens ? `(${wallet.tokens.length})` : "(0)"}
            </h4>
            <span className="token-section-subtitle">ERC-20 &amp; SPL Tokens</span>
          </div>

          {sortedTokens.length > 0 ? (
            <div className="token-cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))" }}>
              {sortedTokens.map((tok, idx) => {
                const isOfficial = isOfficialTokenRecord(tok);
                const tradePos = tradePositionsMap.get(
                  `${tok.chain.toLowerCase()}_${(tok.contractAddress || tok.symbol).toLowerCase()}`,
                );

                return (
                  <div
                    key={`${tok.chain}-${tok.symbol}-${idx}`}
                    className="token-card"
                    style={isOfficial ? {
                      border: "1px solid rgba(204, 255, 0, 0.38)",
                      background: "linear-gradient(145deg, rgba(204, 255, 0, 0.06) 0%, var(--surface) 100%)",
                      boxShadow: "0 2px 10px rgba(204, 255, 0, 0.10)",
                    } : undefined}
                  >
                    <div className="token-card-top">
                      <span className="token-symbol" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <TokenIcon
                          chain={tok.chain}
                          symbol={tok.symbol}
                          contractAddress={tok.contractAddress}
                          name={tok.name}
                          size={16}
                        />
                        {tok.symbol}
                        {isOfficial && (
                          <span
                            style={{
                              fontSize: "8px",
                              fontWeight: "800",
                              background: "rgba(34, 197, 94, 0.2)",
                              color: "#4ade80",
                              border: "1px solid rgba(34, 197, 94, 0.4)",
                              padding: "1px 4px",
                              borderRadius: "3px",
                              marginLeft: "3px",
                            }}
                          >
                            VERIFIED ✓
                          </span>
                        )}
                      </span>
                      <span
                        className={`token-chain-badge chain-${tok.chain}`}
                        title={tok.chain.toUpperCase()}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "2px 5px",
                          borderRadius: "4px",
                        }}
                      >
                        <ChainIcon chain={tok.chain} size={14} />
                      </span>
                    </div>
                    <div className="token-card-name">
                      {isOfficial ? "Official Plurivex Ecosystem Token" : tok.name}
                    </div>
                    <div className="token-card-balance mono">{tok.balance}</div>
                    <TokenValuationBadge
                      token={tok}
                      ethUsdPrice={pricing?.getUsd("ETH") ?? 0}
                      getUsd={pricing?.getUsd}
                      livePriceEnabled={Boolean(sessionToken) && !isAirGapped}
                    />

                    {/* Live Minus / P&L Badge */}
                    {tradePos && tradePos.priceDiffPercent !== 0 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "4px",
                          marginTop: "5px",
                          fontSize: "10px",
                          fontFamily: "var(--mono)",
                          color: tradePos.priceDiffPercent < 0 ? "#f43f5e" : "#10b981",
                          background: tradePos.priceDiffPercent < 0 ? "rgba(244, 63, 94, 0.08)" : "rgba(16, 185, 129, 0.08)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: tradePos.priceDiffPercent < 0 ? "1px solid rgba(244, 63, 94, 0.22)" : "1px solid rgba(16, 185, 129, 0.22)",
                        }}
                        title={`Harga Beli: $${tradePos.buyPriceUsd} | Sekarang: $${tradePos.currentPriceUsd}`}
                      >
                        <span>{tradePos.priceDiffPercent < 0 ? "Minus Harga:" : "Profit Harga:"}</span>
                        <span>{tradePos.priceDiffPercent < 0 ? "" : "+"}{tradePos.priceDiffPercent.toFixed(2)}%</span>
                      </div>
                    )}

                    {tok.contractAddress && (
                      <div style={{ fontSize: "9px", color: "var(--text-dim)", fontFamily: "var(--mono)", marginTop: "4px" }}>
                        Contract: {tok.contractAddress.slice(0, 6)}...{tok.contractAddress.slice(-6)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="token-empty-notice">
              <span className="notice-icon"><IconCoin size={16} /></span>
              <span>No secondary ERC-20 or SPL tokens detected on this wallet. Native balances are monitored above.</span>
            </div>
          )}
        </div>

        {/* Right Column: Historical Traded Tokens & Minus Analysis */}
        <TokenTradeHistoryPanel
          activeWallets={[wallet]}
          ethUsdPrice={pricing?.getUsd("ETH") ?? 0}
        />
      </div>
    </>
  );
}
