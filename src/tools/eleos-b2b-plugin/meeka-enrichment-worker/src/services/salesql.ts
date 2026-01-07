import { Env, SalesQLResponse, EmailEntry, PhoneEntry } from '../types';

export interface SalesQLResult {
  emails: EmailEntry[];
  phones: PhoneEntry[];
  success: boolean;
  error?: string;
}

export async function enrichFromSalesQL(linkedinUrl: string, env: Env): Promise<SalesQLResult> {
  const emptyResult: SalesQLResult = { emails: [], phones: [], success: false };

  if (!env.SALESQL_API_KEY) {
    console.log('[SalesQL] No API key configured');
    return { ...emptyResult, error: 'SalesQL API key not configured' };
  }

  try {
    console.log('[SalesQL] Fetching data for:', linkedinUrl);

    const params = new URLSearchParams({
      linkedin_url: linkedinUrl,
      api_key: env.SALESQL_API_KEY
    });

    const response = await fetch(
      `https://api-public.salesql.com/v1/persons/enrich/?${params.toString()}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SalesQL] API error:', response.status, errorText);
      return { ...emptyResult, error: `SalesQL API error: ${response.status}` };
    }

    const data: SalesQLResponse = await response.json();
    console.log('[SalesQL] Response received');

    const emails: EmailEntry[] = [];
    const phones: PhoneEntry[] = [];

    // Extract emails
    if (data.emails && Array.isArray(data.emails)) {
      for (const emailObj of data.emails) {
        if (emailObj.email) {
          emails.push({
            email: emailObj.email.toLowerCase().trim(),
            found_on: ['salesql']
          });
        }
      }
    }

    console.log(`[SalesQL] Found ${emails.length} emails`);

    return {
      emails,
      phones,
      success: true
    };
  } catch (error) {
    console.error('[SalesQL] Exception:', error);
    return { ...emptyResult, error: `SalesQL exception: ${error}` };
  }
}
