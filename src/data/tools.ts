import type { Tool } from '@types/index';

export const TOOLS: Tool[] = [
  {
    slug: 'image-resizer',
    name: 'Image Resizer',
    description: 'Resize, crop, and compress images online. Free, fast, and works entirely in your browser.',
    category: 'media',
  },
  {
    slug: 'deep-search',
    name: 'Companies Research',
    description: 'AI-powered research tool. Upload a list of companies and get detailed research using Perplexity AI.',
    category: 'research',
  },
  {
    slug: 'email-validator',
    name: 'Email Validator',
    description: 'Validate email addresses in bulk. Check format and verify MX records.',
    category: 'utility',
  },
  {
    slug: 'data-merge',
    name: 'VLOOKUP for large files',
    description: 'Merge and join large datasets quickly. Replace VLOOKUP with powerful join operations.',
    category: 'utility',
  },
  {
    slug: 'file-share',
    name: 'File Share',
    description: 'Share PDF files securely with expiry dates, password protection, and access controls.',
    category: 'utility',
    url: '/tools/share',
  },
];

export function getToolBySlug(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function getAllTools(): Tool[] {
  return TOOLS;
}
