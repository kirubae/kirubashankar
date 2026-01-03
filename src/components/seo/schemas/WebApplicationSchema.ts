import { SITE } from '@data/site';

interface WebApplicationSchemaOptions {
  name: string;
  description: string;
  slug: string;
  category: 'MultimediaApplication' | 'BusinessApplication' | 'UtilityApplication';
  featureList: string[];
}

/**
 * Generates a WebApplication schema for tool pages.
 * Centralizes the schema structure to avoid duplication across tool pages.
 */
export function generateWebApplicationSchema(options: WebApplicationSchemaOptions) {
  return {
    '@type': 'WebApplication',
    name: options.name,
    description: options.description,
    url: `${SITE.url}/tools/${options.slug}`,
    applicationCategory: options.category,
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: options.featureList,
  };
}
