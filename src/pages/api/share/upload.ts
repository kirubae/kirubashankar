import type { APIRoute } from 'astro';
import { generateFileId, sha256, MAX_FILE_SIZE, GUEST_MAX_FILE_SIZE, ALLOWED_MIME_TYPES, isValidPdf } from '@utils/share';

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

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Only PDF files are allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate PDF magic bytes (security check - prevents spoofed MIME types)
    if (!await isValidPdf(file)) {
      return new Response(JSON.stringify({ error: 'Invalid PDF file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    await FILE_SHARE_BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `attachment; filename="${file.name}"`
      }
    });

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
      file.type,
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
