import type { APIRoute } from 'astro';

export const prerender = false;

interface ValidateRequest {
  domains: string[];
}

interface DnsResponse {
  Status: number;
  Answer?: { type: number; data: string }[];
}

async function checkMxRecordWithProvider(domain: string, provider: 'google' | 'cloudflare'): Promise<boolean> {
  const url = provider === 'google'
    ? `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`
    : `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;

  const response = await fetch(url, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`DNS query failed: ${response.status}`);
  }

  const data: DnsResponse = await response.json();

  // Status 0 = NOERROR, MX record type is 15
  if (data.Status === 0 && data.Answer) {
    return data.Answer.some((record) => record.type === 15);
  }

  return false;
}

async function checkMxRecord(domain: string): Promise<boolean> {
  // Try Google DNS first, fallback to Cloudflare
  try {
    return await checkMxRecordWithProvider(domain, 'google');
  } catch {
    try {
      return await checkMxRecordWithProvider(domain, 'cloudflare');
    } catch {
      return false;
    }
  }
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
