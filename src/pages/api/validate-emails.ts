import type { APIRoute } from 'astro';

export const prerender = false;

interface ValidateRequest {
  domains: string[];
}

interface DnsResponse {
  Status: number;
  Answer?: { type: number; data: string }[];
}

// In-memory cache for MX results (persists across requests in the same worker instance)
const mxCache = new Map<string, boolean>();

// Known good domains that always have MX records (major email providers)
const KNOWN_VALID_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.es', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'att.net', 'ymail.com', 'rocketmail.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'zoho.com', 'mail.com', 'gmx.com', 'gmx.net',
]);

async function checkMxRecordWithProvider(domain: string, provider: 'google' | 'cloudflare'): Promise<boolean> {
  const url = provider === 'google'
    ? `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`
    : `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`DNS query failed: ${response.status}`);
    }

    const data: DnsResponse = await response.json();

    // Status 0 = NOERROR, MX record type is 15
    if (data.Status === 0 && data.Answer) {
      return data.Answer.some((record) => record.type === 15);
    }

    return false;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function checkMxRecord(domain: string): Promise<boolean> {
  // Check known valid domains first
  if (KNOWN_VALID_DOMAINS.has(domain.toLowerCase())) {
    return true;
  }

  // Check cache
  if (mxCache.has(domain)) {
    return mxCache.get(domain)!;
  }

  // Try Google DNS first, fallback to Cloudflare, with retry
  const providers: ('google' | 'cloudflare')[] = ['google', 'cloudflare'];

  for (const provider of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await checkMxRecordWithProvider(domain, provider);
        mxCache.set(domain, result);
        return result;
      } catch {
        // Continue to next attempt/provider
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 100)); // Brief delay before retry
        }
      }
    }
  }

  // If all providers fail, assume valid (benefit of the doubt for large batches)
  // This prevents false negatives due to network issues
  mxCache.set(domain, true);
  return true;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body: ValidateRequest = await request.json();
    const { domains } = body;

    if (!domains?.length) {
      return new Response(
        JSON.stringify({ error: 'Domains array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Deduplicate domains
    const uniqueDomains = [...new Set(domains.map((d) => d.toLowerCase()))];

    // Check MX records for each domain
    const results: Record<string, boolean> = {};

    // Process in parallel with a limit
    const batchSize = 10;
    for (let i = 0; i < uniqueDomains.length; i += batchSize) {
      const batch = uniqueDomains.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (domain) => ({
          domain,
          hasMx: await checkMxRecord(domain),
        }))
      );

      for (const { domain, hasMx } of batchResults) {
        results[domain] = hasMx;
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Email validation API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
