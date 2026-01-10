import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '@lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, cookies }) => {
  try {
    // Security: Validate JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate token and get user
    const supabase = createSupabaseServerClient(cookies);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { FILE_SHARE_DB } = locals.runtime.env;
    const userId = user.id;

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
