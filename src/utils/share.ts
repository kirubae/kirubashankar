import type { BreadcrumbItem } from '@/types/share';
import { formatFileSize } from './index';

// Re-export for backward compatibility
export { formatFileSize };

// Generate URL-safe unique ID (12 characters)
export function generateFileId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 12;
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

// SHA-256 hash (consistent with existing pattern in deep-search)
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Check if domain has MX records (validates email domain can receive mail)
async function checkMxRecordWithProvider(domain: string, provider: 'google' | 'cloudflare'): Promise<boolean> {
  const url = provider === 'google'
    ? `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`
    : `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;

  const response = await fetch(url, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`DNS query failed: ${response.status}`);
  }

  const data = await response.json() as { Status: number; Answer?: { type: number }[] };

  // Status 0 = NOERROR, MX record type is 15
  if (data.Status === 0 && data.Answer) {
    return data.Answer.some((record) => record.type === 15);
  }

  return false;
}

export async function checkMxRecord(domain: string): Promise<boolean> {
  // Try Google DNS first, fallback to Cloudflare
  try {
    return await checkMxRecordWithProvider(domain, 'google');
  } catch {
    try {
      return await checkMxRecordWithProvider(domain, 'cloudflare');
    } catch {
      return false;
    }
  }
}

// Full email validation (format + MX record)
export async function validateEmailFull(email: string): Promise<{ valid: boolean; reason?: string }> {
  const emailLower = email.toLowerCase().trim();

  // Check format
  if (!isValidEmail(emailLower)) {
    return { valid: false, reason: 'invalid_format' };
  }

  // Check MX record
  const domain = emailLower.split('@')[1];
  const hasMx = await checkMxRecord(domain);

  if (!hasMx) {
    return { valid: false, reason: 'no_mx_record' };
  }

  return { valid: true };
}

// Check if file is expired
export function isFileExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}


// Parse allowed emails JSON
export function parseAllowedEmails(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

// Dashboard password hash (same as deep-search tool)
export const DASHBOARD_PASSWORD_HASH = '8e9e26c2ef86ecd02ba5c84da8a0859a39b4181b19f4c89312d6f1c1b78ccf15';

// Max file size: 100MB
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Allowed MIME types (expanded from PDF-only)
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',                                              // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',     // .xlsx
  'application/msword',                                                     // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'image/jpeg',
];

// File extension to MIME type mapping
export const EXTENSION_MIME_MAP: Record<string, string> = {
  'pdf': 'application/pdf',
  'csv': 'text/csv',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
};

// Allowed file extensions
export const ALLOWED_EXTENSIONS = Object.keys(EXTENSION_MIME_MAP);

// Validate PDF by checking magic bytes (must start with %PDF-)
export async function isValidPdf(file: File): Promise<boolean> {
  try {
    // Read first 5 bytes
    const buffer = await file.slice(0, 5).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2D;
  } catch {
    return false;
  }
}

// Validate file by checking magic bytes for supported types
export async function validateFileMagicBytes(file: File): Promise<boolean> {
  try {
    const buffer = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const ext = file.name.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'pdf':
        // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
        return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      case 'jpg':
      case 'jpeg':
        // JPEG: FF D8 FF
        return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
      case 'xls':
      case 'doc':
        // OLE Compound Document: D0 CF 11 E0 A1 B1 1A E1
        return bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
      case 'xlsx':
      case 'docx':
        // ZIP (Office Open XML): 50 4B 03 04
        return bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
      case 'csv':
        // CSV: No magic bytes, text content - allow any
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// Get file type icon name based on MIME type
export function getFileTypeIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/csv') return 'csv';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'excel';
  if (mimeType.includes('word')) return 'word';
  if (mimeType.startsWith('image/')) return 'image';
  return 'file';
}

// Download token validity: 5 minutes
export const TOKEN_VALIDITY_MS = 5 * 60 * 1000;

// Collection constants
export const MAX_COLLECTION_DEPTH = 3;
export const COLLECTION_TOKEN_VALIDITY_MS = 30 * 60 * 1000; // 30 minutes

// Generate collection access token
export async function generateCollectionToken(
  collectionId: string,
  email: string,
  timestamp: number
): Promise<string> {
  return sha256(`${collectionId}:${email}:${timestamp}`);
}

// Validate collection access token
export async function validateCollectionToken(
  collectionId: string,
  email: string,
  token: string,
  timestamp: number
): Promise<boolean> {
  const now = Date.now();
  if (now - timestamp > COLLECTION_TOKEN_VALIDITY_MS) {
    return false;
  }
  const expectedToken = await generateCollectionToken(collectionId, email, timestamp);
  return token === expectedToken;
}

// Check if collection is expired
export function isCollectionExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

// Build breadcrumb path for a collection (requires D1 database)
export async function getCollectionBreadcrumbs(
  db: D1Database,
  collectionId: string
): Promise<BreadcrumbItem[]> {
  const breadcrumbs: BreadcrumbItem[] = [];
  let currentId: string | null = collectionId;

  while (currentId) {
    const collection = await db.prepare(`
      SELECT id, title, parent_id FROM collections WHERE id = ? AND is_deleted = 0
    `).bind(currentId).first<{ id: string; title: string; parent_id: string | null }>();

    if (!collection) break;

    breadcrumbs.unshift({ id: collection.id, title: collection.title });
    currentId = collection.parent_id;
  }

  return breadcrumbs;
}

// Check if user has access to collection (check ancestors for inherited permissions)
export async function checkCollectionAccess(
  db: D1Database,
  collectionId: string,
  email: string,
  password: string | null
): Promise<{ allowed: boolean; reason?: string; rootCollectionId?: string }> {
  // Get collection and its ancestors to check permissions
  const breadcrumbs = await getCollectionBreadcrumbs(db, collectionId);

  if (breadcrumbs.length === 0) {
    return { allowed: false, reason: 'Collection not found' };
  }

  // Get root collection (permissions are inherited from root)
  const rootId = breadcrumbs[0].id;
  const rootCollection = await db.prepare(`
    SELECT id, expires_at, password_hash, allowed_emails FROM collections WHERE id = ? AND is_deleted = 0
  `).bind(rootId).first<{
    id: string;
    expires_at: string | null;
    password_hash: string | null;
    allowed_emails: string | null;
  }>();

  if (!rootCollection) {
    return { allowed: false, reason: 'Collection not found' };
  }

  // Check expiration
  if (isCollectionExpired(rootCollection.expires_at)) {
    return { allowed: false, reason: 'Collection has expired' };
  }

  // Check email restriction
  if (rootCollection.allowed_emails) {
    const allowedEmails = parseAllowedEmails(rootCollection.allowed_emails);
    if (allowedEmails.length > 0 && !allowedEmails.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
      return { allowed: false, reason: 'Email not authorized' };
    }
  }

  // Check password
  if (rootCollection.password_hash) {
    if (!password) {
      return { allowed: false, reason: 'Password required' };
    }
    const hashedPassword = await sha256(password);
    if (hashedPassword !== rootCollection.password_hash) {
      return { allowed: false, reason: 'Invalid password' };
    }
  }

  return { allowed: true, rootCollectionId: rootId };
}
