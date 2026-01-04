import type { APIRoute } from 'astro';
import {
  generateFileId,
  MAX_FILE_SIZE,
  EXTENSION_MIME_MAP,
  ALLOWED_EXTENSIONS,
  validateFileMagicBytes
} from '@utils/share';
import type { Collection } from '@/types/share';

export const prerender = false;

// POST: Upload a file to a collection
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { FILE_SHARE_BUCKET, FILE_SHARE_DB } = locals.runtime.env;
    const { id: collectionId } = params;

    // Check collection exists
    const collection = await FILE_SHARE_DB.prepare(`
      SELECT id FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(collectionId).first<Collection>();

    if (!collection) {
      return new Response(JSON.stringify({ error: 'Collection not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // Validation
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check file extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      return new Response(JSON.stringify({
        error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate file magic bytes
    if (!await validateFileMagicBytes(file)) {
      return new Response(JSON.stringify({ error: 'Invalid file format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      const limitMB = MAX_FILE_SIZE / (1024 * 1024);
      return new Response(JSON.stringify({ error: `File size exceeds ${limitMB}MB limit` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate unique ID and R2 key
    const fileId = generateFileId();
    const r2Key = `files/${fileId}/${file.name}`;

    // Get correct MIME type from extension
    const mimeType = EXTENSION_MIME_MAP[extension] || file.type;

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    await FILE_SHARE_BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: mimeType,
        contentDisposition: `attachment; filename="${file.name}"`
      }
    });

    // Create database record with collection_id
    await FILE_SHARE_DB.prepare(`
      INSERT INTO files (id, filename, original_filename, r2_key, file_size, mime_type, collection_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      fileId,
      file.name,
      file.name,
      r2Key,
      file.size,
      mimeType,
      collectionId
    ).run();

    // Increment collection's item_count
    await FILE_SHARE_DB.prepare(`
      UPDATE collections
      SET item_count = item_count + 1, updated_at = datetime('now')
      WHERE id = ?
    `).bind(collectionId).run();

    return new Response(JSON.stringify({
      id: fileId,
      filename: file.name,
      share_url: `/s/${fileId}`
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Add file to collection error:', error);
    return new Response(JSON.stringify({ error: 'Failed to add file' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
