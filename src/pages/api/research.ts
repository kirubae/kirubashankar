import type { APIRoute } from 'astro';

export const prerender = false;

interface Field {
  name: string;
  prompt: string;
  type: string;
  options?: string[];
}

interface ResearchRequest {
  companies: string[];
  fields: Field[];
  apiKey?: string;
}

interface ResearchResult {
  company: string;
  [key: string]: string;
}

async function callPerplexity(
  company: string,
  fields: Field[],
  apiKey: string
): Promise<Record<string, string>> {
  // Build the query
  const fieldPrompts = fields
    .map((f, i) => `${i + 1}. ${f.prompt}`)
    .join('\n');

  const query = `Research "${company}" and provide the following information:\n${fieldPrompts}\n\nRespond with a JSON object using the exact field names provided.`;

  // Build JSON schema for structured output
  const schemaProperties: Record<string, object> = {};
  for (const field of fields) {
    if (field.type === 'Numeric') {
      schemaProperties[field.name] = { type: 'string', description: 'A numeric value as string' };
    } else if (field.type === 'Boolean') {
      schemaProperties[field.name] = { type: 'string', enum: ['true', 'false', 'unknown'] };
    } else if (field.type === 'Enum' && field.options) {
      schemaProperties[field.name] = { type: 'string', enum: [...field.options, 'unknown'] };
    } else {
      schemaProperties[field.name] = { type: 'string' };
    }
  }

  const schema = {
    type: 'object',
    properties: schemaProperties,
    required: fields.map((f) => f.name),
  };

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: query }],
      response_format: {
        type: 'json_schema',
        json_schema: { schema },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Perplexity API error for ${company}:`, error);
    return fields.reduce(
      (acc, f) => ({ ...acc, [f.name]: 'Error' }),
      {} as Record<string, string>
    );
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || '{}';

  try {
    return JSON.parse(content);
  } catch {
    console.error(`Failed to parse Perplexity response for ${company}:`, content);
    return fields.reduce(
      (acc, f) => ({ ...acc, [f.name]: 'Parse Error' }),
      {} as Record<string, string>
    );
  }
}

const PERPLEXITY_API_KEY = import.meta.env.PERPLEXITY_API_KEY || '';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body: ResearchRequest = await request.json();
    const { companies, fields, apiKey: customApiKey } = body;

    // Use custom API key if provided, otherwise use built-in key
    const apiKey = customApiKey || PERPLEXITY_API_KEY;

    if (!companies?.length || !fields?.length) {
      return new Response(
        JSON.stringify({ error: 'Companies and fields are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Process companies sequentially to avoid rate limiting
    const results: ResearchResult[] = [];

    for (const company of companies) {
      if (!company.trim()) continue;

      const data = await callPerplexity(company, fields, apiKey);
      results.push({ company, ...data });

      // Small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Research API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
