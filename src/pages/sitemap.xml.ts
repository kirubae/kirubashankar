import type { APIRoute } from 'astro';
import { SITE } from '@data/site';
import { getAllTools } from '@data/tools';

export const GET: APIRoute = async () => {
  const tools = getAllTools();

  const pages = [
    { url: '', changefreq: 'monthly', priority: '1.0' },
    { url: 'tools', changefreq: 'weekly', priority: '0.8' },
    ...tools.map((tool) => ({
      url: `tools/${tool.slug}`,
      changefreq: 'monthly' as const,
      priority: '0.7',
    })),
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${SITE.url}/${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
