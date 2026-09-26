export interface TokenConfig {
  address: string;
  network: string;
  ticker: string;
  explorerUrl?: string;
  dexScreenerUrl?: string;
}

// ==============================================================================
// OFFICIAL TOKEN CONFIGURATION
// Configured with the official contract address and network provided by user.
// ==============================================================================
export const TOKEN_CONFIG: TokenConfig = {
  address: "0xf890d3fe2be22c6259bbe9f607692c7168556c93",
  network: "Robinhood",
  ticker: "$PLX",
};
