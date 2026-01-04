# kirubashankar.com

Personal website and tools suite built with Astro, deployed on Cloudflare Pages with a FastAPI backend on Digital Ocean.

---

## Project Overview

**What it does:** Personal portfolio site with browser-based productivity tools (data merge, file sharing, research automation).

**Problems it solves:**
- VLOOKUP/data merge for non-technical users (CSV/Excel)
- Secure file sharing with password protection and expiry
- Company research automation using AI APIs

**What it does NOT do:**
- No user accounts or persistent user data
- No payment processing
- No direct database writes from frontend (all through API)
- AI must not modify infrastructure, deployment configs, or secrets

---

## Scope & Boundaries

### In-Scope
- **Languages:** TypeScript, Python, HTML/CSS
- **Frontend:** Astro 5.x, Tailwind CSS 4.x
- **Backend:** FastAPI, Python 3.11+
- **Platforms:** Cloudflare Pages, Cloudflare R2/D1, Digital Ocean App Platform

### Out-of-Scope (AI Guardrails)
- Modifying `.env`, `.dev.vars`, or any file containing secrets
- Changing Cloudflare account settings or API tokens
- Modifying Digital Ocean app configuration outside `.do/app.yaml`
- Direct production database operations
- Deploying without running pre-deployment tests
- Force pushing to main branch

### Protected Files (Never Modify Without Approval)
```
.env
.dev.vars
api/.env
wrangler.jsonc (compatibility_date, bindings)
.do/app.yaml (secrets configuration)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│              Astro + Tailwind (Cloudflare Pages)                │
│                  https://kirubashankar.com                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Static Pages          SSR Pages           Cloudflare API      │
│   /                     /tools/share        /api/share/*        │
│   /tools                /s/[id]             /api/research       │
│   /tools/data-merge                         /api/validate-emails│
│   /tools/deep-search                                            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                     CLOUDFLARE RESOURCES                        │
│                                                                  │
│   R2 Bucket: file-share          D1 Database: file-share-db    │
│   R2 Bucket: data-merge-uploads                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          BACKEND                                 │
│              FastAPI (Digital Ocean App Platform)               │
│                  https://api.kirubashankar.com                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   /health              Health check                             │
│   /api/merge/*         Data merge operations                    │
│   /api/research/*      Company research (Perplexity AI)         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**AI Operation Zones:**
- `src/` - Frontend code (full access)
- `api/` - Backend code (full access except secrets)
- `scripts/` - Build/test scripts (full access)
- `public/` - Static assets (full access)

---

## Directory Structure

```
/
├── src/                    → Astro frontend application
│   ├── components/         → Reusable UI components
│   │   ├── layout/         → Header, Footer
│   │   ├── seo/            → Meta tags, JSON-LD schemas
│   │   └── ui/             → Icon, Breadcrumb, ToolCard
│   ├── data/               → Site configuration and content
│   ├── layouts/            → Page layout wrappers
│   ├── pages/              → Routes (static + SSR + API)
│   │   ├── api/            → Cloudflare API endpoints
│   │   ├── tools/          → Tool pages
│   │   └── s/              → Short URL routes
│   ├── styles/             → Global and component CSS
│   ├── types/              → TypeScript interfaces
│   └── utils/              → Shared utility functions
│
├── api/                    → FastAPI backend (Digital Ocean)
│   ├── routers/            → API route handlers
│   ├── services/           → Business logic
│   ├── models/             → Pydantic schemas
│   ├── jobs/               → Background job management
│   ├── tests/              → pytest test suite
│   └── storage/            → Temp file storage
│
├── scripts/                → Build and test scripts
│   └── pre-deploy-test.sh  → Pre-deployment validation
│
├── migrations/             → D1 database migrations
├── public/                 → Static assets (favicon, images)
├── .do/                    → Digital Ocean App Platform config
└── dist/                   → Build output (git-ignored)
```

---

## Coding Rules

These are **hard constraints**, not suggestions.

### Style
- Use TypeScript strict mode for all `.ts` files
- Use Tailwind utility classes; avoid inline styles
- Use path aliases (`@components/`, `@utils/`, etc.)
- Single quotes for strings in TypeScript/JavaScript
- Double quotes for HTML attributes

### Naming
- Files: kebab-case (`data-merge.astro`, `file-service.py`)
- Components: PascalCase (`BaseLayout.astro`, `ToolCard.astro`)
- Functions: camelCase (TS) or snake_case (Python)
- CSS classes: kebab-case (`.upload-area`, `.btn-primary`)

### Error Handling
- All API endpoints must return proper HTTP status codes
- Frontend must handle loading, error, and empty states
- Never expose stack traces to users
- Log errors server-side with context

### Testing Requirements
- All backend endpoints must have corresponding pytest tests
- Pre-deployment script must pass before any deploy
- SSR pages must be tested for `[object Object]` regression

### Approval Required
- Any changes to `wrangler.jsonc` compatibility settings
- Any changes to `.do/app.yaml` service configuration
- Deleting or renaming existing API endpoints
- Modifying authentication logic

---

## Other Documentation

| File | Purpose |
|------|---------|
| `DESIGN.md` | Design system: colors, typography, components |
| `DEPLOY.md` | Deployment guide with commands and resources |
| `FILE_SHARE_README.md` | File share feature documentation |
| `.claude/DEPLOY.md` | Pre-deployment workflow (AI instructions) |
| `.claude/test-plan.md` | Test plan and verification steps |

---

## Hosting Details

### Frontend (Cloudflare Pages)
| Property | Value |
|----------|-------|
| Platform | Cloudflare Pages |
| Project | `kirubashankar` |
| URL | https://kirubashankar.com |
| Preview | https://kirubashankar-dt3.pages.dev |
| Build Command | `npm run build` |
| Output Dir | `dist` |

### Backend (Digital Ocean)
| Property | Value |
|----------|-------|
| Platform | Digital Ocean App Platform |
| App Name | `kirubashankar-api` |
| URL | https://api.kirubashankar.com |
| Region | NYC |
| Instance | basic-xs |

### Cloudflare Resources
| Resource | Name | Binding |
|----------|------|---------|
| R2 Bucket | `file-share` | `FILE_SHARE_BUCKET` |
| R2 Bucket | `data-merge-uploads` | `DATA_MERGE_BUCKET` |
| D1 Database | `file-share-db` | `FILE_SHARE_DB` |

---

## Setup & Execution

### Requirements
- Node.js 18+
- Python 3.11+
- npm
- Wrangler CLI (`npm install -g wrangler`)

### Environment Variables

**Frontend (`.dev.vars`):**
```
# No secrets needed for local dev
```

**Backend (`api/.env`):**
```
CORS_ORIGINS=http://localhost:4321
PERPLEXITY_API_KEY=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=data-merge-uploads
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
```

### Running Locally

```bash
# Frontend
npm install
npm run dev          # http://localhost:4321

# Backend
cd api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### Running Tests

```bash
# Frontend pre-deploy tests
npm run test

# Backend unit tests
cd api && python -m pytest tests/ -v
```

### Validating Changes

Before any deployment:

1. **Build check:** `npm run build` must succeed
2. **Backend tests:** `cd api && python -m pytest tests/ -v`
3. **SSR verification:** Check `/tools/share` doesn't return `[object Object]`
4. **Pre-deploy script:** `npm run test` shows all green

### Deploy Commands

```bash
# Frontend (Cloudflare Pages)
npm run build && wrangler pages deploy ./dist --project-name=kirubashankar

# Backend (auto-deploys on git push to api/)
git push origin main
```
