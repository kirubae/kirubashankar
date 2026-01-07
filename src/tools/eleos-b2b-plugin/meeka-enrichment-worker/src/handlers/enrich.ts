import { Env, EnrichmentResult, ErrorResponse } from '../types';
import { enrichFromApollo } from '../services/apollo';
import { enrichFromSalesQL } from '../services/salesql';
import { mergeResults } from '../services/merger';

// Validate LinkedIn URL
function isValidLinkedInUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'www.linkedin.com' || parsed.hostname === 'linkedin.com') &&
      parsed.pathname.startsWith('/in/')
    );
  } catch {
    return false;
  }
}

// Create error response
function errorResponse(code: string, message: string, status: number): Response {
  const body: ErrorResponse = {
    error: { code, message }
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// Main enrichment handler
export async function handleEnrichment(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const linkedinUrl = url.searchParams.get('linkedin_url');

  // Check for custom API keys (optional)
  const customApolloKey = url.searchParams.get('apollo_key');
  const customSalesqlKey = url.searchParams.get('salesql_key');

  // Create effective env with custom keys if provided
  const effectiveEnv: Env = {
    ...env,
    APOLLO_API_KEY: customApolloKey || env.APOLLO_API_KEY,
    SALESQL_API_KEY: customSalesqlKey || env.SALESQL_API_KEY
  };

  // Validate LinkedIn URL
  if (!linkedinUrl) {
    return errorResponse('MISSING_PARAMETER', 'linkedin_url parameter is required', 400);
  }

  if (!isValidLinkedInUrl(linkedinUrl)) {
    return errorResponse('INVALID_LINKEDIN_URL', 'The provided URL is not a valid LinkedIn profile URL', 400);
  }

  console.log(`[Enrich] Processing: ${linkedinUrl}`);
  console.log(`[Enrich] Using custom keys: ${customApolloKey ? 'Apollo' : ''} ${customSalesqlKey ? 'SalesQL' : ''}`);
  const startTime = Date.now();

  try {
    // Call both APIs in parallel
    const [apolloResult, salesqlResult] = await Promise.allSettled([
      enrichFromApollo(linkedinUrl, effectiveEnv),
      enrichFromSalesQL(linkedinUrl, effectiveEnv)
    ]);

    // Merge results
    const merged = mergeResults(apolloResult, salesqlResult);

    // Build response
    const result: EnrichmentResult = {
      emails: merged.emails,
      phones: [],
      metadata: {
        sources_queried: ['apollo', 'salesql'],
        linkedin_url: linkedinUrl,
        enriched_at: new Date().toISOString()
      }
    };

    const duration = Date.now() - startTime;
    console.log(`[Enrich] Completed in ${duration}ms - ${merged.emails.length} emails, ${merged.phones.length} phones`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('[Enrich] Exception:', error);
    return errorResponse('INTERNAL_ERROR', 'An internal error occurred', 500);
  }
}
