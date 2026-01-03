# File Share Service - Deployment Details

## Cloudflare Account
- **Account**: kiruba.e@gmail.com
- **Account ID**: eeb01e3413d58a8b987623ee7e39a2b7

## Deployment Target
- **Type**: Cloudflare Pages (not Workers)
- **Project Name**: kirubashankar
- **Production URL**: https://kirubashankar.com
- **Pages URL**: https://kirubashankar-dt3.pages.dev

## Cloudflare Resources

### D1 Database
- **Name**: file-share-db
- **Database ID**: 219c19e3-6068-4a27-8b0f-f48f1308445c
- **Binding**: FILE_SHARE_DB
- **Region**: ENAM

### R2 Bucket
- **Name**: file-share
- **Binding**: FILE_SHARE_BUCKET

## URL Structure
- **Dashboard**: https://kirubashankar.com/tools/share
- **Public Share URLs**: https://kirubashankar.com/s/[file-id]

## Files

### Configuration
- `wrangler.jsonc` - R2 and D1 bindings (for Workers deploy, Pages uses dashboard)

### Types & Utilities
- `src/types/share.ts` - TypeScript interfaces
- `src/utils/share.ts` - Shared utilities (ID generation, hashing, validation)
- `src/env.d.ts` - Cloudflare binding types

### API Routes
- `src/pages/api/share/upload.ts` - POST: Upload PDF to R2
- `src/pages/api/share/files.ts` - GET: List all files
- `src/pages/api/share/files/[id].ts` - GET/PUT/DELETE: File CRUD
- `src/pages/api/share/access.ts` - POST: Validate access, generate download token
- `src/pages/api/share/download/[id].ts` - GET: Serve file with token

### Pages
- `src/pages/tools/share/index.astro` - Dashboard (password-protected)
- `src/pages/s/[id].astro` - Public download page (short URL)

### File Structure
```
src/pages/
├── tools/
│   └── share/
│       └── index.astro    # Dashboard at /tools/share
├── s/
│   └── [id].astro         # Public download at /s/[file-id]
└── api/
    └── share/             # API routes (unchanged)
```

### Database
- `migrations/0001_file_share.sql` - Schema for files and access_logs tables

## Authentication
- Dashboard password: Same as deep-search tool (SHA-256 hash in utils/share.ts)
- File passwords: Optional, stored as SHA-256 hash

## Deploy Commands
```bash
# Build
npm run build

# Deploy to Pages
wrangler pages deploy ./dist --project-name=kirubashankar
```

## Bindings (configured in Cloudflare Pages Dashboard)
Go to: Pages → kirubashankar → Settings → Bindings
- D1: FILE_SHARE_DB → file-share-db
- R2: FILE_SHARE_BUCKET → file-share
