/**
 * Chain & token types.
 */

export interface TokenBalance {
  walletId: number;
  chain: string;
  symbol: string;
  name: string;
  balance: string;
  rawBalance?: string;
  contractAddress?: string;
}
