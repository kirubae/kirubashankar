import type { APIRoute } from 'astro';

export const prerender = false;

interface ValidateRequest {
  domains: string[];
}

interface DnsResponse {
  Status: number;
  Answer?: { type: number; data: string }[];
}

async function checkMxRecord(domain: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      {
        headers: {
          Accept: 'application/dns-json',
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data: DnsResponse = await response.json();

    // Status 0 = NOERROR, check if MX records exist
    // MX record type is 15
    if (data.Status === 0 && data.Answer) {
      return data.Answer.some((record) => record.type === 15);
    }

    return false;
  } catch {
    return false;
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
