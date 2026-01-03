import type { Company, MediaMention, SocialLink } from '@types/index';

export const PERSON = {
  name: 'Kiruba Shankar Eswaran',
  givenName: 'Kiruba Shankar',
  familyName: 'Eswaran',
  jobTitle: 'CEO',
  company: 'Eleos',
  bio: "A builder at heart. I love building products that improve lives. From founding Zaask to developing the UK's first FCA-regulated insurance robo-advisor, I focus on making systems work better for people. Currently at Eleos, making life insurance simpler and more accessible.",
  url: 'https://kirubashankar.com',
  image: '/images/kiruba-profile-image.png',
} as const;

export const SOCIAL_LINKS: SocialLink[] = [
  {
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/in/kiruba-eswaran',
  },
  {
    name: 'Twitter',
    url: 'https://twitter.com/xkiruba',
    handle: '@xkiruba',
  },
  {
    name: 'Crunchbase',
    url: 'https://www.crunchbase.com/person/kiruba-shankar-eswaran',
  },
];

export const FEATURED_COMPANIES: Company[] = [
  {
    name: 'Eleos',
    role: 'CEO',
    url: 'https://www.eleos.co.uk',
    description: 'Making life insurance simpler and more accessible',
    current: true,
  },
  {
    name: 'Zaask',
    role: 'Founder',
    url: 'https://www.zaask.pt',
    description: 'Helping people find certified service professionals',
    current: false,
  },
];

export const MEDIA_MENTIONS: MediaMention[] = [
  {
    title: 'Eleos Secures $4m Seed Investment to Transform the Insurance Sector',
    publication: 'Fintech Finance News',
    url: 'https://ffnews.com/newsarticle/funding/eleos-secures-4m-seed-investment-to-transform-the-insurance-sector/',
  },
  {
    title: 'London-based insurtech Eleos secures €3.75 million seed investment to launch in the US',
    publication: 'EU-Startups',
    url: 'https://www.eu-startups.com/2024/05/london-based-insurtech-eleos-secures-e3-75-million-seed-investment-to-launch-in-the-us/',
  },
  {
    title: 'Insurtech Eleos raised $4 mn seed funding round',
    publication: 'Beinsure',
    url: 'https://beinsure.com/news/insurtech-eleos-raised-4mn/',
  },
  {
    title: 'Eleos raises $4 million',
    publication: 'Coverager',
    url: 'https://coverager.com/eleos-raises-4-million/',
  },
  {
    title: 'London-Based Insurtech Eleos Secures US$4 Million Seed Investment to Expand to the US',
    publication: 'Insurtech Insights',
    url: 'https://www.insurtechinsights.com/london-based-insurtech-eleos-secures-us4-million-seed-investment-to-expand-to-the-us/',
  },
  {
    title: 'Kiruba veio estudar para Lisboa e acabou por fundar uma empresa',
    publication: 'Visão',
    url: 'https://visao.pt/atualidade/sociedade/2015-07-07-kiruba-veio-estudar-para-lisboa-e-acabou-por-fundar-uma-empresaf824917/#&gid=0&pid=1',
  },
  {
    title: 'Worten compra a Zaask',
    publication: 'Jornal de Negócios',
    url: 'https://www.jornaldenegocios.pt/empresas/tecnologias/detalhe/worten-compra-a-zaask',
  },
  {
    title: 'Worten compra 100% da Amazon dos serviços em Portugal',
    publication: 'ECO',
    url: 'https://eco.sapo.pt/2021/09/22/worten-compra-100-da-amazon-dos-servicos-em-portugal/',
  },
];
