import type { APIRoute } from 'astro';
import { sha256, getCollectionBreadcrumbs } from '@utils/share';
import { createSupabaseServerClient } from '@lib/supabase';
import type { Collection, CollectionChild, FileChild, CollectionAccessLog } from '@/types/share';

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

// GET: Get collection details with children and breadcrumbs
export const GET: APIRoute = async ({ params, locals, url, request, cookies }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;
    const { id } = params;
    const includeLogs = url.searchParams.get('logs') === 'true';

    // Get collection
    const collection = await FILE_SHARE_DB.prepare(`
      SELECT * FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(id).first<Collection>();

    if (!collection) {
      return new Response(JSON.stringify({ error: 'Collection not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get breadcrumbs
    const breadcrumbs = await getCollectionBreadcrumbs(FILE_SHARE_DB, id!);

    // Get child collections
    const subCollections = await FILE_SHARE_DB.prepare(`
      SELECT id, title, subtitle, item_count, created_at
      FROM collections
      WHERE parent_id = ? AND is_deleted = 0
      ORDER BY title ASC
    `).bind(id).all<{ id: string; title: string; subtitle: string | null; item_count: number; created_at: string }>();

    const collectionChildren: CollectionChild[] = subCollections.results.map(c => ({
      type: 'collection' as const,
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      item_count: c.item_count,
      created_at: c.created_at
    }));

    // Get files in this collection
    const files = await FILE_SHARE_DB.prepare(`
      SELECT id, filename, file_size, mime_type, created_at
      FROM files
      WHERE collection_id = ? AND is_deleted = 0
      ORDER BY filename ASC
    `).bind(id).all<{ id: string; filename: string; file_size: number; mime_type: string; created_at: string }>();

    const fileChildren: FileChild[] = files.results.map(f => ({
      type: 'file' as const,
      id: f.id,
      filename: f.filename,
      file_size: f.file_size,
      mime_type: f.mime_type,
      created_at: f.created_at
    }));

    // Combine children
    const children = [...collectionChildren, ...fileChildren];

    // Get access logs if requested
    let accessLogs: CollectionAccessLog[] = [];
    if (includeLogs) {
      const logsResult = await FILE_SHARE_DB.prepare(`
        SELECT * FROM collection_access_logs
        WHERE collection_id = ?
        ORDER BY accessed_at DESC
        LIMIT 100
      `).bind(id).all<CollectionAccessLog>();
      accessLogs = logsResult.results;
    }

    return new Response(JSON.stringify({
      collection,
      children,
      breadcrumbs,
      ...(includeLogs && { access_logs: accessLogs })
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get collection error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get collection' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// PUT: Update collection settings (requires authentication + ownership)
export const PUT: APIRoute = async ({ params, request, locals, cookies }) => {
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

    // Security: Verify collection ownership before allowing update
    const existingCollection = await FILE_SHARE_DB.prepare(`
      SELECT user_id FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(id).first<{ user_id: string }>();

    if (!existingCollection) {
      return new Response(JSON.stringify({ error: 'Collection not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (existingCollection.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { title, subtitle, expires_at, password, remove_password, allowed_emails } = body;

    // Build update query dynamically
    const updates: string[] = ["updated_at = datetime('now')"];
    const values: (string | null)[] = [];

    if (title !== undefined) {
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'Title cannot be empty' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      updates.push('title = ?');
      values.push(title.trim());
    }

    if ('subtitle' in body) {
      updates.push('subtitle = ?');
      values.push(subtitle?.trim() || null);
    }

    if ('expires_at' in body) {
      updates.push('expires_at = ?');
      values.push(expires_at || null);
    }

    if (remove_password) {
      updates.push('password_hash = NULL');
    } else if (password) {
      updates.push('password_hash = ?');
      values.push(await sha256(password));
    }

    if ('allowed_emails' in body) {
      updates.push('allowed_emails = ?');
      values.push(
        allowed_emails && allowed_emails.length > 0
          ? JSON.stringify(allowed_emails)
          : null
      );
    }

    values.push(id!);

    await FILE_SHARE_DB.prepare(`
      UPDATE collections
      SET ${updates.join(', ')}
      WHERE id = ? AND is_deleted = 0
    `).bind(...values).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Update collection error:', error);
    return new Response(JSON.stringify({ error: 'Failed to update collection' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// DELETE: Soft delete collection and cascade to children (requires authentication + ownership)
export const DELETE: APIRoute = async ({ params, locals, request, cookies }) => {
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

    // Check if collection exists and verify ownership
    const collection = await FILE_SHARE_DB.prepare(`
      SELECT id, user_id FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(id).first<{ id: string; user_id: string }>();

    if (!collection) {
      return new Response(JSON.stringify({ error: 'Collection not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Security: Verify collection ownership before allowing delete
    if (collection.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Soft delete collection and all descendant collections recursively
    // Using a CTE to find all descendants
    await FILE_SHARE_DB.prepare(`
      WITH RECURSIVE descendants AS (
        SELECT id FROM collections WHERE id = ?
        UNION ALL
        SELECT c.id FROM collections c
        INNER JOIN descendants d ON c.parent_id = d.id
      )
      UPDATE collections
      SET is_deleted = 1, updated_at = datetime('now')
      WHERE id IN (SELECT id FROM descendants)
    `).bind(id).run();

    // Soft delete files in deleted collections
    await FILE_SHARE_DB.prepare(`
      WITH RECURSIVE descendants AS (
        SELECT id FROM collections WHERE id = ?
        UNION ALL
        SELECT c.id FROM collections c
        INNER JOIN descendants d ON c.parent_id = d.id
      )
      UPDATE files
      SET is_deleted = 1, updated_at = datetime('now')
      WHERE collection_id IN (SELECT id FROM descendants)
    `).bind(id).run();

    // Update parent's item_count if this was a sub-collection
    const parentResult = await FILE_SHARE_DB.prepare(`
      SELECT parent_id FROM collections WHERE id = ?
    `).bind(id).first<{ parent_id: string | null }>();

    if (parentResult?.parent_id) {
      await FILE_SHARE_DB.prepare(`
        UPDATE collections
        SET item_count = item_count - 1, updated_at = datetime('now')
        WHERE id = ?
      `).bind(parentResult.parent_id).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Delete collection error:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete collection' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
