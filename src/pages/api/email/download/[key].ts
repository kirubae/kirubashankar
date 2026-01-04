import type { APIRoute } from 'astro';

export const prerender = false;

interface Env {
  DATA_MERGE_BUCKET: R2Bucket;
}

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const env = locals.runtime.env as Env;
    const bucket = env.DATA_MERGE_BUCKET;

    if (!bucket) {
      return new Response(
        JSON.stringify({ error: 'Storage not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // The key comes URL-encoded, decode it
    const key = decodeURIComponent(params.key || '');

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Key is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Download file from R2
    const object = await bucket.get(key);
    if (!object) {
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const filename = key.split('/').pop() || 'results.csv';

    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return new Response(
      JSON.stringify({ error: 'Download failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
