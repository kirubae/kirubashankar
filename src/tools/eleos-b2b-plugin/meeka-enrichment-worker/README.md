# Eleos B2B Enrichment Worker

Cloudflare Worker that aggregates LinkedIn profile enrichment data from Apollo.io and SalesQL APIs.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Secrets

Set the required API keys using Wrangler:

```bash
# Apollo.io API key
wrangler secret put APOLLO_API_KEY

# SalesQL API key
wrangler secret put SALESQL_API_KEY
```

### 3. Local Development

```bash
npm run dev
```

This starts the worker locally at `http://localhost:8787`.

### 4. Deploy

```bash
npm run deploy
```

After deployment, your worker will be available at:
`https://eleos-b2b-enrichment.<your-subdomain>.workers.dev`

## API Endpoints

### GET /v1/enrich/from-linkedin-profile

Enriches a LinkedIn profile with contact information.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `linkedin_url` | string | Yes | Full LinkedIn profile URL |

**Example Request:**
```
GET /v1/enrich/from-linkedin-profile?linkedin_url=https://www.linkedin.com/in/johndoe
```

**Success Response (200):**
```json
{
  "emails": [
    {
      "email": "john.doe@company.com",
      "found_on": ["apollo", "salesql"]
    }
  ],
  "phones": [
    {
      "phone": "+1-555-123-4567",
      "found_on": ["salesql"]
    }
  ],
  "metadata": {
    "sources_queried": ["apollo", "salesql"],
    "linkedin_url": "https://www.linkedin.com/in/johndoe",
    "enriched_at": "2025-01-04T12:00:00.000Z"
  }
}
```

**Error Response (401):**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key"
  }
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-04T12:00:00.000Z"
}
```

## Architecture

```
Request
   │
   ▼
┌─────────────────────────────────────────┐
│           Cloudflare Worker             │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      Input Validation           │   │
│  │  - API key check                │   │
│  │  - LinkedIn URL validation      │   │
│  └─────────────────────────────────┘   │
│                  │                      │
│    ┌─────────────┴─────────────┐       │
│    ▼                           ▼       │
│ ┌──────────┐            ┌──────────┐   │
│ │ Apollo   │            │ SalesQL  │   │
│ │  API     │            │   API    │   │
│ └──────────┘            └──────────┘   │
│    │                           │       │
│    └─────────────┬─────────────┘       │
│                  ▼                      │
│  ┌─────────────────────────────────┐   │
│  │         Result Merger           │   │
│  │  - Deduplicate emails/phones    │   │
│  │  - Track sources                │   │
│  │  - Sort by confidence           │   │
│  └─────────────────────────────────┘   │
│                  │                      │
└──────────────────│──────────────────────┘
                   ▼
              Response
```

## Data Sources

### Apollo.io
- Endpoint: `POST https://api.apollo.io/api/v1/people/match`
- Returns: Primary email, personal emails, phone numbers

### SalesQL
- Endpoint: `GET https://api-public.salesql.com/v1/persons/enrich/`
- Returns: Work/personal emails, phone numbers with country codes

## Deduplication Strategy

- **Emails**: Normalized to lowercase, deduplicated by exact match
- **Phones**: Normalized to digits only, prefer formats with country codes
- **Sources**: Tracked for each unique entry (shows where data was found)
