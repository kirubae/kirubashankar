import type { APIRoute } from 'astro';
import { generateFileId, sha256 } from '@utils/share';
import { createSupabaseServerClient } from '@lib/supabase';
import type { Collection } from '@/types/share';

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

// GET: List all root collections (where parent_id is NULL)
export const GET: APIRoute = async ({ request, locals, cookies }) => {
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

    const result = await FILE_SHARE_DB.prepare(`
      SELECT * FROM collections
      WHERE is_deleted = 0 AND parent_id IS NULL AND user_id = ?
      ORDER BY created_at DESC
    `).bind(user.id).all<Collection>();

    return new Response(JSON.stringify({ collections: result.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('List collections error:', error);
    return new Response(JSON.stringify({ error: 'Failed to list collections' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// POST: Create a new root collection
export const POST: APIRoute = async ({ request, locals, cookies }) => {
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
    const body = await request.json();

    const { title, subtitle, expires_at, password, allowed_emails } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Title is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const collectionId = generateFileId();
    const passwordHash = password ? await sha256(password) : null;
    const allowedEmailsJson = allowed_emails?.length > 0 ? JSON.stringify(allowed_emails) : null;

    await FILE_SHARE_DB.prepare(`
      INSERT INTO collections (id, parent_id, title, subtitle, expires_at, password_hash, allowed_emails, depth, item_count, user_id)
      VALUES (?, NULL, ?, ?, ?, ?, ?, 1, 0, ?)
    `).bind(
      collectionId,
      title.trim(),
      subtitle?.trim() || null,
      expires_at || null,
      passwordHash,
      allowedEmailsJson,
      user.id
    ).run();

    return new Response(JSON.stringify({
      id: collectionId,
      share_url: `/c/${collectionId}`
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Create collection error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create collection' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
