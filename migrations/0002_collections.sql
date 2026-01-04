-- Collections table for organizing files into folders
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  password_hash TEXT,
  allowed_emails TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  depth INTEGER NOT NULL DEFAULT 1,
  item_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- Access logs for collections
CREATE TABLE IF NOT EXISTS collection_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id TEXT NOT NULL,
  email TEXT NOT NULL,
  accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT,
  location TEXT,
  action TEXT NOT NULL DEFAULT 'view',
  success INTEGER NOT NULL DEFAULT 1,
  failure_reason TEXT,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- Add collection_id to files table (NULL for standalone files)
ALTER TABLE files ADD COLUMN collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_collections_parent_id ON collections(parent_id);
CREATE INDEX IF NOT EXISTS idx_collections_is_deleted ON collections(is_deleted);
CREATE INDEX IF NOT EXISTS idx_collections_expires_at ON collections(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_collection_id ON files(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_access_logs_collection_id ON collection_access_logs(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_access_logs_accessed_at ON collection_access_logs(accessed_at);
