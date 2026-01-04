import type { APIRoute } from 'astro';

export const prerender = false;

// GET: Get access logs for a collection
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;
    const { id } = params;

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
