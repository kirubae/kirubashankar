import type { APIRoute } from 'astro';
import {
  generateFileId,
  sha256,
  MAX_FILE_SIZE,
  GUEST_MAX_FILE_SIZE,
  EXTENSION_MIME_MAP,
  ALLOWED_EXTENSIONS,
  validateFileMagicBytes
} from '@utils/share';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { FILE_SHARE_BUCKET, FILE_SHARE_DB } = locals.runtime.env;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const expiresAt = formData.get('expires_at') as string | null;
    const password = formData.get('password') as string | null;
    const allowedEmailsJson = formData.get('allowed_emails') as string | null;
    const uploaderEmail = formData.get('uploader_email') as string | null;

    // Determine if this is a guest upload
    const isGuest = !!uploaderEmail;
    const maxFileSize = isGuest ? GUEST_MAX_FILE_SIZE : MAX_FILE_SIZE;

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

    // Validate file magic bytes (security check - prevents spoofed extensions)
    if (!await validateFileMagicBytes(file)) {
      return new Response(JSON.stringify({ error: 'Invalid file format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get correct MIME type from extension
    const mimeType = EXTENSION_MIME_MAP[extension] || file.type;

    if (file.size > maxFileSize) {
      const limitMB = maxFileSize / (1024 * 1024);
      return new Response(JSON.stringify({ error: `File size exceeds ${limitMB}MB limit` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // For guests, check if they already have a file
    if (isGuest) {
      const existingFile = await FILE_SHARE_DB.prepare(`
        SELECT id FROM files WHERE uploader_email = ? AND is_deleted = 0
      `).bind(uploaderEmail.toLowerCase()).first();

      if (existingFile) {
        return new Response(JSON.stringify({ error: 'You already have a shared file. Delete it first to share a new one.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Generate unique ID and R2 key
    const fileId = generateFileId();
    const r2Key = `files/${fileId}/${file.name}`;

    // Hash password if provided
    const passwordHash = password ? await sha256(password) : null;

    // Parse allowed emails
    let allowedEmails: string[] = [];
    if (allowedEmailsJson) {
      try {
        allowedEmails = JSON.parse(allowedEmailsJson);
      } catch {
        // Invalid JSON, ignore
      }
    }

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

    // Create database record
    const stmt = FILE_SHARE_DB.prepare(`
      INSERT INTO files (id, filename, original_filename, r2_key, file_size, mime_type, expires_at, password_hash, allowed_emails, uploader_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.bind(
      fileId,
      file.name,
      file.name,
      r2Key,
      file.size,
      mimeType,
      expiresAt || null,
      passwordHash,
      allowedEmails.length > 0 ? JSON.stringify(allowedEmails) : null,
      uploaderEmail ? uploaderEmail.toLowerCase() : null
    ).run();

    return new Response(JSON.stringify({
      id: fileId,
      filename: file.name,
      share_url: `/s/${fileId}`
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({ error: 'Upload failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
