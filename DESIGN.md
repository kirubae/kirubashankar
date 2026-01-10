# Design System

This document outlines the design system, shared resources, and patterns used across the site.

## Color Palette

All colors are defined as CSS custom properties in `src/styles/global.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-cream` | `#FAFAF8` | Page background |
| `--color-paper` | `#FFFFFF` | Card/surface background |
| `--color-terracotta` | `#0284C7` | Primary accent (links, buttons) |
| `--color-terracotta-dark` | `#0369A1` | Primary accent hover state |
| `--color-mustard` | `#D4A534` | Secondary accent |
| `--color-maroon` | `#6B1C23` | Error states |
| `--color-deep-green` | `#1B4D3E` | Success states |
| `--color-ink` | `#2C2416` | Primary text |
| `--color-ink-light` | `#5C4D3C` | Secondary text |
| `--color-border` | `#E8E4DC` | Borders and dividers |

### Using Colors in Tailwind

Colors are available as Tailwind classes:
- `text-ink`, `text-ink-light`, `text-terracotta`
- `bg-cream`, `bg-paper`, `bg-terracotta`
- `border-border`, `border-terracotta`

## Typography

**Font Family:** Work Sans (Google Fonts)
**Weights:** 400 (normal), 500 (medium), 600 (semibold), 700 (bold)

Loaded via `<link>` in `BaseLayout.astro` with `preconnect` for performance.

## Shared Components

### Layout Components

| Component | Location | Usage |
|-----------|----------|-------|
| `BaseLayout` | `src/layouts/BaseLayout.astro` | Wraps all pages with header, footer, SEO |
| `Header` | `src/components/layout/Header.astro` | Site navigation |
| `Footer` | `src/components/layout/Footer.astro` | Site footer with social links |

### UI Components

| Component | Location | Usage |
|-----------|----------|-------|
| `Icon` | `src/components/ui/Icon.astro` | Centralized SVG icons |
| `Breadcrumb` | `src/components/ui/Breadcrumb.astro` | Breadcrumb navigation |
| `ToolCard` | `src/components/ui/ToolCard.astro` | Tool listing cards |

### Header Components

**Tier Badge**: Displays user tier (Free, Pro, Enterprise) next to logo when logged in.
- Element ID: `#tier-badge`
- Colors: Free (gray-100/gray-600), Pro (amber-100/amber-700), Enterprise (purple-100/purple-700)
- Logic in: `src/layouts/BaseLayout.astro` (fetches tier from Supabase profiles, cached in localStorage)

### SEO Components

| Component | Location | Usage |
|-----------|----------|-------|
| `SEOHead` | `src/components/seo/SEOHead.astro` | Meta tags (OG, Twitter) |
| `JsonLd` | `src/components/seo/JsonLd.astro` | Structured data wrapper |

### Schema Generators

| Generator | Location | Usage |
|-----------|----------|-------|
| `generatePersonSchema` | `src/components/seo/schemas/PersonSchema.ts` | Person structured data |
| `generateWebSiteSchema` | `src/components/seo/schemas/WebSiteSchema.ts` | WebSite structured data |
| `generateBreadcrumbSchema` | `src/components/seo/schemas/BreadcrumbSchema.ts` | Breadcrumb structured data |
| `generateWebApplicationSchema` | `src/components/seo/schemas/WebApplicationSchema.ts` | Tool page structured data |

## Icon Component

Use the centralized Icon component instead of inline SVGs:

```astro
---
import Icon from '@components/ui/Icon.astro';
---

<Icon name="home" size={16} />
<Icon name="upload" size={24} class="text-terracotta" />
```

**Available icons:** `home`, `upload`, `chevron-right`, `chevron-left`, `plus`, `x`, `download`, `play`, `stop`, `refresh`, `lock`

## Breadcrumb Component

Use the Breadcrumb component for consistent navigation:

```astro
---
import Breadcrumb from '@components/ui/Breadcrumb.astro';

const breadcrumbs = [
  { name: 'Home', url: '/' },
  { name: 'Things', url: '/tools' },
  { name: 'My Tool', url: '/tools/my-tool' },
];
---

<Breadcrumb items={breadcrumbs} />
```

## Shared Styles

### Global Styles

Located in `src/styles/global.css`:
- CSS custom properties (colors)
- Base HTML/body styles
- Focus states for accessibility

### Tool Page Styles

Located in `src/styles/tools.css`:

| Class | Description |
|-------|-------------|
| `.tool-container` | Main container (max-width: 768px or 1200px wide) |
| `.breadcrumb` | Breadcrumb styling |
| `.page-header` | Page title and subtitle |
| `.step` | Multi-step section container |
| `.step-header` | Step number badge and title |
| `.upload-area` | Drag-and-drop file upload zone |
| `.btn` | Base button styles |
| `.btn-primary` | Primary action button |
| `.btn-secondary` | Secondary action button |
| `.btn-danger` | Destructive action button |
| `.form-label`, `.form-input`, `.form-select` | Form elements |
| `.radio-group`, `.radio-card` | Radio button variants |
| `.progress-bar`, `.progress-fill` | Progress indicators |
| `.results-table-wrapper` | Scrollable table container |
| `.info-card` | Information card |
| `.help-text` | Helper text below inputs |
| `.action-bar` | Button group container |
| `.auth-loading` | Auth check loading container |
| `.skeleton-container` | Skeleton UI wrapper |
| `.skeleton-header` | Skeleton placeholder for headers |
| `.skeleton-upload-area` | Skeleton placeholder for upload zones |
| `.skeleton-button` | Skeleton placeholder for buttons |

## Utilities

Shared utility functions in `src/utils/index.ts`:

```typescript
import { formatFileSize, escapeHtml, parseCSV, downloadCSV } from '@utils/index';

formatFileSize(1024);        // "1.0 KB"
escapeHtml('<script>');      // "&lt;script&gt;"
parseCSV('a,b\n1,2');        // [['a','b'],['1','2']]
downloadCSV(rows, 'file.csv');
```

## Data Files

Centralized data in `src/data/`:

| File | Exports |
|------|---------|
| `person.ts` | `PERSON`, `SOCIAL_LINKS`, `FEATURED_COMPANIES`, `MEDIA_MENTIONS` |
| `site.ts` | `SITE` (name, URL, OG image, Twitter handle) |
| `tools.ts` | `TOOLS`, `getToolBySlug()`, `getAllTools()` |

## Type Definitions

Core types in `src/types/index.ts`:

```typescript
interface Tool {
  slug: string;
  name: string;
  description: string;
  category: 'media' | 'research' | 'utility';
}

interface SEOProps {
  title: string;
  description: string;
  // ...
}
```

## Path Aliases

Configured in `tsconfig.json`:

| Alias | Path |
|-------|------|
| `@components/*` | `src/components/*` |
| `@layouts/*` | `src/layouts/*` |
| `@data/*` | `src/data/*` |
| `@styles/*` | `src/styles/*` |
| `@types/*` | `src/types/*` |
| `@utils/*` | `src/utils/*` |

## Creating a New Tool Page

1. Create the page file: `src/pages/tools/my-tool.astro`
2. Import shared components and styles:

```astro
---
import BaseLayout from '@layouts/BaseLayout.astro';
import { generateBreadcrumbSchema } from '@components/seo/schemas/BreadcrumbSchema';
import { generateWebApplicationSchema } from '@components/seo/schemas/WebApplicationSchema';
import Breadcrumb from '@components/ui/Breadcrumb.astro';
import Icon from '@components/ui/Icon.astro';
import '@styles/tools.css';

const breadcrumbs = [
  { name: 'Home', url: '/' },
  { name: 'Things', url: '/tools' },
  { name: 'My Tool', url: '/tools/my-tool' },
];

const jsonLdSchema = [
  generateBreadcrumbSchema(breadcrumbs),
  generateWebApplicationSchema({
    name: 'My Tool',
    description: 'What this tool does.',
    slug: 'my-tool',
    category: 'UtilityApplication',
    featureList: ['Feature 1', 'Feature 2'],
  }),
];
---

<BaseLayout
  title="My Tool"
  description="What this tool does."
  jsonLd={jsonLdSchema}
>
  <div class="tool-container">
    <Breadcrumb items={breadcrumbs} />

    <header class="page-header">
      <h1>My Tool</h1>
      <p class="page-subtitle">What this tool does</p>
    </header>

    <!-- Tool content here -->
  </div>
</BaseLayout>
```

3. Register in `src/data/tools.ts`:

```typescript
{
  slug: 'my-tool',
  name: 'My Tool',
  description: 'What this tool does.',
  category: 'utility',
}
```

4. Build and deploy!

## File Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── Header.astro
│   │   └── Footer.astro
│   ├── seo/
│   │   ├── SEOHead.astro
│   │   ├── JsonLd.astro
│   │   └── schemas/
│   │       ├── BreadcrumbSchema.ts
│   │       ├── PersonSchema.ts
│   │       ├── WebApplicationSchema.ts
│   │       └── WebSiteSchema.ts
│   └── ui/
│       ├── Breadcrumb.astro
│       ├── Icon.astro
│       └── ToolCard.astro
├── data/
│   ├── person.ts
│   ├── site.ts
│   └── tools.ts
├── layouts/
│   └── BaseLayout.astro
├── lib/
│   └── auth-tier.ts            # Auth tier utilities
├── pages/
│   ├── api/
│   │   ├── research.ts
│   │   ├── validate-emails.ts
│   │   └── share/              # File Share API endpoints
│   │       ├── upload.ts
│   │       ├── files.ts
│   │       ├── files/[id].ts
│   │       ├── access.ts
│   │       ├── download/[id].ts
│   │       └── collections/
│   │           ├── index.ts
│   │           └── [id].ts
│   ├── auth/
│   │   └── callback.astro      # OAuth callback handler
│   ├── s/
│   │   └── [id].astro          # Short URL file download
│   ├── tools/
│   │   ├── index.astro
│   │   ├── [slug].astro        # Dynamic tool pages
│   │   ├── data-merge.astro    # Bulk VLookup tool
│   │   ├── deep-search.astro   # Research Companies tool
│   │   ├── email-validator.astro
│   │   ├── image-canvas.astro
│   │   └── share/
│   │       └── index.astro     # File Share dashboard
│   ├── 404.astro
│   ├── index.astro
│   ├── login.astro             # Login page
│   ├── logout.astro            # Logout handler
│   ├── privacy.astro
│   ├── terms.astro
│   └── sitemap.xml.ts
├── styles/
│   ├── global.css
│   └── tools.css
├── types/
│   ├── index.ts
│   └── share.ts                # File Share types
├── utils/
│   ├── index.ts
│   └── share.ts                # File Share utilities
└── middleware.ts               # Request middleware
```
