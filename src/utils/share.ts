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
export async function checkMxRecord(domain: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      {
        headers: {
          Accept: 'application/dns-json',
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json() as { Status: number; Answer?: { type: number }[] };

    // Status 0 = NOERROR, check if MX records exist (type 15)
    if (data.Status === 0 && data.Answer) {
      return data.Answer.some((record) => record.type === 15);
    }

    return false;
  } catch {
    return false;
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

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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

// Max file size: 100MB for authenticated, 10MB for guests
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const GUEST_MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types
export const ALLOWED_MIME_TYPES = ['application/pdf'];

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

// Download token validity: 5 minutes
export const TOKEN_VALIDITY_MS = 5 * 60 * 1000;
