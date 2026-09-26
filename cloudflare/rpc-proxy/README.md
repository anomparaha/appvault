# Plurivex RPC Proxy & Privacy Relay

A high-performance Cloudflare Worker that acts as a privacy shield and intelligent cache for blockchain RPC requests.

## Key Features

- **Privacy Relay**: Strips client IP addresses (`CF-Connecting-IP`, `X-Forwarded-For`) so upstream node providers cannot correlate wallet queries with user network identities.
- **Smart Edge Caching**: Caches idempotent read calls (`eth_getBalance`, `eth_blockNumber`, `getBalance`, etc.) with sub-minute TTLs to eliminate HTTP 429 rate-limiting during multi-wallet scans.
- **Automatic Failover & Hedging**: Transparently tries fallback upstreams if the primary RPC times out or returns rate limit errors.
- **Multi-Chain Routing**: Supports Ethereum (`/eth`), BNB Chain (`/bsc`), Base (`/base`), Arbitrum (`/arb`), Solana (`/sol`), and Bitcoin (`/btc`).

## Deployment

### Prerequisites
- Node.js 18+
- Cloudflare account with domain `plurivex.app`

### Deploy via Wrangler CLI
```bash
cd cloudflare/rpc-proxy
npm install
npx wrangler login
npx wrangler deploy
```

### Custom Domain Routing
In the Cloudflare Dashboard:
1. Navigate to **Workers & Pages** -> **plurivex-rpc-proxy**.
2. Go to **Settings** -> **Domains & Routes**.
3. Add Custom Domain: `rpc.plurivex.app`.
