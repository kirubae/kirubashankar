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

    // Decode the key (it's URL encoded)
    const key = decodeURIComponent(params.key || '');

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'No key provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const object = await bucket.get(key);

    if (!object) {
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');

    const originalName = object.customMetadata?.originalName || 'download';
    headers.set('Content-Disposition', `attachment; filename="${originalName}"`);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Download error:', error);
    return new Response(
      JSON.stringify({ error: 'Download failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
