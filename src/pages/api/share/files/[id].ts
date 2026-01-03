import type { APIRoute } from 'astro';
import { sha256 } from '@utils/share';

export const prerender = false;

// GET: Get file metadata with optional access logs
export const GET: APIRoute = async ({ params, locals, url }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;
    const { id } = params;
    const includeLogs = url.searchParams.get('logs') === 'true';

    const file = await FILE_SHARE_DB.prepare(`
      SELECT * FROM files WHERE id = ? AND is_deleted = 0
    `).bind(id).first();

    if (!file) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let accessLogs: unknown[] = [];
    if (includeLogs) {
      const logsResult = await FILE_SHARE_DB.prepare(`
        SELECT * FROM access_logs
        WHERE file_id = ?
        ORDER BY accessed_at DESC
        LIMIT 100
      `).bind(id).all();
      accessLogs = logsResult.results;
    }

    return new Response(JSON.stringify({
      file,
      ...(includeLogs && { access_logs: accessLogs })
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get file error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get file' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// PUT: Update file settings
export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;
    const { id } = params;
    const body = await request.json();

    const { expires_at, password, remove_password, allowed_emails } = body;

    // Build update query dynamically
    const updates: string[] = ["updated_at = datetime('now')"];
    const values: (string | null)[] = [];

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
      UPDATE files
      SET ${updates.join(', ')}
      WHERE id = ? AND is_deleted = 0
    `).bind(...values).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Update file error:', error);
    return new Response(JSON.stringify({ error: 'Failed to update file' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// DELETE: Soft delete file and remove from R2
export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const { FILE_SHARE_DB, FILE_SHARE_BUCKET } = locals.runtime.env;
    const { id } = params;

    // Get file to find R2 key
    const file = await FILE_SHARE_DB.prepare(`
      SELECT r2_key FROM files WHERE id = ? AND is_deleted = 0
    `).bind(id).first<{ r2_key: string }>();

    if (!file) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delete from R2
    await FILE_SHARE_BUCKET.delete(file.r2_key);

    // Soft delete in DB
    await FILE_SHARE_DB.prepare(`
      UPDATE files SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?
    `).bind(id).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Delete file error:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete file' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
