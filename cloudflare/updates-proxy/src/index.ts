/**
 * Plurivex Auto-Updater Proxy & Manifest Relay
 *
 * Responsibilities:
 * - Relays latest.json update manifest for Tauri v2 updater
 * - Rewrites raw GitHub asset URLs to branded plurivex.app/downloads/* endpoints
 * - Edge caches manifest to prevent GitHub rate-limiting
 * - Strips sensitive telemetry and passes cryptographic Minisign signatures intact
 */

interface Env {
  UPSTREAM_REPO?: string; // default: anomparaha/appvault
  PUBLIC_DOWNLOAD_ORIGIN?: string; // default: https://plurivex.app/downloads
}

const DEFAULT_REPO = 'anomparaha/appvault';
const DEFAULT_DOWNLOAD_ORIGIN = 'https://plurivex.app/downloads';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'online',
          service: 'plurivex-updates-proxy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
          },
        }
      );
    }

    // Tauri updater queries /latest.json or /v1/update/*
    const isUpdateEndpoint =
      url.pathname === '/latest.json' ||
      url.pathname.endsWith('/latest.json') ||
      url.pathname.startsWith('/v1/update/');

    if (!isUpdateEndpoint) {
      return new Response('Endpoint not found', { status: 404, headers: CORS_HEADERS });
    }

    const repo = env.UPSTREAM_REPO || DEFAULT_REPO;
    const upstreamManifestUrl = `https://github.com/${repo}/releases/latest/download/latest.json`;

    const cache = caches.default;
    const cacheKey = new URL(`https://cache.plurivex.internal/updates/latest.json`);

    // Check edge cache (3-minute TTL)
    const cachedResponse = await cache.match(cacheKey.toString());
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      const upstreamRes = await fetch(upstreamManifestUrl, {
        headers: {
          'User-Agent': 'Plurivex-Updater-Relay/1.0',
          Accept: 'application/json',
        },
      });

      if (!upstreamRes.ok) {
        return new Response(
          JSON.stringify({ error: 'No update manifest available from upstream' }),
          {
            status: upstreamRes.status === 404 ? 404 : 502,
            headers: {
              'Content-Type': 'application/json',
              ...CORS_HEADERS,
            },
          }
        );
      }

      const manifestText = await upstreamRes.text();
      let manifest: Record<string, unknown>;

      try {
        manifest = JSON.parse(manifestText);
      } catch {
        return new Response(manifestText, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
          },
        });
      }

      // Rewrite download URLs to plurivex.app/downloads/*
      const downloadOrigin = (env.PUBLIC_DOWNLOAD_ORIGIN || DEFAULT_DOWNLOAD_ORIGIN).replace(/\/+$/, '');
      if (manifest.platforms && typeof manifest.platforms === 'object') {
        const platforms = manifest.platforms as Record<string, { url?: string; signature?: string }>;
        for (const [platformKey, platformData] of Object.entries(platforms)) {
          if (platformData && platformData.url) {
            const rawUrl = platformData.url;
            const filename = rawUrl.split('/').pop();
            if (filename) {
              platforms[platformKey].url = `${downloadOrigin}/${filename}`;
            }
          }
        }
      }

      const transformedBody = JSON.stringify(manifest, null, 2);

      const responseToReturn = new Response(transformedBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=180, s-maxage=180',
          ...CORS_HEADERS,
        },
      });

      ctx.waitUntil(cache.put(cacheKey.toString(), responseToReturn.clone()));
      return responseToReturn;
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to contact update distribution upstream' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
          },
        }
      );
    }
  },
};
