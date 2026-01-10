import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    // Security: Require authentication - use session user_id, not query param
    if (!locals.user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { FILE_SHARE_DB } = locals.runtime.env;
    const userId = locals.user.id;

    // Only return standalone files (not in collections) belonging to authenticated user
    const result = await FILE_SHARE_DB.prepare(`
      SELECT * FROM files
      WHERE is_deleted = 0 AND collection_id IS NULL AND user_id = ?
      ORDER BY created_at DESC
    `).bind(userId).all();

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
