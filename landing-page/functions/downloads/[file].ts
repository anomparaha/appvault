interface Env {
  UPSTREAM_EXE_URL?: string;
  UPSTREAM_MSI_URL?: string;
}

const DEFAULT_VERSION = 'v0.1.7';
const GITHUB_BASE = 'https://github.com/plurivexapp/plurivex-app/releases/download';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const file = context.params.file as string;

  const UPSTREAM_MAP: Record<string, string> = {
    'Plurivex_x64_setup.exe':
      context.env.UPSTREAM_EXE_URL ||
      `${GITHUB_BASE}/${DEFAULT_VERSION}/Plurivex_${DEFAULT_VERSION.replace('v', '')}_x64-setup.exe`,
    'Plurivex_x64.msi':
      context.env.UPSTREAM_MSI_URL ||
      `${GITHUB_BASE}/${DEFAULT_VERSION}/Plurivex_${DEFAULT_VERSION.replace('v', '')}_x64_en-US.msi`,
  };

  const targetUrl = UPSTREAM_MAP[file];
  if (!targetUrl) {
    return new Response('File not found', { status: 404 });
  }

  try {
    const upstream = await fetch(targetUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Plurivex-Delivery-Edge/1.0',
      },
    });

    if (!upstream.ok) {
      return new Response('Download temporarily unavailable', { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file}"`,
        'Cache-Control': 'public, max-age=300, s-maxage=300, must-revalidate',
      },
    });
  } catch {
    return new Response('Download service error', { status: 500 });
  }
};