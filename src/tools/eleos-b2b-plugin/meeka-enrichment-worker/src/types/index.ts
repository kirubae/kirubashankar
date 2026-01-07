// Environment bindings
export interface Env {
  ENVIRONMENT: string;
  APOLLO_API_KEY: string;
  SALESQL_API_KEY: string;
}

// Unified email entry
export interface EmailEntry {
  email: string;
  found_on: string[];
}

// Unified phone entry
export interface PhoneEntry {
  phone: string;
  found_on: string[];
}

// Enrichment result
export interface EnrichmentResult {
  emails: EmailEntry[];
  phones: PhoneEntry[];
  metadata?: {
    sources_queried: string[];
    linkedin_url: string;
    enriched_at: string;
  };
}

// Apollo API Response types
export interface ApolloPersonResponse {
  person?: {
    id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    personal_emails?: string[];
    contact?: {
      phone_numbers?: ApolloPhoneNumber[];
    };
  };
}

export interface ApolloPhoneNumber {
  raw_number?: string;
  sanitized_number?: string;
  type?: string;
}

// SalesQL API Response types
export interface SalesQLResponse {
  emails?: SalesQLEmail[];
  phones?: SalesQLPhone[];
  credits_used?: number;
}

export interface SalesQLEmail {
  email: string;
  type?: string;
  status?: string;
}

export interface SalesQLPhone {
  phone: string;
  country_code?: string;
  type?: string;
  is_valid?: boolean;
}

// Error response
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
