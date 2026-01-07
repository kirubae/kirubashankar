import { EmailEntry, PhoneEntry } from '../types';
import { ApolloResult } from './apollo';
import { SalesQLResult } from './salesql';

export interface MergedResult {
  emails: EmailEntry[];
  phones: PhoneEntry[];
}

// Normalize email for comparison (lowercase, trim)
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Normalize phone for comparison (remove all non-digits)
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Merge emails from multiple sources, deduplicating and tracking sources
function mergeEmails(apolloEmails: EmailEntry[], salesqlEmails: EmailEntry[]): EmailEntry[] {
  const emailMap = new Map<string, Set<string>>();

  // Process Apollo emails
  for (const entry of apolloEmails) {
    const normalized = normalizeEmail(entry.email);
    if (!emailMap.has(normalized)) {
      emailMap.set(normalized, new Set());
    }
    entry.found_on.forEach(source => emailMap.get(normalized)!.add(source));
  }

  // Process SalesQL emails
  for (const entry of salesqlEmails) {
    const normalized = normalizeEmail(entry.email);
    if (!emailMap.has(normalized)) {
      emailMap.set(normalized, new Set());
    }
    entry.found_on.forEach(source => emailMap.get(normalized)!.add(source));
  }

  // Convert back to array format
  const result: EmailEntry[] = [];
  for (const [email, sources] of emailMap) {
    result.push({
      email,
      found_on: Array.from(sources).sort()
    });
  }

  // Sort by number of sources (most found first), then alphabetically
  result.sort((a, b) => {
    if (b.found_on.length !== a.found_on.length) {
      return b.found_on.length - a.found_on.length;
    }
    return a.email.localeCompare(b.email);
  });

  return result;
}

// Merge phones from multiple sources, deduplicating and tracking sources
function mergePhones(apolloPhones: PhoneEntry[], salesqlPhones: PhoneEntry[]): PhoneEntry[] {
  // Map: normalized phone -> { displayPhone, sources }
  const phoneMap = new Map<string, { display: string; sources: Set<string> }>();

  // Process Apollo phones
  for (const entry of apolloPhones) {
    const normalized = normalizePhone(entry.phone);
    if (normalized.length < 7) continue; // Skip invalid short numbers

    if (!phoneMap.has(normalized)) {
      phoneMap.set(normalized, { display: entry.phone, sources: new Set() });
    }
    entry.found_on.forEach(source => phoneMap.get(normalized)!.sources.add(source));
  }

  // Process SalesQL phones
  for (const entry of salesqlPhones) {
    const normalized = normalizePhone(entry.phone);
    if (normalized.length < 7) continue; // Skip invalid short numbers

    if (!phoneMap.has(normalized)) {
      phoneMap.set(normalized, { display: entry.phone, sources: new Set() });
    } else {
      // Prefer longer format (with country code)
      const existing = phoneMap.get(normalized)!;
      if (entry.phone.length > existing.display.length) {
        existing.display = entry.phone;
      }
    }
    entry.found_on.forEach(source => phoneMap.get(normalized)!.sources.add(source));
  }

  // Convert back to array format
  const result: PhoneEntry[] = [];
  for (const [_, data] of phoneMap) {
    result.push({
      phone: data.display,
      found_on: Array.from(data.sources).sort()
    });
  }

  // Sort by number of sources (most found first)
  result.sort((a, b) => b.found_on.length - a.found_on.length);

  return result;
}

// Main merge function
export function mergeResults(
  apolloResult: PromiseSettledResult<ApolloResult>,
  salesqlResult: PromiseSettledResult<SalesQLResult>
): MergedResult {
  // Extract emails and phones from settled results
  let apolloEmails: EmailEntry[] = [];
  let apolloPhones: PhoneEntry[] = [];
  let salesqlEmails: EmailEntry[] = [];
  let salesqlPhones: PhoneEntry[] = [];

  if (apolloResult.status === 'fulfilled' && apolloResult.value.success) {
    apolloEmails = apolloResult.value.emails;
    apolloPhones = apolloResult.value.phones;
  } else {
    console.log('[Merger] Apollo result not available or failed');
  }

  if (salesqlResult.status === 'fulfilled' && salesqlResult.value.success) {
    salesqlEmails = salesqlResult.value.emails;
    salesqlPhones = salesqlResult.value.phones;
  } else {
    console.log('[Merger] SalesQL result not available or failed');
  }

  // Merge and deduplicate
  const emails = mergeEmails(apolloEmails, salesqlEmails);
  const phones = mergePhones(apolloPhones, salesqlPhones);

  console.log(`[Merger] Final: ${emails.length} unique emails, ${phones.length} unique phones`);

  return { emails, phones };
}
