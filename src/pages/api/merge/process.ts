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
    const { primaryKey, secondaryKey, matchColumn1, matchColumn2, outputColumns } = body;

    // Get files from R2
    const [primaryFile, secondaryFile] = await Promise.all([
      bucket.get(primaryKey),
      bucket.get(secondaryKey),
    ]);

    if (!primaryFile || !secondaryFile) {
      return new Response(
        JSON.stringify({ error: 'Files not found in storage' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create form data with files for DO API
    const formData = new FormData();

    const primaryBlob = new Blob([await primaryFile.arrayBuffer()], {
      type: primaryFile.httpMetadata?.contentType || 'text/csv',
    });
    const secondaryBlob = new Blob([await secondaryFile.arrayBuffer()], {
      type: secondaryFile.httpMetadata?.contentType || 'text/csv',
    });

    formData.append('primary_file', primaryBlob, primaryFile.customMetadata?.originalName || 'primary.csv');
    formData.append('secondary_file', secondaryBlob, secondaryFile.customMetadata?.originalName || 'secondary.csv');
    formData.append('match_column_1', matchColumn1);
    formData.append('match_column_2', matchColumn2);
    formData.append('output_columns', JSON.stringify(outputColumns));

    // Call DO API for processing
    const doResponse = await fetch(`${DO_API_URL}/api/merge/jobs`, {
      method: 'POST',
      body: formData,
    });

    if (!doResponse.ok) {
      const errorText = await doResponse.text();
      console.error('DO API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Processing failed', details: errorText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await doResponse.json();

    // If job created, return job ID for polling
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Process error:', error);
    return new Response(
      JSON.stringify({ error: 'Processing failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
