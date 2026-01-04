import type { APIRoute } from 'astro';

export const prerender = false;

const DO_API_URL = 'https://api.kirubashankar.com';

export const GET: APIRoute = async ({ params }) => {
  try {
    const jobId = params.id;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'Job ID required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Proxy to DO backend (server-to-server, no CORS issues)
    const response = await fetch(`${DO_API_URL}/api/email/jobs/${jobId}`);

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[email/jobs/id] Proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to get job status', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
