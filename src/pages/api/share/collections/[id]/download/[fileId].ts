import type { APIRoute } from 'astro';
import {
  validateCollectionToken,
  getCollectionBreadcrumbs,
  isCollectionExpired
} from '@utils/share';

export const prerender = false;

// GET: Download a file from within a collection (requires valid collection access token)
export const GET: APIRoute = async ({ params, url, locals, request }) => {
  try {
    const { FILE_SHARE_BUCKET, FILE_SHARE_DB } = locals.runtime.env;
    const { id: collectionId, fileId } = params;

    // Get token params
    const token = url.searchParams.get('token');
    const timestamp = url.searchParams.get('t');
    const email = url.searchParams.get('email');
    const rootId = url.searchParams.get('root');

    if (!token || !timestamp || !email || !rootId) {
      return new Response('Missing access token', { status: 401 });
    }

    // Validate token
    const isValid = await validateCollectionToken(rootId, email, token, parseInt(timestamp));
    if (!isValid) {
      return new Response('Invalid or expired access token. Please request access again.', { status: 401 });
    }

    // Get file and verify it belongs to this collection
    const file = await FILE_SHARE_DB.prepare(`
      SELECT id, r2_key, filename, mime_type, collection_id FROM files
      WHERE id = ? AND is_deleted = 0
    `).bind(fileId).first<{
      id: string;
      r2_key: string;
      filename: string;
      mime_type: string;
      collection_id: string | null;
    }>();

    if (!file) {
      return new Response('File not found', { status: 404 });
    }

    // Verify file belongs to the requested collection
    if (file.collection_id !== collectionId) {
      return new Response('File not found in this collection', { status: 404 });
    }

    // Verify this collection is under the root collection that the token was issued for
    const breadcrumbs = await getCollectionBreadcrumbs(FILE_SHARE_DB, collectionId!);
    const isUnderRoot = breadcrumbs.some(b => b.id === rootId);
    if (!isUnderRoot) {
      return new Response('Access denied', { status: 403 });
    }

    // Check if root collection is expired
    const rootCollection = await FILE_SHARE_DB.prepare(`
      SELECT expires_at FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(rootId).first<{ expires_at: string | null }>();

    if (rootCollection && isCollectionExpired(rootCollection.expires_at)) {
      return new Response('Collection has expired', { status: 410 });
    }

    // Get file from R2
    const r2Object = await FILE_SHARE_BUCKET.get(file.r2_key);
    const ipAddress = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    if (!r2Object) {
      // Log missing file to audit log
      await FILE_SHARE_DB.prepare(`
        INSERT INTO file_audit_log (file_id, operation, r2_key, status, error_message, ip_address, user_agent)
        VALUES (?, 'download', ?, 'missing', 'File not found in R2 storage (collection download)', ?, ?)
      `).bind(fileId, file.r2_key, ipAddress, userAgent).run();

      return new Response('File not found in storage', { status: 404 });
    }

    // Log successful download to file audit log
    await FILE_SHARE_DB.prepare(`
      INSERT INTO file_audit_log (file_id, operation, r2_key, file_size, status, ip_address, user_agent)
      VALUES (?, 'download', ?, ?, 'success', ?, ?)
    `).bind(fileId, file.r2_key, r2Object.size, ipAddress, userAgent).run();

    // Log download to collection access logs
    const cfHeaders = request.headers;
    const location = [
      cfHeaders.get('cf-ipcity'),
      cfHeaders.get('cf-ipregion'),
      cfHeaders.get('cf-ipcountry')
    ].filter(Boolean).join(', ');

    await FILE_SHARE_DB.prepare(`
      INSERT INTO collection_access_logs (collection_id, email, ip_address, user_agent, location, action, success)
      VALUES (?, ?, ?, ?, ?, 'download_file', 1)
    `).bind(
      collectionId,
      email,
      cfHeaders.get('cf-connecting-ip'),
      cfHeaders.get('user-agent'),
      location || null
    ).run();

    // Increment download count on file and root collection
    await FILE_SHARE_DB.prepare(`
      UPDATE files SET download_count = download_count + 1 WHERE id = ?
    `).bind(fileId).run();

    await FILE_SHARE_DB.prepare(`
      UPDATE collections SET download_count = download_count + 1 WHERE id = ?
    `).bind(rootId).run();

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
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
      }
    });

  } catch (error) {
    console.error('Collection file download error:', error);
    return new Response('Download failed', { status: 500 });
  }
};
