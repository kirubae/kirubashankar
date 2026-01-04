import type { APIRoute } from 'astro';
import {
  validateEmailFull,
  checkCollectionAccess,
  generateCollectionToken,
  getCollectionBreadcrumbs
} from '@utils/share';

export const prerender = false;

// POST: Validate access to collection
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { FILE_SHARE_DB } = locals.runtime.env;
    const { id } = params;
    const body = await request.json();

    const { email, password } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate email format and MX record
    const emailValidation = await validateEmailFull(email);
    if (!emailValidation.valid) {
      // Log failed access attempt
      const cfHeaders = request.headers;
      const location = [
        cfHeaders.get('cf-ipcity'),
        cfHeaders.get('cf-ipregion'),
        cfHeaders.get('cf-ipcountry')
      ].filter(Boolean).join(', ');

      await FILE_SHARE_DB.prepare(`
        INSERT INTO collection_access_logs (collection_id, email, ip_address, user_agent, location, action, success, failure_reason)
        VALUES (?, ?, ?, ?, ?, 'view', 0, ?)
      `).bind(
        id,
        email,
        cfHeaders.get('cf-connecting-ip'),
        cfHeaders.get('user-agent'),
        location || null,
        emailValidation.reason === 'invalid_format' ? 'Invalid email format' : 'Invalid email domain'
      ).run();

      return new Response(JSON.stringify({
        error: emailValidation.reason === 'invalid_format'
          ? 'Invalid email format'
          : 'Invalid email domain'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check collection access (handles permission inheritance)
    const accessResult = await checkCollectionAccess(FILE_SHARE_DB, id!, email, password || null);

    // Log access attempt
    const cfHeaders = request.headers;
    const location = [
      cfHeaders.get('cf-ipcity'),
      cfHeaders.get('cf-ipregion'),
      cfHeaders.get('cf-ipcountry')
    ].filter(Boolean).join(', ');

    await FILE_SHARE_DB.prepare(`
      INSERT INTO collection_access_logs (collection_id, email, ip_address, user_agent, location, action, success, failure_reason)
      VALUES (?, ?, ?, ?, ?, 'view', ?, ?)
    `).bind(
      id,
      email,
      cfHeaders.get('cf-connecting-ip'),
      cfHeaders.get('user-agent'),
      location || null,
      accessResult.allowed ? 1 : 0,
      accessResult.allowed ? null : accessResult.reason
    ).run();

    if (!accessResult.allowed) {
      return new Response(JSON.stringify({ error: accessResult.reason }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate access token (valid for 30 minutes)
    const timestamp = Date.now();
    const rootCollectionId = accessResult.rootCollectionId!;
    const token = await generateCollectionToken(rootCollectionId, email, timestamp);

    // Get collection info for response
    const collection = await FILE_SHARE_DB.prepare(`
      SELECT id, title, subtitle FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(id).first<{ id: string; title: string; subtitle: string | null }>();

    const breadcrumbs = await getCollectionBreadcrumbs(FILE_SHARE_DB, id!);

    return new Response(JSON.stringify({
      success: true,
      token,
      timestamp,
      root_collection_id: rootCollectionId,
      email,
      collection: {
        id: collection?.id,
        title: collection?.title,
        subtitle: collection?.subtitle
      },
      breadcrumbs
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Collection access error:', error);
    return new Response(JSON.stringify({ error: 'Failed to validate access' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
