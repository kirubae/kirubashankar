import { Env } from './types';
import { handleEnrichment } from './handlers/enrich';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Route: /v1/enrich/from-linkedin-profile
    if (url.pathname === '/v1/enrich/from-linkedin-profile' && request.method === 'GET') {
      return handleEnrichment(request, env);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Not found
    return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
