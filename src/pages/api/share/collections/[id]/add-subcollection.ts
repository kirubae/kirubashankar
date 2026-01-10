import type { APIRoute } from 'astro';
import { generateFileId, MAX_COLLECTION_DEPTH } from '@utils/share';
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

// POST: Create a sub-collection inside the parent collection
export const POST: APIRoute = async ({ params, request, locals, cookies }) => {
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
    const { id: parentId } = params;
    const body = await request.json();

    const { title, subtitle } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Title is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get parent collection and verify ownership
    const parent = await FILE_SHARE_DB.prepare(`
      SELECT id, depth, user_id FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(parentId).first<Collection & { user_id: string }>();

    if (!parent) {
      return new Response(JSON.stringify({ error: 'Parent collection not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Security: Verify collection ownership
    if (parent.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check depth limit
    if (parent.depth >= MAX_COLLECTION_DEPTH) {
      return new Response(JSON.stringify({
        error: `Maximum nesting depth of ${MAX_COLLECTION_DEPTH} levels reached`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const collectionId = generateFileId();
    const newDepth = parent.depth + 1;

    // Create sub-collection (inherits permissions from parent via hierarchy)
    await FILE_SHARE_DB.prepare(`
      INSERT INTO collections (id, parent_id, title, subtitle, depth, item_count)
      VALUES (?, ?, ?, ?, ?, 0)
    `).bind(
      collectionId,
      parentId,
      title.trim(),
      subtitle?.trim() || null,
      newDepth
    ).run();

    // Increment parent's item_count
    await FILE_SHARE_DB.prepare(`
      UPDATE collections
      SET item_count = item_count + 1, updated_at = datetime('now')
      WHERE id = ?
    `).bind(parentId).run();

    return new Response(JSON.stringify({
      id: collectionId,
      share_url: `/c/${collectionId}`,
      depth: newDepth
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Create sub-collection error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create sub-collection' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
