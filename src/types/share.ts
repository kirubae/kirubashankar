export interface SharedFile {
  id: string;
  filename: string;
  original_filename: string;
  r2_key: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  password_hash: string | null;
  allowed_emails: string | null;
  download_count: number;
  is_deleted: number;
}

export interface AccessLog {
  id: number;
  file_id: string;
  email: string;
  accessed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  action: 'view' | 'download';
  success: number;
  failure_reason: string | null;
}

export interface FileWithLogs extends SharedFile {
  access_logs: AccessLog[];
}

export interface PublicFileInfo {
  id: string;
  filename: string;
  file_size: number;
  created_at: string;
  expires_at: string | null;
  has_password: boolean;
  has_email_restriction: boolean;
}
