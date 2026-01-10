import type { APIRoute } from 'astro';
import {
  generateFileId,
  MAX_FILE_SIZE,
  EXTENSION_MIME_MAP,
  ALLOWED_EXTENSIONS,
  validateFileMagicBytes
} from '@utils/share';
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

// POST: Upload a file to a collection
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

    const { FILE_SHARE_BUCKET, FILE_SHARE_DB } = locals.runtime.env;
    const { id: collectionId } = params;

    // Check collection exists and verify ownership
    const collection = await FILE_SHARE_DB.prepare(`
      SELECT id, user_id FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(collectionId).first<Collection & { user_id: string }>();

    if (!collection) {
      return new Response(JSON.stringify({ error: 'Collection not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Security: Verify collection ownership
    if (collection.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
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

    // Get request metadata for audit log
    const ipAddress = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    await FILE_SHARE_BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: mimeType,
        contentDisposition: `attachment; filename="${file.name}"`
      }
    });

    // Verify file exists in R2 after upload
    const verification = await FILE_SHARE_BUCKET.head(r2Key);
    if (!verification) {
      // Log failed verification
      await FILE_SHARE_DB.prepare(`
        INSERT INTO file_audit_log (file_id, operation, r2_key, file_size, status, error_message, ip_address, user_agent)
        VALUES (?, 'upload', ?, ?, 'failed', 'R2 verification failed - file not found after upload', ?, ?)
      `).bind(fileId, r2Key, file.size, ipAddress, userAgent).run();

      return new Response(JSON.stringify({ error: 'Upload verification failed. Please try again.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify size matches
    if (verification.size !== file.size) {
      // Log size mismatch
      await FILE_SHARE_DB.prepare(`
        INSERT INTO file_audit_log (file_id, operation, r2_key, file_size, status, error_message, ip_address, user_agent)
        VALUES (?, 'upload', ?, ?, 'failed', ?, ?, ?)
      `).bind(fileId, r2Key, file.size, `Size mismatch: expected ${file.size}, got ${verification.size}`, ipAddress, userAgent).run();

      // Delete the corrupted file
      await FILE_SHARE_BUCKET.delete(r2Key);

      return new Response(JSON.stringify({ error: 'Upload verification failed - size mismatch. Please try again.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Log successful upload
    await FILE_SHARE_DB.prepare(`
      INSERT INTO file_audit_log (file_id, operation, r2_key, file_size, status, ip_address, user_agent)
      VALUES (?, 'upload', ?, ?, 'success', ?, ?)
    `).bind(fileId, r2Key, file.size, ipAddress, userAgent).run();

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
