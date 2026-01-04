import type { APIRoute } from 'astro';

export const prerender = false;

const DO_API_URL = 'https://api.kirubashankar.com';

export const GET: APIRoute = async ({ params }) => {
  try {
    const key = params.key;

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Result key required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Proxy to DO backend (server-to-server, no CORS issues)
    const response = await fetch(`${DO_API_URL}/api/email/results/${encodeURIComponent(key)}`);

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[email/results] Proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to get results', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
