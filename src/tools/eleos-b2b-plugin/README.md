# Eleos B2B Chrome Extension

A Chrome extension that enriches LinkedIn profiles with contact information (emails and phone numbers) for B2B sales teams.

## Features

- **LinkedIn Profile Enrichment**: Automatically displays contact information when viewing LinkedIn profiles
- **Gmail Integration**: Quick-access button to insert meeting links in Gmail compose windows
- **Multi-Source Data**: Aggregates data from Apollo.io and SalesQL for comprehensive coverage
- **Smart Caching**: Caches results locally for 30 days to minimize API costs

## Installation

### From Source (Development)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** and select the extension directory
5. The Eleos B2B icon should appear in your toolbar

### Configuration

1. Click the Eleos B2B extension icon
2. Click **Settings** to open the options page
3. Configure your meeting links for Gmail integration
4. (Optional) Manage your enrichment cache

## How It Works

### LinkedIn Enrichment

When you visit a LinkedIn profile (`linkedin.com/in/username`), the extension:

1. Detects the profile page load
2. Checks local cache for existing data (valid for 30 days)
3. If not cached, calls the Eleos enrichment API
4. Displays contact information in a card below the profile header
5. Caches the result locally to avoid redundant API calls

### Gmail Meeting Links

When composing an email in Gmail:

1. A calendar icon appears in the compose toolbar
2. Click to see your configured meeting links
3. Select a link to copy it to clipboard
4. If there's a single recipient, their email is auto-appended to the link

## Architecture

```
+----------------------------------------------------------+
|                    Chrome Extension                       |
+----------------------------------------------------------+
|  content.js         | gmail-content.js | background.js   |
|  (LinkedIn pages)   | (Gmail pages)    | (Service worker)|
+----------------------------------------------------------+
          |
          v
+----------------------------------------------------------+
|           Cloudflare Worker (API Proxy)                  |
+----------------------------------------------------------+
|  /v1/enrich/from-linkedin-profile                        |
|  - Accepts LinkedIn URL                                  |
|  - Aggregates data from multiple sources                 |
|  - Returns unified contact data                          |
+----------------------------------------------------------+
          |                    |
          v                    v
   +--------------+     +--------------+
   |  Apollo.io   |     |   SalesQL    |
   |     API      |     |     API      |
   +--------------+     +--------------+
```

## API Integration

### Enrichment API

**Endpoint:** `GET /v1/enrich/from-linkedin-profile`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `linkedin_url` | string | Yes | The LinkedIn profile URL to enrich |

**Response:**
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
  ]
}
```

## File Structure

```
eleos-b2b-extension/
├── manifest.json       # Extension manifest (permissions, scripts)
├── config.js           # API configuration (base URL)
├── content.js          # LinkedIn profile enrichment + caching
├── gmail-content.js    # Gmail meeting link integration
├── gmail-styles.css    # Gmail UI styles
├── popup.html          # Extension popup UI
├── popup.js            # Popup script
├── options.html        # Settings page UI
├── options.js          # Settings logic + cache management
├── icon16.png          # Extension icon (16x16)
├── icon48.png          # Extension icon (48x48)
└── icon128.png         # Extension icon (128x128)
```

### Key Files Explained

| File | Purpose |
|------|---------|
| `manifest.json` | Declares permissions, content scripts, and extension metadata |
| `config.js` | Stores API base URL (loaded before content.js) |
| `content.js` | Monitors LinkedIn profiles, fetches enrichment data, manages cache |
| `gmail-content.js` | Injects calendar button into Gmail compose, handles meeting links |
| `options.js` | Settings management, cache statistics, and cache clearing |

## Development

### Local Development Setup

1. Update `config.js` to point to local API:
   ```javascript
   const MEEKA_CONFIG = {
     API_BASE_URL: 'http://localhost:8787',
     API_KEY: 'your-dev-api-key'
   };
   ```

2. If running the Cloudflare Worker locally:
   ```bash
   cd eleos-enrichment-worker
   wrangler dev
   ```

3. Make changes to extension files
4. Go to `chrome://extensions/` and click the refresh icon on Eleos B2B
5. Reload LinkedIn to test changes

### Testing

- **LinkedIn Enrichment**: Visit any LinkedIn profile page (`/in/username`)
- **Gmail Integration**: Open Gmail and compose a new email
- **Cache**: Check cache status in Settings page

### Debugging

Open Chrome DevTools (F12) on LinkedIn or Gmail pages to see console logs:
- `[Eleos]` prefix for general logs
- `Using cached data` when cache hit occurs
- `Fetching from API` when making fresh request

## Caching System

The extension caches enrichment results locally to:
- Reduce API costs (each profile queried once per 30 days)
- Improve speed (cached responses are instant)
- Work offline (previously viewed profiles available without internet)

### Cache Management

Access cache controls in the Settings page:
- **View Statistics**: See number of cached profiles and storage used
- **Clear Cache**: Remove all cached data
- **Export to CSV**: Download cache data for backup/analysis

### Cache Duration

- Default: 30 days
- After expiration, fresh data is fetched on next profile visit

## Permissions

The extension requests these Chrome permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | Store user settings and cache data |
| `clipboardWrite` | Copy meeting links to clipboard |

### Host Permissions

- `https://www.linkedin.com/*` - LinkedIn profile enrichment
- `https://*.workers.dev/*` - Cloudflare Worker API
- `https://mail.google.com/*` - Gmail compose integration

## Troubleshooting

### Enrichment not showing on LinkedIn

1. **Check console for errors**: Open DevTools (F12) > Console tab
2. **Verify you're on a profile page**: URL should be `/in/username`
3. **Check API configuration**: Verify `config.js` has correct URL and key
4. **Check network requests**: DevTools > Network tab, look for API calls
5. **Clear cache and retry**: Use Settings page to clear cache

### Gmail button not appearing

1. **Refresh Gmail**: Close and reopen Gmail after installing
2. **Open compose window**: Button only appears in compose view
3. **Check for conflicts**: Disable other Gmail extensions temporarily

### Cache not working

1. **Check storage quota**: Chrome limits extension storage
2. **Clear and retry**: Use "Clear Cache" in Settings
3. **Check console**: Look for storage-related errors

### API returning errors

1. **Check API key**: Verify key in `config.js` is valid
2. **Check network**: Ensure you have internet connectivity
3. **Rate limiting**: Wait a few minutes and retry
4. **API status**: Check if API endpoint is accessible

## Security Notes

- API keys are stored client-side in `config.js` (consider environment-specific builds for production)
- All user inputs are sanitized to prevent XSS attacks
- LinkedIn cookies are only sent to authorized webhook endpoints
- Chrome storage is used for secure, isolated data storage

## License

Proprietary - Eleos

---

## Changelog

### v1.0
- Initial release
- LinkedIn profile enrichment
- Gmail meeting link integration

### v1.1 (Planned)
- Multi-source API (Apollo + SalesQL)
- Local caching (30-day expiration)
- Cache management UI
