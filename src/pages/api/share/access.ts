import type { APIRoute } from 'astro';
import { sha256, validateEmailFull, isFileExpired, parseAllowedEmails } from '@utils/share';

export const prerender = false;

async function logAccess(
  db: D1Database,
  fileId: string,
  email: string,
  ip: string,
  userAgent: string,
  location: string,
  action: string,
  success: boolean,
  failureReason: string | null
) {
  await db.prepare(`
    INSERT INTO access_logs (file_id, email, ip_address, user_agent, location, action, success, failure_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(fileId, email, ip, userAgent, location, action, success ? 1 : 0, failureReason).run();
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;
    const { file_id, email, password } = await request.json();

    // Validate email (format + MX record)
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const emailValidation = await validateEmailFull(email);
    if (!emailValidation.valid) {
      const errorMsg = emailValidation.reason === 'no_mx_record'
        ? 'This email domain does not appear to receive emails'
        : 'Please enter a valid email address';
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get file
    const file = await FILE_SHARE_DB.prepare(`
      SELECT * FROM files WHERE id = ? AND is_deleted = 0
    `).bind(file_id).first<{
      id: string;
      filename: string;
      expires_at: string | null;
      password_hash: string | null;
      allowed_emails: string | null;
    }>();

    if (!file) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get IP, user agent, and location for logging
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For') ||
               'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';

    // Get location from Cloudflare headers
    const country = request.headers.get('CF-IPCountry') || '';
    const city = (request as any).cf?.city || '';
    const region = (request as any).cf?.region || '';
    const locationParts = [city, region, country].filter(Boolean);
    const location = locationParts.length > 0 ? locationParts.join(', ') : 'Unknown';

    // Check expiry
    if (isFileExpired(file.expires_at)) {
      await logAccess(FILE_SHARE_DB, file_id, email, ip, userAgent, location, 'download', false, 'File expired');
      return new Response(JSON.stringify({ error: 'This file has expired' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check email restrictions
    const allowedEmails = parseAllowedEmails(file.allowed_emails);
    if (allowedEmails.length > 0) {
      const emailLower = email.toLowerCase();
      const isAllowed = allowedEmails.some((e: string) => e.toLowerCase() === emailLower);
      if (!isAllowed) {
        await logAccess(FILE_SHARE_DB, file_id, email, ip, userAgent, location, 'download', false, 'Email not authorized');
        return new Response(JSON.stringify({ error: 'Your email is not authorized to access this file' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Check password
    if (file.password_hash) {
      if (!password) {
        return new Response(JSON.stringify({ error: 'Password required', needs_password: true }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const providedHash = await sha256(password);
      if (providedHash !== file.password_hash) {
        await logAccess(FILE_SHARE_DB, file_id, email, ip, userAgent, location, 'download', false, 'Invalid password');
        return new Response(JSON.stringify({ error: 'Incorrect password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Generate access token (valid for 5 minutes)
    const timestamp = Date.now();
    const tokenData = `${file_id}:${email}:${timestamp}`;
    const accessToken = await sha256(tokenData);

    // Log successful access
    await logAccess(FILE_SHARE_DB, file_id, email, ip, userAgent, location, 'download', true, null);

    // Increment download count
    await FILE_SHARE_DB.prepare(`
      UPDATE files SET download_count = download_count + 1 WHERE id = ?
    `).bind(file_id).run();

    return new Response(JSON.stringify({
      success: true,
      download_url: `/api/share/download/${file_id}?token=${accessToken}&t=${timestamp}&email=${encodeURIComponent(email)}`,
      filename: file.filename
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Access validation error:', error);
    return new Response(JSON.stringify({ error: 'Access validation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
