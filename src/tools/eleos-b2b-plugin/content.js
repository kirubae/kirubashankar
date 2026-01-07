// ==========================================
// AUTHENTICATION - Master password check
// ==========================================

// Check if user is authenticated and get auth details
async function getAuthStatus() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'eleos_authenticated',
      'eleos_password',
      'eleos_auth_type',
      'eleos_apollo_key',
      'eleos_salesql_key'
    ], (result) => {
      const isPasswordAuth = result.eleos_authenticated && result.eleos_password === window.ELEOS_CONFIG.MASTER_PASSWORD;
      const isKeyAuth = result.eleos_auth_type === 'keys' && result.eleos_apollo_key && result.eleos_salesql_key;

      if (isPasswordAuth) {
        resolve({ authenticated: true, type: 'password' });
      } else if (isKeyAuth) {
        resolve({
          authenticated: true,
          type: 'keys',
          apolloKey: result.eleos_apollo_key,
          salesqlKey: result.eleos_salesql_key
        });
      } else {
        resolve({ authenticated: false });
      }
    });
  });
}

// Backward compatibility
async function isAuthenticated() {
  const status = await getAuthStatus();
  return status.authenticated;
}

// Create setup prompt section - redirects to settings
function createSetupSection() {
  const template = `
    <section class="artdeco-card pv-profile-card break-words mt2" data-id="enrichment-section">
      <div style="padding: 24px">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="font-size: 16px; font-weight: bold; color: #333;">
            Eleos B2B
          </div>
        </div>
        <h2 style="margin-bottom: 16px; font-size: 20px; font-weight: bold">Setup Required</h2>
        <p style="color: #666; margin-bottom: 16px;">Please configure your authentication to activate contact enrichment.</p>
        <button id="eleos-open-settings-btn"
          style="background: #0a66c2; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;">
          Open Settings
        </button>
      </div>
    </section>
  `;

  const container = document.createElement('div');
  container.innerHTML = template;

  const section = container.firstElementChild;

  // Add event listener after inserting into DOM
  setTimeout(() => {
    const btn = document.getElementById('eleos-open-settings-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openOptionsPage' });
      });
    }
  }, 100);

  return section;
}

// Show setup prompt on LinkedIn profile
async function showSetupPrompt() {
  // Wait for profile elements to load
  const selectors = [
    'main > .artdeco-card',
    'main > div > .artdeco-card',
    'main > div > div > .artdeco-card',
    '[data-view-name="profile-card"]',
    '.pv-top-card'
  ];

  let firstSection = null;
  for (const selector of selectors) {
    firstSection = document.querySelector(selector);
    if (firstSection) break;
  }

  if (!firstSection) {
    console.log("[Eleos] Could not find profile section for setup prompt");
    return;
  }

  // Remove any existing setup sections
  const existingSections = document.querySelectorAll('[data-id="enrichment-section"]');
  existingSections.forEach(section => section.remove());

  // Create and insert setup section
  const setupSection = createSetupSection();
  firstSection.parentNode.insertBefore(setupSection, firstSection.nextSibling);
}

// ==========================================
// CACHING LAYER - 30 day expiration
// ==========================================
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

// Normalize LinkedIn URL to extract profile ID for cache key
function normalizeLinkedInUrl(url) {
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/);
  return match ? match[1].toLowerCase() : null;
}

// Get cached enrichment data
async function getCachedEnrichment(profileId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['enrichment_cache'], (result) => {
      const cache = result.enrichment_cache || {};
      const entry = cache[profileId];
      if (entry) {
        console.log(`[Eleos] Cache entry found for: ${profileId}`);
        resolve(entry);
      } else {
        console.log(`[Eleos] No cache entry for: ${profileId}`);
        resolve(null);
      }
    });
  });
}

// Save enrichment data to cache
async function cacheEnrichment(profileId, data) {
  const now = Date.now();
  const entry = {
    emails: data.emails || [],
    phones: data.phones || [],
    cached_at: now,
    expires_at: now + CACHE_DURATION_MS
  };

  return new Promise((resolve) => {
    chrome.storage.local.get(['enrichment_cache'], (result) => {
      const cache = result.enrichment_cache || {};
      cache[profileId] = entry;
      chrome.storage.local.set({ enrichment_cache: cache }, () => {
        console.log(`[Eleos] Cached data for: ${profileId} (expires: ${new Date(entry.expires_at).toLocaleDateString()})`);
        resolve();
      });
    });
  });
}

// Check if cached entry is expired
function isCacheExpired(entry) {
  if (!entry || !entry.expires_at) return true;
  return Date.now() > entry.expires_at;
}

// ==========================================
// HTML SANITIZATION
// ==========================================

// HTML sanitization to prevent XSS
function sanitizeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function createEnrichmentSection(data) {
  const emails = Array.isArray(data.emails) ? data.emails : [];

  const emailHtml = emails.length > 0
    ? emails.map(email => {
        const sources = Array.isArray(email.found_on) ? email.found_on.join(', ') : '';
        return `
        <div class="contact-item" style="margin-bottom: 8px; border: 1px solid #ddd; border-radius: 8px; padding: 8px;">
          <div style="display: flex; align-items: center; margin-bottom: 4px;">
            <div style="color: #000000; font-size: 16px; margin-right: 8px;">
              ${sanitizeHtml(email.email)}
            </div>
          </div>
          <div style="font-size: 12px; color: #888; margin-left: 4px;">
            Source(s): ${sanitizeHtml(sources)}
          </div>
        </div>
        `;
      }).join('')
    : '<div style="font-size: 14px; color: #757575; padding: 8px;">No emails found</div>';

  const template = `
    <section class="artdeco-card pv-profile-card break-words mt2" data-id="enrichment-section">
      <div style="padding: 24px">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="font-size: 16px; font-weight: bold; color: #333;">
            Eleos B2B
          </div>
        </div>
        <h2 style="margin-bottom: 16px; font-size: 20px; font-weight: bold">Contact Information</h2>
        <div class="contact-details">
          <h3 style="margin: 8px 0; font-size: 16px; color: #000000; font-weight: bold">Emails</h3>
          ${emailHtml}
        </div>
      </div>
    </section>
  `;

  const container = document.createElement('div');
  container.innerHTML = template;

  return container.firstElementChild;
}


async function waitForElement(selector, timeout = 10000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element) return element;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Element not found: ${selector}`);
}

// Add a flag to track ongoing injections
let isInjecting = false;

async function injectEnrichmentData() {
  // If already injecting, skip this call
  if (isInjecting) {
    console.log("⏭️ Injection already in progress, skipping...");
    return;
  }

  try {
    isInjecting = true;
    const startTime = Date.now();
    console.log("=== 🚀 Starting enrichment injection ===");
    console.log(`URL: ${window.location.href}`);
    console.log(`Document ready state: ${document.readyState}`);

    // Check authentication first
    const authStatus = await getAuthStatus();
    if (!authStatus.authenticated) {
      console.log("[Eleos] Not authenticated, showing setup prompt");
      await showSetupPrompt();
      isInjecting = false;
      return;
    }
    console.log("[Eleos] Authentication verified, type:", authStatus.type);

    // Check if we already have a section for this profile
    const currentProfileId = window.location.pathname.split('/in/')[1]?.split('/')[0];
    const existingSections = document.querySelectorAll('[data-id="enrichment-section"]');
    
    // If we have a section with matching profile ID, don't inject again
    for (const section of existingSections) {
      if (section.getAttribute('data-profile-id') === currentProfileId) {
        console.log("Section already exists for this profile, skipping injection");
        isInjecting = false;
        return;
      }
    }

    // Remove any existing sections that don't match the current profile
    existingSections.forEach(section => section.remove());

    // Wait for profile-specific elements to load
    console.log("⏳ Waiting for main element...");
    const mainElement = await waitForElement('main', 10000);
    if (!mainElement) {
      console.error("❌ Main element not found after 10s timeout");
      return;
    }
    console.log("✅ Main element found");

    // Try different selectors for the first section
    const selectors = [
      'main > .artdeco-card',
      'main > div > .artdeco-card',
      'main > div > div > .artdeco-card',
      '[data-view-name="profile-card"]',
      '.pv-top-card'
    ];

    console.log("=== DEBUG: Starting selector search ===");
    let firstSection = null;
    for (const selector of selectors) {
      console.log(`Trying selector: ${selector}`);
      firstSection = await waitForElement(selector, 2000).catch((err) => {
        console.log(`  ❌ Failed: ${selector} - ${err.message}`);
        return null;
      });
      if (firstSection) {
        console.log(`  ✅ Success: Found element with selector: ${selector}`);
        console.log(`  Element tag: ${firstSection.tagName}, classes: ${firstSection.className}`);
        break;
      }
    }

    if (!firstSection) {
      console.error("❌ Could not find any suitable section to inject after");
      console.error("=== DEBUG: DOM Analysis ===");

      // Log main element structure
      if (mainElement) {
        console.error("Main element found, analyzing structure...");
        console.error(`Main element children count: ${mainElement.children.length}`);

        // Log first 5 children of main
        Array.from(mainElement.children).slice(0, 5).forEach((child, index) => {
          console.error(`  Child ${index}: ${child.tagName}, classes: ${child.className.substring(0, 100)}`);
        });

        // Check for artdeco-card elements anywhere
        const allArtdecoCards = document.querySelectorAll('.artdeco-card');
        console.error(`Total .artdeco-card elements on page: ${allArtdecoCards.length}`);

        // Check for profile-specific elements
        const profileCards = document.querySelectorAll('[data-view-name*="profile"]');
        console.error(`Total profile-related elements: ${profileCards.length}`);
        if (profileCards.length > 0) {
          console.error("Profile elements found:");
          Array.from(profileCards).slice(0, 3).forEach((card, index) => {
            console.error(`  ${index}: data-view-name="${card.getAttribute('data-view-name')}", tag: ${card.tagName}`);
          });
        }
      } else {
        console.error("Main element not found!");
      }

      return;
    }

    // Get the profile identifier from the URL
    const profileId = window.location.pathname.split('/in/')[1]?.split('/')[0];
    if (!profileId) {
      console.log("No profile ID found in URL");
      return;
    }

    // Normalize profile ID for cache key
    const cacheKey = profileId.toLowerCase();
    let data = null;
    let fromCache = false;

    // Check cache first
    console.log(`[Eleos] Checking cache for: ${cacheKey}`);
    const cachedData = await getCachedEnrichment(cacheKey);

    if (cachedData && !isCacheExpired(cachedData)) {
      // Use cached data
      console.log(`[Eleos] ✅ Using cached data (cached: ${new Date(cachedData.cached_at).toLocaleDateString()}, expires: ${new Date(cachedData.expires_at).toLocaleDateString()})`);
      data = cachedData;
      fromCache = true;
    } else {
      // Fetch from API
      if (cachedData) {
        console.log(`[Eleos] Cache expired, fetching fresh data...`);
      }

      const currentUrl = window.location.href;
      console.log("📡 Fetching enrichment data from API...");
      const apiStartTime = Date.now();

      // Build API URL with optional custom keys
      let apiUrl = `${window.MEEKA_CONFIG.API_BASE_URL}/v1/enrich/from-linkedin-profile?linkedin_url=${encodeURIComponent(currentUrl)}`;

      // If using custom keys, pass them as query params
      if (authStatus.type === 'keys') {
        apiUrl += `&apollo_key=${encodeURIComponent(authStatus.apolloKey)}`;
        apiUrl += `&salesql_key=${encodeURIComponent(authStatus.salesqlKey)}`;
      }

      const response = await fetch(apiUrl);
      console.log(`API response time: ${Date.now() - apiStartTime}ms`);

      if (!response.ok) {
        console.error(`❌ API request failed: ${response.status} ${response.statusText}`);
        return;
      }

      data = await response.json();
      console.log("✅ Enrichment data received:", data);

      // Cache the result
      await cacheEnrichment(cacheKey, data);
    }

    console.log(`[Eleos] Data source: ${fromCache ? 'CACHE' : 'API'}`);
    console.log(`[Eleos] Emails: ${data.emails?.length || 0}, Phones: ${data.phones?.length || 0}`);

    const section = createEnrichmentSection(data);

    // Insert the new section with additional checks
    if (firstSection && firstSection.parentNode && section) {
      try {
        firstSection.parentNode.insertBefore(section, firstSection.nextSibling);
        section.setAttribute('data-profile-id', currentProfileId);
        const totalTime = Date.now() - startTime;
        console.log(`✅ Successfully injected enrichment section (total time: ${totalTime}ms)`);
      } catch (insertError) {
        console.error("❌ Error during section insertion:", insertError);
        // Try alternative insertion method if the first fails
        try {
          firstSection.insertAdjacentElement('afterend', section);
          section.setAttribute('data-profile-id', currentProfileId);
          const totalTime = Date.now() - startTime;
          console.log(`✅ Successfully injected enrichment section using alternative method (total time: ${totalTime}ms)`);
        } catch (altInsertError) {
          console.error("❌ Alternative insertion method also failed:", altInsertError);
        }
      }
    } else {
      console.error("❌ Missing required elements for injection",
        { hasFirstSection: !!firstSection,
          hasParentNode: !!(firstSection?.parentNode),
          hasSection: !!section
        });
    }
  } catch (error) {
    console.error("❌ Error injecting enrichment data:", error);
    console.error("Stack trace:", error.stack);
  } finally {
    // Always reset the injection flag when done
    isInjecting = false;
    console.log("=== 🏁 Injection process completed ===");
  }
}

function monitorForNavigation() {
  let lastProfileId = null;
  console.log("👀 Navigation monitoring initialized");

  // Create an observer instance for URL changes
  const urlObserver = new MutationObserver((mutations) => {
    // Check if we're on a profile page
    if (!window.location.pathname.startsWith('/in/')) {
      console.log("📍 Not a profile page. Skipping enrichment injection.");
      return;
    }

    // Extract profile ID from current URL
    const currentProfileId = window.location.pathname.split('/in/')[1]?.split('/')[0];

    if (currentProfileId && currentProfileId !== lastProfileId) {
      console.log(`🔄 Profile changed: ${lastProfileId} → ${currentProfileId}`);
      lastProfileId = currentProfileId;

      // Add a small delay to ensure DOM is updated
      setTimeout(() => {
        injectEnrichmentData();
      }, 500);
    }
  });

  // Observe changes to the URL
  urlObserver.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['href']
  });

  // Also monitor pushState and replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    handleUrlChange();
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    handleUrlChange();
  };

  window.addEventListener('popstate', handleUrlChange);

  function handleUrlChange() {
    const currentProfileId = window.location.pathname.split('/in/')[1]?.split('/')[0];
    if (currentProfileId && currentProfileId !== lastProfileId) {
      console.log(`🔄 URL changed via history: ${lastProfileId} → ${currentProfileId}`);
      lastProfileId = currentProfileId;
      setTimeout(() => {
        injectEnrichmentData();
      }, 500);
    } else {
      console.log("📍 URL changed but not to a new profile page");
    }
  }
}

// Initial setup
function initialize() {
  console.log("=== 🎬 Eleos B2B Initializing ===");
  console.log(`Current URL: ${window.location.href}`);
  console.log(`Current path: ${window.location.pathname}`);

  if (window.location.pathname.startsWith('/in/')) {
    const profileId = window.location.pathname.split('/in/')[1]?.split('/')[0];
    console.log(`✅ Landing on a profile page: ${profileId}`);
    console.log("⏳ Injecting enrichment data...");
    injectEnrichmentData();
  } else {
    console.log("ℹ️ Not on a profile page yet");
  }

  console.log("👀 Setting up navigation monitoring...");
  monitorForNavigation();
  console.log("=== ✅ Eleos B2B Ready ===");
}

// Run initialization
initialize();