import { SITE } from '@data/site';
import { PERSON } from '@data/person';

export function generateWebSiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE.url}#website`,
    url: SITE.url,
    name: SITE.name,
    description: `${PERSON.name} - ${PERSON.jobTitle} at ${PERSON.company}`,
    publisher: {
      '@id': `${SITE.url}#person`,
    },
    inLanguage: 'en-US',
  };
}
