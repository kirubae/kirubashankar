import type { APIRoute } from 'astro';

export const prerender = false;

const DO_API_URL = 'https://api.kirubashankar.com';

export const GET: APIRoute = async ({ params }) => {
  try {
    const jobId = params.jobId;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'Job ID required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Proxy to DO backend for download
    const response = await fetch(`${DO_API_URL}/api/email/download/${jobId}`);

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: 'Download failed', details: errorText }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Stream the CSV response
    const contentDisposition = response.headers.get('Content-Disposition') ||
      `attachment; filename=email-validation-${jobId}.csv`;

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': contentDisposition,
      },
    });
  } catch (error) {
    console.error('[email/download] Proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Download failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
