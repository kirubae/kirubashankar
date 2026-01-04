import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';

export const prerender = false;

interface Env {
  DATA_MERGE_BUCKET: R2Bucket;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = locals.runtime.env as Env;
    const bucket = env.DATA_MERGE_BUCKET;

    if (!bucket) {
      return new Response(
        JSON.stringify({ error: 'Storage not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { key } = await request.json() as { key: string };

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'File key is required' }),
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

    let columns: string[] = [];
    let preview: Record<string, unknown>[] = [];
    let rowCount = 0;

    if (isExcel) {
      // Parse Excel file
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

      if (data.length > 0) {
        columns = (data[0] as string[]).map(c => String(c || ''));
        rowCount = data.length - 1; // Exclude header

        // Get preview rows (first 5 data rows)
        for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
          const row: Record<string, unknown> = {};
          columns.forEach((col, idx) => {
            row[col] = data[i]?.[idx] ?? '';
          });
          preview.push(row);
        }
      }
    } else {
      // Parse CSV file
      const text = new TextDecoder().decode(arrayBuffer);
      const lines = text.split(/\r?\n/).filter(line => line.trim());

      if (lines.length > 0) {
        // Parse header
        columns = parseCSVLine(lines[0]);
        rowCount = lines.length - 1; // Exclude header

        // Get preview rows (first 5 data rows)
        for (let i = 1; i <= Math.min(5, lines.length - 1); i++) {
          const values = parseCSVLine(lines[i]);
          const row: Record<string, unknown> = {};
          columns.forEach((col, idx) => {
            row[col] = values[idx] ?? '';
          });
          preview.push(row);
        }
      }
    }

    return new Response(
      JSON.stringify({
        columns,
        rowCount,
        preview,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Preview error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to preview file' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

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
