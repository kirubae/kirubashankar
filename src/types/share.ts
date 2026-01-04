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
  collection_id: string | null;
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

// Collection types
export interface Collection {
  id: string;
  parent_id: string | null;
  title: string;
  subtitle: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  password_hash: string | null;
  allowed_emails: string | null;
  is_deleted: number;
  depth: number;
  item_count: number;
}

export interface CollectionAccessLog {
  id: number;
  collection_id: string;
  email: string;
  accessed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  location: string | null;
  action: 'view' | 'download_file';
  success: number;
  failure_reason: string | null;
}

export interface CollectionWithLogs extends Collection {
  access_logs: CollectionAccessLog[];
}

export interface CollectionChild {
  type: 'collection';
  id: string;
  title: string;
  subtitle: string | null;
  item_count: number;
  created_at: string;
}

export interface FileChild {
  type: 'file';
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export type CollectionItem = CollectionChild | FileChild;

export interface BreadcrumbItem {
  id: string;
  title: string;
}

export interface CollectionWithContents extends Collection {
  children: CollectionItem[];
  breadcrumbs: BreadcrumbItem[];
}

export interface PublicCollectionInfo {
  id: string;
  title: string;
  subtitle: string | null;
  created_at: string;
  expires_at: string | null;
  has_password: boolean;
  has_email_restriction: boolean;
  item_count: number;
  breadcrumbs: BreadcrumbItem[];
}
