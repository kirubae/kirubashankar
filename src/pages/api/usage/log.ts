import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request, clientAddress }) => {
  const { supabase, user } = locals;

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { tool_slug, action, metadata } = await request.json();

    const { error } = await supabase.from('usage_logs').insert({
      user_id: user.id,
      tool_slug,
      action,
      metadata: metadata || {},
      ip_address: clientAddress || request.headers.get('cf-connecting-ip'),
      user_agent: request.headers.get('user-agent'),
    });

    if (error) {
      console.error('Usage log error:', error);
      return new Response(JSON.stringify({ error: 'Failed to log usage' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Usage log error:', err);
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
