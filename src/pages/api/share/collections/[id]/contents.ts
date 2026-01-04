import type { APIRoute } from 'astro';
import {
  validateCollectionToken,
  getCollectionBreadcrumbs,
  isCollectionExpired
} from '@utils/share';
import type { Collection, CollectionChild, FileChild } from '@/types/share';

export const prerender = false;

// GET: Get collection contents (requires valid access token)
export const GET: APIRoute = async ({ params, url, locals }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;
    const { id } = params;

    // Get token params
    const token = url.searchParams.get('token');
    const timestamp = url.searchParams.get('t');
    const email = url.searchParams.get('email');
    const rootId = url.searchParams.get('root');

    if (!token || !timestamp || !email || !rootId) {
      return new Response(JSON.stringify({ error: 'Missing access token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate token
    const isValid = await validateCollectionToken(rootId, email, token, parseInt(timestamp));
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid or expired access token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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

    // Verify this collection is under the root collection that the token was issued for
    const breadcrumbs = await getCollectionBreadcrumbs(FILE_SHARE_DB, id!);
    const isUnderRoot = breadcrumbs.some(b => b.id === rootId);
    if (!isUnderRoot) {
      return new Response(JSON.stringify({ error: 'Access denied to this collection' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if root collection is expired
    const rootCollection = await FILE_SHARE_DB.prepare(`
      SELECT expires_at FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(rootId).first<{ expires_at: string | null }>();

    if (rootCollection && isCollectionExpired(rootCollection.expires_at)) {
      return new Response(JSON.stringify({ error: 'Collection has expired' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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

    return new Response(JSON.stringify({
      collection: {
        id: collection.id,
        title: collection.title,
        subtitle: collection.subtitle,
        depth: collection.depth,
        item_count: collection.item_count
      },
      children,
      breadcrumbs
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get collection contents error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get collection contents' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
