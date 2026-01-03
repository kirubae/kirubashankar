import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;

    const result = await FILE_SHARE_DB.prepare(`
      SELECT * FROM files
      WHERE is_deleted = 0
      ORDER BY created_at DESC
    `).all();

    return new Response(JSON.stringify({ files: result.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('List files error:', error);
    return new Response(JSON.stringify({ error: 'Failed to list files' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
