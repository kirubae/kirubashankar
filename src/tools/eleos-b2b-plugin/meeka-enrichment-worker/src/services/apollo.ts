import { Env, ApolloPersonResponse, EmailEntry, PhoneEntry } from '../types';

export interface ApolloResult {
  emails: EmailEntry[];
  phones: PhoneEntry[];
  success: boolean;
  error?: string;
}

export async function enrichFromApollo(linkedinUrl: string, env: Env): Promise<ApolloResult> {
  const emptyResult: ApolloResult = { emails: [], phones: [], success: false };

  if (!env.APOLLO_API_KEY) {
    console.log('[Apollo] No API key configured');
    return { ...emptyResult, error: 'Apollo API key not configured' };
  }

  try {
    console.log('[Apollo] Fetching data for:', linkedinUrl);

    const response = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.APOLLO_API_KEY,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        linkedin_url: linkedinUrl,
        reveal_personal_emails: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Apollo] API error:', response.status, errorText);
      return { ...emptyResult, error: `Apollo API error: ${response.status}` };
    }

    const data: ApolloPersonResponse = await response.json();
    console.log('[Apollo] Response received');

    const emails: EmailEntry[] = [];
    const phones: PhoneEntry[] = [];

    // Extract primary email
    if (data.person?.email) {
      emails.push({
        email: data.person.email.toLowerCase().trim(),
        found_on: ['apollo']
      });
    }

    // Extract personal emails
    if (data.person?.personal_emails && Array.isArray(data.person.personal_emails)) {
      for (const email of data.person.personal_emails) {
        if (email && typeof email === 'string') {
          const normalizedEmail = email.toLowerCase().trim();
          // Avoid duplicates
          if (!emails.some(e => e.email === normalizedEmail)) {
            emails.push({
              email: normalizedEmail,
              found_on: ['apollo']
            });
          }
        }
      }
    }

    console.log(`[Apollo] Found ${emails.length} emails`);

    return {
      emails,
      phones,
      success: true
    };
  } catch (error) {
    console.error('[Apollo] Exception:', error);
    return { ...emptyResult, error: `Apollo exception: ${error}` };
  }
}
