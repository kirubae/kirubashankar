import type { APIRoute } from 'astro';

export const prerender = false;

const DO_API_URL = 'https://api.kirubashankar.com';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    console.log('[email/jobs] Proxying job creation to DO backend:', body);

    // Proxy to DO backend (server-to-server, no CORS issues)
    const response = await fetch(`${DO_API_URL}/api/email/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    console.log('[email/jobs] DO backend response:', response.status, data);

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[email/jobs] Proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create job', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
