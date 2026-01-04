import type { APIRoute } from 'astro';

export const prerender = false;

interface Env {
  DATA_MERGE_BUCKET: R2Bucket;
}

const DO_API_URL = 'https://api.kirubashankar.com';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = locals.runtime.env as Env;
    const bucket = env.DATA_MERGE_BUCKET;

    if (!bucket) {
      return new Response(
        JSON.stringify({ error: 'Storage not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { r2_key, email_column } = body;

    if (!r2_key || !email_column) {
      return new Response(
        JSON.stringify({ error: 'r2_key and email_column are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[email/jobs] Getting file from R2:', r2_key);

    // Get file from R2 (same approach as data-merge)
    const file = await bucket.get(r2_key);

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'File not found in storage' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create form data with file for DO API
    const formData = new FormData();
    const blob = new Blob([await file.arrayBuffer()], {
      type: file.httpMetadata?.contentType || 'text/csv',
    });

    const originalName = file.customMetadata?.originalName || r2_key.split('/').pop() || 'file.csv';
    formData.append('file', blob, originalName);
    formData.append('email_column', email_column);

    console.log('[email/jobs] Sending file to DO backend:', originalName);

    // Call DO API for processing
    const response = await fetch(`${DO_API_URL}/api/email/validate-file`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[email/jobs] DO API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Processing failed', details: errorText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[email/jobs] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create job', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
