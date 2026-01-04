import type { APIRoute } from 'astro';
import { sha256, TOKEN_VALIDITY_MS } from '@utils/share';

export const prerender = false;

export const GET: APIRoute = async ({ params, url, locals, request }) => {
  try {
    const { FILE_SHARE_BUCKET, FILE_SHARE_DB } = locals.runtime.env;
    const { id } = params;

    // Get request metadata for audit log
    const ipAddress = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const token = url.searchParams.get('token');
    const timestamp = url.searchParams.get('t');
    const email = url.searchParams.get('email');

    // Validate token parameters
    if (!token || !timestamp || !email) {
      return new Response('Invalid download link', { status: 400 });
    }

    // Check token validity (time-based)
    const tokenTime = parseInt(timestamp, 10);
    if (Date.now() - tokenTime > TOKEN_VALIDITY_MS) {
      return new Response('Download link has expired. Please request access again.', { status: 410 });
    }

    // Verify token
    const expectedToken = await sha256(`${id}:${email}:${timestamp}`);
    if (token !== expectedToken) {
      return new Response('Invalid download link', { status: 403 });
    }

    // Get file from database
    const file = await FILE_SHARE_DB.prepare(`
      SELECT r2_key, filename, mime_type FROM files
      WHERE id = ? AND is_deleted = 0
    `).bind(id).first<{ r2_key: string; filename: string; mime_type: string }>();

    if (!file) {
      return new Response('File not found', { status: 404 });
    }

    // Get file from R2
    const r2Object = await FILE_SHARE_BUCKET.get(file.r2_key);

    if (!r2Object) {
      // Log missing file
      await FILE_SHARE_DB.prepare(`
        INSERT INTO file_audit_log (file_id, operation, r2_key, status, error_message, ip_address, user_agent)
        VALUES (?, 'download', ?, 'missing', 'File not found in R2 storage', ?, ?)
      `).bind(id, file.r2_key, ipAddress, userAgent).run();

      return new Response('File not found in storage', { status: 404 });
    }

    // Log successful download
    await FILE_SHARE_DB.prepare(`
      INSERT INTO file_audit_log (file_id, operation, r2_key, file_size, status, ip_address, user_agent)
      VALUES (?, 'download', ?, ?, 'success', ?, ?)
    `).bind(id, file.r2_key, r2Object.size, ipAddress, userAgent).run();

    // Check if viewing inline or downloading
    const mode = url.searchParams.get('mode');
    const disposition = mode === 'view' ? 'inline' : 'attachment';

    // Stream file to client with security headers
    return new Response(r2Object.body, {
      status: 200,
      headers: {
        'Content-Type': file.mime_type,
        'Content-Disposition': `${disposition}; filename="${file.filename}"`,
        'Content-Length': r2Object.size.toString(),
        'Cache-Control': 'private, no-cache',
        // Security headers for PDF viewing
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    return new Response('Download failed', { status: 500 });
  }
};
