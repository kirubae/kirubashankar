export interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
}

export interface Tool {
  slug: string;
  name: string;
  description: string;
  icon?: string;
  category?: string;
  url?: string; // Custom URL, defaults to /tools/{slug}
}

export interface Company {
  name: string;
  role: string;
  url: string;
  description: string;
  current: boolean;
}

export interface MediaMention {
  title: string;
  publication: string;
  url: string;
}

export interface SocialLink {
  name: string;
  url: string;
  handle?: string;
}
