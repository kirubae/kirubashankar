import type { APIRoute } from 'astro';
import { generateFileId, sha256 } from '@utils/share';
import type { Collection } from '@/types/share';

export const prerender = false;

// GET: List all root collections (where parent_id is NULL)
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;

    // Get user_id from query params to filter collections
    const userId = url.searchParams.get('user_id');

    if (!userId) {
      // No user_id provided - return empty (require auth)
      return new Response(JSON.stringify({ collections: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await FILE_SHARE_DB.prepare(`
      SELECT * FROM collections
      WHERE is_deleted = 0 AND parent_id IS NULL AND user_id = ?
      ORDER BY created_at DESC
    `).bind(userId).all<Collection>();

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
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;
    const body = await request.json();

    const { title, subtitle, expires_at, password, allowed_emails, user_id } = body;

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
      user_id || null
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
