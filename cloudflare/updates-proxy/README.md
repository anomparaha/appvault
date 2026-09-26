# Plurivex Auto-Updater Proxy

A lightweight Cloudflare Worker relay for the Plurivex desktop application (Tauri v2) auto-updater.

## Purpose

1. **Brand Cloaking**: Masks raw GitHub Release URLs, serving `https://updates.plurivex.app/latest.json` while rewriting binary payload URLs to `https://plurivex.app/downloads/*`.
2. **Cryptographic Integrity**: Preserves Minisign binary signatures verbatim so the desktop client verifies release authenticity before updating.
3. **Rate-Limit Shielding**: Caches update manifests at Cloudflare edge nodes with a 3-minute TTL to prevent hitting GitHub API rate limits.

## Deployment

```bash
cd cloudflare/updates-proxy
npm install
npx wrangler login
npx wrangler deploy
```

### Custom Domain Routing
In the Cloudflare Dashboard:
1. Navigate to **Workers & Pages** -> **plurivex-updates-proxy**.
2. Go to **Settings** -> **Domains & Routes**.
3. Add Custom Domain: `updates.plurivex.app`.
