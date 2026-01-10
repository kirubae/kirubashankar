# Deployment Guide

This guide covers deployment for both the frontend (Cloudflare Pages) and backend (Digital Ocean App Platform).

---

## Platform Overview

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Cloudflare Pages | https://kirubashankar.com |
| Backend API | Digital Ocean App Platform | https://api.kirubashankar.com |
| Preview | Cloudflare Pages | https://kirubashankar-dt3.pages.dev |

---

## Cloudflare Account

- **Email**: kiruba.e@gmail.com
- **Account ID**: eeb01e3413d58a8b987623ee7e39a2b7

---

## Frontend (Cloudflare Pages)

### Tech Stack
- **Framework**: Astro 5.x
- **Adapter**: @astrojs/cloudflare
- **CSS**: Tailwind CSS 4.x
- **TypeScript**: Strict mode

### Build & Deploy

```bash
# Build
npm run build

# Deploy to Cloudflare Pages
wrangler pages deploy ./dist --project-name=kirubashankar

# One-liner
npm run build && wrangler pages deploy ./dist --project-name=kirubashankar
```

### Cloudflare Resources

| Resource | Name | Binding | Used By |
|----------|------|---------|---------|
| D1 Database | file-share-db | `FILE_SHARE_DB` | File Share |
| R2 Bucket | file-share | `FILE_SHARE_BUCKET` | File Share (storage) |
| R2 Bucket | data-merge-uploads | `DATA_MERGE_BUCKET` | Data Merge (temp files) |

**Database ID**: 219c19e3-6068-4a27-8b0f-f48f1308445c

### Pages Bindings Configuration

Go to: **Cloudflare Dashboard → Pages → kirubashankar → Settings → Bindings**

| Type | Variable Name | Resource |
|------|---------------|----------|
| D1 Database | FILE_SHARE_DB | file-share-db |
| R2 Bucket | FILE_SHARE_BUCKET | file-share |
| R2 Bucket | DATA_MERGE_BUCKET | data-merge-uploads |

### URL Routes

#### Static Pages (Prerendered)
| URL | File | Description |
|-----|------|-------------|
| `/` | `index.astro` | Homepage |
| `/404` | `404.astro` | Error page |
| `/tools` | `tools/index.astro` | Tools listing |
| `/tools/email-validator` | `tools/email-validator.astro` | Email Validator |
| `/tools/image-canvas` | `tools/image-canvas.astro` | Image Canvas |
| `/privacy` | `privacy.astro` | Privacy Policy |
| `/terms` | `terms.astro` | Terms of Service |
| `/sitemap.xml` | `sitemap.xml.ts` | Sitemap |

#### Server-Side Routes (SSR)
| URL | File | Description |
|-----|------|-------------|
| `/tools/data-merge` | `tools/data-merge.astro` | Bulk VLookup |
| `/tools/deep-search` | `tools/deep-search.astro` | Research Companies |
| `/tools/share` | `tools/share/index.astro` | File Share Dashboard |
| `/s/[id]` | `s/[id].astro` | File download (short URL) |
| `/login` | `login.astro` | Login page |
| `/logout` | `logout.astro` | Logout handler |
| `/auth/callback` | `auth/callback.astro` | OAuth callback |

#### API Routes
| URL | File | Method | Description |
|-----|------|--------|-------------|
| `/api/share/upload` | `api/share/upload.ts` | POST | Upload file |
| `/api/share/files` | `api/share/files.ts` | GET | List files |
| `/api/share/files/[id]` | `api/share/files/[id].ts` | GET/PUT/DELETE | File CRUD |
| `/api/share/access` | `api/share/access.ts` | POST | Validate access |
| `/api/share/download/[id]` | `api/share/download/[id].ts` | GET | Download file |
| `/api/share/collections` | `api/share/collections/index.ts` | GET/POST | Collections |
| `/api/share/collections/[id]` | `api/share/collections/[id].ts` | GET/PUT/DELETE | Collection CRUD |
| `/api/research` | `api/research.ts` | POST | Company research |
| `/api/validate-emails` | `api/validate-emails.ts` | POST | Email validation |

---

## Backend (Digital Ocean App Platform)

### Configuration

| Property | Value |
|----------|-------|
| App Name | kirubashankar-api |
| Region | NYC |
| Instance | basic-xs |
| Runtime | Python 3.11 |
| Config File | `.do/app.yaml` |

### Deploy

The backend auto-deploys when changes are pushed to the `api/` directory on main branch.

```bash
# Manual deploy (if needed)
doctl apps create --spec .do/app.yaml

# Update existing app
doctl apps update <app-id> --spec .do/app.yaml
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/merge/upload` | POST | Upload files for merge |
| `/api/merge/jobs` | POST | Start merge job |
| `/api/merge/jobs/[id]` | GET | Get job status |
| `/api/merge/results/[id]` | GET | Download merge result |
| `/api/research/enrich` | POST | Company enrichment |

### Environment Variables

Set in Digital Ocean App Platform dashboard:

| Variable | Description |
|----------|-------------|
| `CORS_ORIGINS` | Allowed origins (https://kirubashankar.com) |
| `PERPLEXITY_API_KEY` | Perplexity AI API key |
| `APOLLO_API_KEY` | Apollo.io API key |
| `SALESQL_API_KEY` | SalesQL API key |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_ENDPOINT` | R2 endpoint URL |

---

## Database Management

### Run Migration
```bash
wrangler d1 execute file-share-db --file=./migrations/0001_file_share.sql --remote
```

### Query Database
```bash
wrangler d1 execute file-share-db --command="SELECT * FROM files LIMIT 10" --remote
```

### List Tables
```bash
wrangler d1 execute file-share-db --command=".tables" --remote
```

---

## Pre-Deployment Checklist

Before deploying:

1. **Build check**: `npm run build` must succeed
2. **Backend tests**: `cd api && python -m pytest tests/ -v`
3. **SSR verification**: Check `/tools/share` doesn't return `[object Object]`
4. **Pre-deploy script**: `npm run test` shows all green

---

## Local Development

### Frontend
```bash
npm install
npm run dev          # http://localhost:4321
```

### Backend
```bash
cd api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### With Cloudflare Bindings
```bash
npm run build
wrangler pages dev ./dist
```

---

## Useful Commands

```bash
# Wrangler auth
wrangler whoami

# List Pages projects
wrangler pages project list

# View deployment history
wrangler pages deployment list --project-name=kirubashankar

# List D1 databases
wrangler d1 list

# List R2 buckets
wrangler r2 bucket list

# Digital Ocean apps
doctl apps list
```

---

## Troubleshooting

### "Invalid binding" Error
Ensure bindings are configured in Cloudflare Pages Dashboard:
Pages → kirubashankar → Settings → Bindings

### 404 on SSR Routes
Check `_routes.json` in dist folder includes the route in `include` array.

### Deployment Not Updating
Clear Cloudflare cache or wait a few minutes for propagation.

### Backend Not Deploying
Check Digital Ocean App Platform logs in the dashboard.
