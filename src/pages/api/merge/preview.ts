import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';

export const prerender = false;

interface Env {
  DATA_MERGE_BUCKET: R2Bucket;
}

interface PreviewRequest {
  key?: string;
  keys?: string[];
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

    const body = await request.json() as PreviewRequest;
    const keys = body.keys || (body.key ? [body.key] : []);

    if (keys.length === 0) {
      return new Response(
        JSON.stringify({ error: 'File key(s) required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Process all files
    let allColumns: string[] = [];
    let allRows: Record<string, unknown>[] = [];
    let totalRowCount = 0;

    for (const key of keys) {
      const object = await bucket.get(key);
      if (!object) {
        return new Response(
          JSON.stringify({ error: `File not found: ${key}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const arrayBuffer = await object.arrayBuffer();
      const isExcel = key.endsWith('.xlsx') || key.endsWith('.xls');

      let fileColumns: string[] = [];
      let fileRows: Record<string, unknown>[] = [];

      if (isExcel) {
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

        if (data.length > 0) {
          fileColumns = (data[0] as string[]).map(c => String(c || ''));
          totalRowCount += data.length - 1;

          for (let i = 1; i < data.length; i++) {
            const row: Record<string, unknown> = {};
            fileColumns.forEach((col, idx) => {
              row[col] = data[i]?.[idx] ?? '';
            });
            fileRows.push(row);
          }
        }
      } else {
        const text = new TextDecoder().decode(arrayBuffer);
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length > 0) {
          fileColumns = parseCSVLine(lines[0]);
          totalRowCount += lines.length - 1;

          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            const row: Record<string, unknown> = {};
            fileColumns.forEach((col, idx) => {
              row[col] = values[idx] ?? '';
            });
            fileRows.push(row);
          }
        }
      }

      // Use first file's columns as reference, or merge column names
      if (allColumns.length === 0) {
        allColumns = fileColumns;
      }
      allRows = allRows.concat(fileRows);
    }

    // Get first 5 rows for preview
    const preview = allRows.slice(0, 5);

    return new Response(
      JSON.stringify({
        columns: allColumns,
        rowCount: totalRowCount,
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
