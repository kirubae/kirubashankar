import { PERSON, SOCIAL_LINKS, FEATURED_COMPANIES } from '@data/person';
import { SITE } from '@data/site';

export function generatePersonSchema() {
  const currentCompany = FEATURED_COMPANIES.find((c) => c.current);

  return {
    '@type': 'Person',
    '@id': `${SITE.url}#person`,
    name: PERSON.name,
    givenName: PERSON.givenName,
    familyName: PERSON.familyName,
    jobTitle: PERSON.jobTitle,
    description: PERSON.bio,
    url: PERSON.url,
    image: `${SITE.url}${PERSON.image}`,
    sameAs: SOCIAL_LINKS.map((link) => link.url),
    worksFor: currentCompany
      ? {
          '@type': 'Organization',
          name: currentCompany.name,
          url: currentCompany.url,
        }
      : undefined,
    knowsAbout: ['Insurtech', 'Entrepreneurship', 'Technology', 'Startups'],
  };
}
