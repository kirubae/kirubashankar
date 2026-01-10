# File Share Service

Secure file sharing with password protection, email restrictions, and expiry dates.

> For deployment info, see [DEPLOY.md](./DEPLOY.md)

---

## Overview

File Share allows users to:
- Upload PDF files to Cloudflare R2
- Set password protection and email restrictions
- Share via short URLs (`/s/[id]`)
- Organize files into collections
- Track download access logs

---

## URL Structure

| URL | Description |
|-----|-------------|
| `/tools/share` | Dashboard (authenticated) |
| `/s/[file-id]` | Public download page |

---

## API Endpoints

### Files API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/share/upload` | POST | Upload file to R2 |
| `/api/share/files` | GET | List user's files |
| `/api/share/files/[id]` | GET | Get file metadata |
| `/api/share/files/[id]` | PUT | Update file settings |
| `/api/share/files/[id]` | DELETE | Delete file |

**Upload Request:**
```typescript
POST /api/share/upload
Content-Type: multipart/form-data

file: File (PDF only, max 50MB)
password?: string (optional)
allowed_emails?: string (comma-separated)
expires_at?: string (ISO date)
```

**Upload Response:**
```json
{
  "id": "abc123",
  "name": "document.pdf",
  "size": 1024000,
  "share_url": "https://kirubashankar.com/s/abc123"
}
```

### Collections API

Collections group multiple files under a single shareable URL.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/share/collections` | GET | List user's collections |
| `/api/share/collections` | POST | Create collection |
| `/api/share/collections/[id]` | GET | Get collection with files |
| `/api/share/collections/[id]` | PUT | Update collection |
| `/api/share/collections/[id]` | DELETE | Delete collection |

**Create Collection:**
```typescript
POST /api/share/collections
Content-Type: application/json

{
  "name": "Q4 Reports",
  "description": "Quarterly financial reports",
  "password": "optional-password",
  "allowed_emails": ["user@example.com"],
  "expires_at": "2025-12-31T23:59:59Z"
}
```

**Add Files to Collection:**
```typescript
PUT /api/share/collections/[id]
Content-Type: application/json

{
  "file_ids": ["file1", "file2", "file3"]
}
```

### Access Control API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/share/access` | POST | Validate access & get download token |
| `/api/share/download/[id]` | GET | Download file with token |

**Access Request:**
```typescript
POST /api/share/access
Content-Type: application/json

{
  "file_id": "abc123",
  "password": "user-entered-password",
  "email": "user@example.com"
}
```

**Access Response:**
```json
{
  "valid": true,
  "download_token": "jwt-token-here",
  "expires_in": 300
}
```

---

## Authentication

### User Authentication
- **Provider**: Supabase Auth (Google OAuth)
- **Flow**: Client-side implicit flow
- **Access**: Users only see their own files/collections

### File Access Control
- **Password**: Optional, stored as SHA-256 hash
- **Email Whitelist**: Optional list of allowed email addresses
- **Expiry**: Optional auto-expiration date

---

## Database Schema

### Files Table
```sql
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- Supabase UUID
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  password_hash TEXT,              -- SHA-256 hash
  allowed_emails TEXT,             -- JSON array
  expires_at TEXT,
  collection_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Collections Table
```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- Supabase UUID
  name TEXT NOT NULL,
  description TEXT,
  password_hash TEXT,
  allowed_emails TEXT,             -- JSON array
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Access Logs Table
```sql
CREATE TABLE access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL,
  accessor_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  accessed_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## File Structure

```
src/
├── pages/
│   ├── api/share/
│   │   ├── upload.ts           # File upload handler
│   │   ├── files.ts            # List files
│   │   ├── files/[id].ts       # File CRUD
│   │   ├── access.ts           # Validate access
│   │   ├── download/[id].ts    # Serve file
│   │   └── collections/
│   │       ├── index.ts        # List/create collections
│   │       └── [id].ts         # Collection CRUD
│   ├── tools/share/
│   │   └── index.astro         # Dashboard UI
│   └── s/
│       └── [id].astro          # Public download page
├── types/
│   └── share.ts                # TypeScript interfaces
└── utils/
    └── share.ts                # Utilities (ID gen, hashing)
```

---

## Security

- Files stored in Cloudflare R2 (not publicly accessible)
- Download requires valid access token (JWT)
- Passwords never stored in plaintext
- Access logs track all download attempts
- CORS restricted to production domain
