import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;

    // Get user_id from query params to filter files
    const userId = url.searchParams.get('user_id');

    if (!userId) {
      // No user_id provided - return empty (require auth)
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Only return standalone files (not in collections) belonging to this user
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
