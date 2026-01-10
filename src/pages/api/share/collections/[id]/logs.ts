import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '@lib/supabase';

export const prerender = false;

// Helper to validate JWT token and get user
async function validateToken(request: Request, cookies: import('astro').AstroCookies) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) return null;

  const supabase = createSupabaseServerClient(cookies);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  return error ? null : user;
}

// GET: Get access logs for a collection
export const GET: APIRoute = async ({ params, locals, request, cookies }) => {
  try {
    // Security: Validate JWT token
    const user = await validateToken(request, cookies);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { FILE_SHARE_DB } = locals.runtime.env;
    const { id } = params;

    // Verify collection ownership
    const collection = await FILE_SHARE_DB.prepare(`
      SELECT user_id FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(id).first<{ user_id: string }>();

    if (!collection) {
      return new Response(JSON.stringify({ error: 'Collection not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (collection.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get logs for this collection
    const result = await FILE_SHARE_DB.prepare(`
      SELECT * FROM collection_access_logs
      WHERE collection_id = ?
      ORDER BY accessed_at DESC
      LIMIT 100
    `).bind(id).all<{
      id: number;
      collection_id: string;
      email: string;
      accessed_at: string;
      ip_address: string | null;
      user_agent: string | null;
      location: string | null;
      action: string;
      success: number;
      failure_reason: string | null;
    }>();

    return new Response(JSON.stringify({ logs: result.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get collection logs error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get logs' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
