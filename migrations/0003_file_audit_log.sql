-- File audit log to track all R2 operations
CREATE TABLE IF NOT EXISTS file_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'upload', 'delete', 'download', 'verify_fail'
  r2_key TEXT,
  file_size INTEGER,
  status TEXT NOT NULL, -- 'success', 'failed', 'missing'
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_file_audit_file_id ON file_audit_log(file_id);
CREATE INDEX idx_file_audit_operation ON file_audit_log(operation);
CREATE INDEX idx_file_audit_created_at ON file_audit_log(created_at);
