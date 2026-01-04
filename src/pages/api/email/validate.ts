import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';

export const prerender = false;

interface Env {
  DATA_MERGE_BUCKET: R2Bucket;
}

interface ValidateRequest {
  key: string;
  email_column: string;
}

// Known good domains that always have MX records
const KNOWN_VALID_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.es', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'att.net', 'ymail.com', 'rocketmail.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'zoho.com', 'mail.com', 'gmx.com', 'gmx.net',
  'usaa.com', 'paychex.com', 'travelers.com', 'adp.com',
]);

// In-memory cache for MX results
const mxCache = new Map<string, boolean>();

async function checkMxRecord(domain: string): Promise<boolean> {
  const lowerDomain = domain.toLowerCase();

  // Check known valid domains
  if (KNOWN_VALID_DOMAINS.has(lowerDomain)) {
    return true;
  }

  // Check cache
  if (mxCache.has(lowerDomain)) {
    return mxCache.get(lowerDomain)!;
  }

  // Try Google DNS, then Cloudflare
  const providers = [
    `https://dns.google/resolve?name=${encodeURIComponent(lowerDomain)}&type=MX`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(lowerDomain)}&type=MX`,
  ];

  for (const url of providers) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as { Status: number; Answer?: { type: number }[] };
        // Status 0 = NOERROR, MX record type is 15
        if (data.Status === 0 && data.Answer) {
          const hasMx = data.Answer.some((r) => r.type === 15);
          mxCache.set(lowerDomain, hasMx);
          return hasMx;
        }
        mxCache.set(lowerDomain, false);
        return false;
      }
    } catch {
      // Try next provider
    }
  }

  // If all providers fail, assume valid (benefit of the doubt)
  mxCache.set(lowerDomain, true);
  return true;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

export const POST: APIRoute = async ({ request, locals }) => {
  console.log('[validate] Starting email validation request');

  try {
    const env = locals.runtime.env as Env;
    const bucket = env.DATA_MERGE_BUCKET;

    console.log('[validate] R2 bucket available:', !!bucket);

    if (!bucket) {
      console.error('[validate] R2 bucket not configured');
      return new Response(
        JSON.stringify({ error: 'Storage not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { key, email_column } = await request.json() as ValidateRequest;

    if (!key || !email_column) {
      return new Response(
        JSON.stringify({ error: 'key and email_column are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Download file from R2
    const object = await bucket.get(key);
    if (!object) {
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const arrayBuffer = await object.arrayBuffer();
    const isExcel = key.endsWith('.xlsx') || key.endsWith('.xls');

    // Parse file
    let rows: Record<string, unknown>[] = [];
    let columns: string[] = [];

    if (isExcel) {
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
      if (rows.length > 0) {
        columns = Object.keys(rows[0]);
      }
    } else {
      const text = new TextDecoder().decode(arrayBuffer);
      const lines = text.split(/\r?\n/).filter(line => line.trim());

      if (lines.length > 0) {
        columns = parseCSVLine(lines[0]);
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const row: Record<string, unknown> = {};
          columns.forEach((col, idx) => {
            row[col] = values[idx] ?? '';
          });
          rows.push(row);
        }
      }
    }

    if (!columns.includes(email_column)) {
      return new Response(
        JSON.stringify({ error: `Column '${email_column}' not found` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Extract unique domains
    const domainSet = new Set<string>();
    for (const row of rows) {
      const email = String(row[email_column] || '').trim();
      if (emailRegex.test(email) && email.includes('@')) {
        domainSet.add(email.split('@')[1].toLowerCase());
      }
    }

    // Check MX records in batches
    const domains = Array.from(domainSet);
    const mxResults: Record<string, boolean> = {};
    const batchSize = 20;

    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (domain) => ({
          domain,
          hasMx: await checkMxRecord(domain),
        }))
      );
      for (const { domain, hasMx } of results) {
        mxResults[domain] = hasMx;
      }
    }

    // Add validation columns to rows
    let validCount = 0;
    let invalidFormatCount = 0;
    let noMxCount = 0;

    const resultRows = rows.map((row) => {
      const email = String(row[email_column] || '').trim();
      const formatValid = emailRegex.test(email);

      let mxValid = false;
      let status = 'Invalid Format';

      if (formatValid && email.includes('@')) {
        const domain = email.split('@')[1].toLowerCase();
        mxValid = mxResults[domain] ?? true;
        status = mxValid ? 'Valid' : 'No MX Record';
      }

      if (status === 'Valid') validCount++;
      else if (status === 'Invalid Format') invalidFormatCount++;
      else if (status === 'No MX Record') noMxCount++;

      return {
        ...row,
        'Format Valid': formatValid,
        'MX Valid': mxValid,
        'Status': status,
      };
    });

    // Generate CSV result
    const resultColumns = [...columns, 'Format Valid', 'MX Valid', 'Status'];
    const csvLines = [
      resultColumns.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','),
      ...resultRows.map(row =>
        resultColumns.map(c => `"${String(row[c] ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ];
    const csvContent = csvLines.join('\n');

    // Upload result to R2
    const resultKey = `results/email-validation-${Date.now()}.csv`;
    await bucket.put(resultKey, csvContent, {
      httpMetadata: { contentType: 'text/csv' },
    });

    // Generate presigned-like URL (we'll create a download endpoint)
    const stats = {
      total: rows.length,
      valid: validCount,
      invalid_format: invalidFormatCount,
      no_mx: noMxCount,
      domains_checked: domains.length,
    };

    return new Response(
      JSON.stringify({
        success: true,
        result_key: resultKey,
        stats,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Validation error:', error);
    return new Response(
      JSON.stringify({ error: 'Validation failed: ' + (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
