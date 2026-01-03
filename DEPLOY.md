# Deployment Guide - kirubashankar.com

## Cloudflare Account
- **Email**: kiruba.e@gmail.com
- **Account ID**: eeb01e3413d58a8b987623ee7e39a2b7

## Deployment Target
- **Platform**: Cloudflare Pages
- **Project Name**: kirubashankar
- **Production URL**: https://kirubashankar.com
- **Preview URL**: https://kirubashankar-dt3.pages.dev

## Tech Stack
- **Framework**: Astro 5.16.6
- **Adapter**: @astrojs/cloudflare 12.6.12
- **CSS**: Tailwind CSS 4.1.18
- **TypeScript**: Strict mode

## Cloudflare Resources

### D1 Database
- **Name**: file-share-db
- **Database ID**: 219c19e3-6068-4a27-8b0f-f48f1308445c
- **Binding**: FILE_SHARE_DB
- **Region**: ENAM
- **Used by**: File Share tool

### R2 Bucket
- **Name**: file-share
- **Binding**: FILE_SHARE_BUCKET
- **Used by**: File Share tool (PDF storage)

## Pages Bindings (Dashboard Configuration)
Go to: Cloudflare Dashboard → Pages → kirubashankar → Settings → Bindings

| Type | Variable Name | Resource |
|------|---------------|----------|
| D1 Database | FILE_SHARE_DB | file-share-db |
| R2 Bucket | FILE_SHARE_BUCKET | file-share |

## Deploy Commands

### Build
```bash
npm run build
```

### Deploy to Cloudflare Pages
```bash
wrangler pages deploy ./dist --project-name=kirubashankar
```

### One-liner
```bash
npm run build && wrangler pages deploy ./dist --project-name=kirubashankar
```

## Project Structure

```
kirubashankar/
├── src/
│   ├── components/
│   │   ├── layout/          # Header, Footer
│   │   ├── seo/             # SEO meta, JSON-LD schemas
│   │   └── ui/              # Icon, Breadcrumb, ToolCard
│   ├── data/
│   │   ├── person.ts        # Personal info, social links
│   │   ├── site.ts          # Site config (name, URL, OG image)
│   │   └── tools.ts         # Tool registry
│   ├── layouts/
│   │   └── BaseLayout.astro # Main page wrapper
│   ├── pages/
│   │   ├── api/             # API routes
│   │   │   ├── research.ts          # Companies Research API
│   │   │   ├── validate-emails.ts   # Email Validator API
│   │   │   └── share/               # File Share APIs
│   │   ├── tools/           # Tool pages
│   │   │   ├── deep-search.astro    # Companies Research
│   │   │   ├── email-validator.astro
│   │   │   ├── image-resizer.astro
│   │   │   ├── share/index.astro    # File Share Dashboard
│   │   │   └── index.astro          # Tools listing
│   │   ├── s/
│   │   │   └── [id].astro   # File Share public download
│   │   ├── index.astro      # Homepage
│   │   ├── 404.astro
│   │   └── sitemap.xml.ts
│   ├── styles/
│   │   ├── global.css
│   │   └── tools.css
│   ├── types/
│   │   ├── index.ts         # Core types
│   │   └── share.ts         # File Share types
│   ├── utils/
│   │   └── share.ts         # File Share utilities
│   └── env.d.ts             # Cloudflare binding types
├── migrations/
│   └── 0001_file_share.sql  # D1 schema
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   └── images/
├── wrangler.jsonc           # Cloudflare config (for Workers, not used by Pages)
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
└── package.json
```

## URL Routes

### Static Pages (Prerendered)
| URL | File | Description |
|-----|------|-------------|
| `/` | `index.astro` | Homepage |
| `/404` | `404.astro` | Error page |
| `/tools` | `tools/index.astro` | Tools listing |
| `/tools/image-resizer` | `tools/image-resizer.astro` | Image Resizer |
| `/tools/deep-search` | `tools/deep-search.astro` | Companies Research |
| `/tools/email-validator` | `tools/email-validator.astro` | Email Validator |
| `/sitemap.xml` | `sitemap.xml.ts` | Sitemap |

### Server-Side Routes (SSR)
| URL | File | Description |
|-----|------|-------------|
| `/tools/share` | `tools/share/index.astro` | File Share Dashboard |
| `/s/[id]` | `s/[id].astro` | File download page |
| `/api/share/*` | `api/share/*.ts` | File Share APIs |
| `/api/research` | `api/research.ts` | Companies Research API |
| `/api/validate-emails` | `api/validate-emails.ts` | Email Validator API |

## Environment

### Development
```bash
npm run dev
```

### Preview Build Locally
```bash
npm run preview
```

### Wrangler Dev (with bindings)
```bash
wrangler pages dev ./dist
```

## Database Management

### Run Migration
```bash
wrangler d1 execute file-share-db --file=./migrations/0001_file_share.sql --remote
```

### Query Database
```bash
wrangler d1 execute file-share-db --command="SELECT * FROM files" --remote
```

## Troubleshooting

### "Invalid binding" Error
Ensure bindings are configured in Cloudflare Pages Dashboard:
Pages → kirubashankar → Settings → Bindings

### 404 on SSR Routes
Check `_routes.json` in dist folder includes the route in `include` array.

### Deployment Not Updating
Clear Cloudflare cache or wait a few minutes for propagation.

## Useful Commands

```bash
# Check wrangler auth
wrangler whoami

# List Pages projects
wrangler pages project list

# View deployment history
wrangler pages deployment list --project-name=kirubashankar

# List D1 databases
wrangler d1 list

# List R2 buckets
wrangler r2 bucket list
```
