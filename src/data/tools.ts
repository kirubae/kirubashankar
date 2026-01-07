import type { Tool } from '@types/index';

export const TOOLS: Tool[] = [
  {
    slug: 'file-share',
    name: 'File Transfer',
    description: 'Move files like a pro, protect data like a bank. Simple transfers meet professional data rooms.',
    category: 'utility',
    url: '/tools/share',
  },
  {
    slug: 'image-canvas',
    name: 'Image Canvas',
    description: "Create social media posts with text and images, or resize, crop, and compress images. It's the Canva for people who just need to get things done.",
    category: 'media',
  },
  {
    slug: 'email-validator',
    name: 'Mail Validity Checker',
    description: 'For the user who wants to "skimp" on costs by removing dead emails before they send. Verify email addresses for free.',
    category: 'utility',
  },
  {
    slug: 'data-merge',
    name: 'Bulk VLookup',
    description: 'VLOOKUPs that don\'t crash your computer. Search millions of rows in seconds, not minutes.',
    category: 'utility',
  },
  {
    slug: 'deep-search',
    name: 'Research Companies',
    description: 'Turns the messy web into a structured database. Get any intel you need about a company in a structured format.',
    category: 'research',
  },
  {
    slug: 'contact-enrichment-plugin',
    name: 'Contact Enrichment for LinkedIn',
    description: 'Chrome extension that enriches LinkedIn profiles with contact information for B2B sales.',
    category: 'utility',
  },
];

export function getToolBySlug(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function getAllTools(): Tool[] {
  return TOOLS;
}
