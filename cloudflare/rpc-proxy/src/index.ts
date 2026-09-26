/**
 * Plurivex Privacy-Preserving RPC Proxy & Relay
 *
 * Capabilities:
 * - Zero-logging privacy relay: strips client IP headers
 * - Multi-chain JSON-RPC routing (EVM, Solana, Bitcoin)
 * - Intelligent edge caching for idempotent read calls (anti-rate-limit 429)
 * - Automatic upstream failover & hedging
 */

interface Env {
  ENVIRONMENT?: string;
}

interface UpstreamConfig {
  readonly endpoints: readonly string[];
  readonly type: 'jsonrpc' | 'rest';
}

const UPSTREAMS: Record<string, UpstreamConfig> = {
  eth: {
    type: 'jsonrpc',
    endpoints: [
      'https://ethereum.publicnode.com',
      'https://eth.drpc.org',
      'https://cloudflare-eth.com',
      'https://rpc.ankr.com/eth',
    ],
  },
  bsc: {
    type: 'jsonrpc',
    endpoints: [
      'https://bsc-dataseed.binance.org',
      'https://bsc-dataseed1.defibit.io',
      'https://bsc-dataseed2.binance.org',
      'https://rpc.ankr.com/bsc',
    ],
  },
  base: {
    type: 'jsonrpc',
    endpoints: [
      'https://mainnet.base.org',
      'https://base.publicnode.com',
      'https://rpc.ankr.com/base',
    ],
  },
  arb: {
    type: 'jsonrpc',
    endpoints: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.publicnode.com',
      'https://rpc.ankr.com/arbitrum',
    ],
  },
  sol: {
    type: 'jsonrpc',
    endpoints: [
      'https://api.mainnet-beta.solana.com',
      'https://solana-rpc.publicnode.com',
    ],
  },
  btc: {
    type: 'rest',
    endpoints: [
      'https://mempool.space/api',
      'https://blockstream.info/api',
    ],
  },
};

// Aliases for user convenience
const CHAIN_ALIASES: Record<string, string> = {
  ethereum: 'eth',
  '1': 'eth',
  binance: 'bsc',
  '56': 'bsc',
  '8453': 'base',
  arbitrum: 'arb',
  '42161': 'arb',
  solana: 'sol',
  bitcoin: 'btc',
};

// Idempotent read methods mapped to cache TTL in seconds
const CACHEABLE_METHODS: Record<string, number> = {
  // EVM read methods
  eth_chainId: 3600,
  net_version: 3600,
  eth_blockNumber: 4,
  eth_getBalance: 6,
  eth_getCode: 300,
  eth_getStorageAt: 10,
  eth_call: 6,
  eth_estimateGas: 4,
  eth_getTransactionReceipt: 30,

  // Solana read methods
  getSlot: 2,
  getBlockHeight: 2,
  getBalance: 6,
  getAccountInfo: 6,
  getTokenAccountBalance: 6,
  getLatestBlockhash: 4,
  getTokenAccountsByOwner: 10,
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // 2. Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({
        status: 'online',
        service: 'plurivex-rpc-proxy',
        version: '1.0.0',
        supportedChains: Object.keys(UPSTREAMS),
        privacy: 'zero-logging-client-ip-scrubbed',
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Extract chain path
    const parts = url.pathname.replace(/^\/+/, '').split('/');
    let chainKey = parts[0]?.toLowerCase();
    if (!chainKey) {
      return jsonResponse({ error: 'Missing chain identifier in path (e.g. /eth, /sol, /btc)' }, 400);
    }

    if (CHAIN_ALIASES[chainKey]) {
      chainKey = CHAIN_ALIASES[chainKey];
    }

    const config = UPSTREAMS[chainKey];
    if (!config) {
      return jsonResponse(
        {
          error: `Unsupported chain '${chainKey}'`,
          available: Object.keys(UPSTREAMS),
        },
        404
      );
    }

    // 4. Handle Bitcoin REST proxy
    if (config.type === 'rest') {
      return handleRestProxy(request, url, config, parts.slice(1));
    }

    // 5. Handle JSON-RPC proxy (EVM / Solana)
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'JSON-RPC endpoints require POST method' }, 405);
    }

    return handleJsonRpcProxy(request, chainKey, config, ctx);
  },
};

/**
 * Handle REST API Proxy (e.g. Bitcoin Mempool / Blockstream)
 */
async function handleRestProxy(
  request: Request,
  url: URL,
  config: UpstreamConfig,
  subPathParts: string[]
): Promise<Response> {
  const restSubPath = subPathParts.join('/') + url.search;

  for (const upstreamBase of config.endpoints) {
    const targetUrl = `${upstreamBase}/${restSubPath}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'Plurivex-Privacy-Relay/1.0',
        },
        body: request.method === 'POST' ? await request.clone().arrayBuffer() : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (upstreamResponse.ok) {
        const body = await upstreamResponse.arrayBuffer();
        return new Response(body, {
          status: upstreamResponse.status,
          headers: {
            'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json',
            'X-Plurivex-Upstream': new URL(upstreamBase).hostname,
            ...CORS_HEADERS,
          },
        });
      }
    } catch {
      // Try next upstream on failure/timeout
      continue;
    }
  }

  return jsonResponse({ error: 'All REST upstreams failed or timed out' }, 502);
}

/**
 * Handle JSON-RPC Proxy with Smart Edge Caching & Failover
 */
async function handleJsonRpcProxy(
  request: Request,
  chainKey: string,
  config: UpstreamConfig,
  ctx: ExecutionContext
): Promise<Response> {
  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse({ error: 'Failed to read request body' }, 400);
  }

  let rpcReq: { jsonrpc?: string; method?: string; params?: unknown; id?: string | number };
  try {
    rpcReq = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const method = rpcReq.method || '';
  const ttlSeconds = CACHEABLE_METHODS[method] ?? 0;
  const isCacheable = ttlSeconds > 0 && rpcReq.id !== undefined;

  const cache = caches.default;
  let cacheKeyUrl: URL | null = null;

  // Attempt Cache Read for Idempotent Methods
  if (isCacheable) {
    const hash = await sha256(`${chainKey}:${method}:${JSON.stringify(rpcReq.params ?? [])}`);
    cacheKeyUrl = new URL(`https://cache.plurivex.internal/${chainKey}/${hash}`);

    const cachedResponse = await cache.match(cacheKeyUrl.toString());
    if (cachedResponse) {
      try {
        const cachedJson = await cachedResponse.json() as { jsonrpc?: string; result?: unknown; id?: unknown };
        // Update request ID to match caller's current ID
        cachedJson.id = rpcReq.id;
        return jsonResponse(cachedJson, 200, {
          'X-Plurivex-Cache': 'HIT',
          'X-Plurivex-Method': method,
        });
      } catch {
        // Fallback to live query if cache parse fails
      }
    }
  }

  // Live Query with Upstream Hedging / Failover
  for (const upstreamUrl of config.endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const upstreamResponse = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Plurivex-Privacy-Relay/1.0',
        },
        body: bodyText,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (upstreamResponse.status === 429) {
        // Rate-limited upstream, immediately fallback to next
        continue;
      }

      if (upstreamResponse.ok) {
        const responseData = await upstreamResponse.text();

        // Write to Edge Cache if cacheable
        if (isCacheable && cacheKeyUrl) {
          const responseToCache = new Response(responseData, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${ttlSeconds}`,
            },
          });
          ctx.waitUntil(cache.put(cacheKeyUrl.toString(), responseToCache));
        }

        return new Response(responseData, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Plurivex-Cache': 'MISS',
            'X-Plurivex-Upstream': new URL(upstreamUrl).hostname,
            ...CORS_HEADERS,
          },
        });
      }
    } catch {
      // Continue to next upstream on error
      continue;
    }
  }

  return jsonResponse(
    {
      jsonrpc: '2.0',
      id: rpcReq.id ?? null,
      error: {
        code: -32603,
        message: 'All Plurivex RPC upstreams failed, rate-limited, or timed out',
      },
    },
    502
  );
}
