// Eleos B2B - Options Page
const MASTER_PASSWORD = 'Florida';
let meetingLinks = [];

// Load saved settings
document.addEventListener('DOMContentLoaded', function() {
  // Check authentication status
  checkAuthStatus();

  // Load meeting links
  chrome.storage.sync.get(['meetingLinks'], function(result) {
    if (result.meetingLinks && result.meetingLinks.length > 0) {
      meetingLinks = result.meetingLinks;
    } else {
      // Default with one empty link
      meetingLinks = [{ name: '', url: '' }];
    }
    renderMeetingLinks();
  });

  // Add link button handler
  document.getElementById('addLinkBtn').addEventListener('click', addMeetingLink);

  // Auth button handlers
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  document.getElementById('saveKeysBtn').addEventListener('click', handleSaveKeys);
  document.getElementById('masterPasswordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleLogin();
  });
});

// Check and display authentication status
function checkAuthStatus() {
  chrome.storage.local.get(['eleos_authenticated', 'eleos_password', 'eleos_auth_type', 'eleos_apollo_key', 'eleos_salesql_key'], function(result) {
    const authStatus = document.getElementById('authStatus');
    const statusText = document.getElementById('authStatusText');
    const loginSection = document.getElementById('loginSection');

    const isPasswordAuth = result.eleos_authenticated && result.eleos_password === MASTER_PASSWORD;
    const isKeyAuth = result.eleos_auth_type === 'keys' && result.eleos_apollo_key && result.eleos_salesql_key;

    if (isPasswordAuth) {
      statusText.textContent = '✓ Authenticated with master password';
      authStatus.style.display = 'block';
      loginSection.style.display = 'none';
    } else if (isKeyAuth) {
      statusText.textContent = '✓ Authenticated with custom API keys';
      authStatus.style.display = 'block';
      loginSection.style.display = 'none';
    } else {
      authStatus.style.display = 'none';
      loginSection.style.display = 'block';
    }
  });
}

// Handle master password login
function handleLogin() {
  const input = document.getElementById('masterPasswordInput');
  const error = document.getElementById('loginError');
  const password = input.value;

  if (password === MASTER_PASSWORD) {
    chrome.storage.local.set({
      eleos_authenticated: true,
      eleos_password: password,
      eleos_auth_type: 'password',
      eleos_auth_time: Date.now()
    }, function() {
      error.style.display = 'none';
      input.value = '';
      checkAuthStatus();
    });
  } else {
    error.style.display = 'block';
    input.value = '';
    input.focus();
  }
}

// Handle custom API keys save
function handleSaveKeys() {
  const apolloInput = document.getElementById('apolloKeyInput');
  const salesqlInput = document.getElementById('salesqlKeyInput');
  const error = document.getElementById('keysError');
  const success = document.getElementById('keysSuccess');

  const apolloKey = apolloInput.value.trim();
  const salesqlKey = salesqlInput.value.trim();

  if (!apolloKey || !salesqlKey) {
    error.style.display = 'block';
    success.style.display = 'none';
    return;
  }

  chrome.storage.local.set({
    eleos_authenticated: true,
    eleos_auth_type: 'keys',
    eleos_apollo_key: apolloKey,
    eleos_salesql_key: salesqlKey,
    eleos_auth_time: Date.now()
  }, function() {
    error.style.display = 'none';
    success.style.display = 'block';
    apolloInput.value = '';
    salesqlInput.value = '';
    setTimeout(() => {
      success.style.display = 'none';
      checkAuthStatus();
    }, 1500);
  });
}

// Handle logout
function handleLogout() {
  chrome.storage.local.remove([
    'eleos_authenticated',
    'eleos_password',
    'eleos_auth_type',
    'eleos_apollo_key',
    'eleos_salesql_key',
    'eleos_auth_time'
  ], function() {
    checkAuthStatus();
  });
}

function renderMeetingLinks() {
  const container = document.getElementById('meetingLinksContainer');
  container.innerHTML = '';

  meetingLinks.forEach((link, index) => {
    const linkItem = document.createElement('div');
    linkItem.className = 'meeting-link-item';
    linkItem.innerHTML = `
      <input
        type="text"
        class="link-name"
        placeholder="Name (e.g., 15min)"
        value="${escapeHtml(link.name || '')}"
        data-index="${index}"
        data-field="name"
      >
      <input
        type="text"
        class="link-url"
        placeholder="https://calendly.com/your-name/15min"
        value="${escapeHtml(link.url || '')}"
        data-index="${index}"
        data-field="url"
      >
      <button type="button" class="btn-remove" data-index="${index}">Remove</button>
    `;
    container.appendChild(linkItem);
  });

  // Add event listeners
  container.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', handleInputChange);
  });

  container.querySelectorAll('.btn-remove').forEach(button => {
    button.addEventListener('click', handleRemove);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function handleInputChange(e) {
  const index = parseInt(e.target.dataset.index);
  const field = e.target.dataset.field;
  meetingLinks[index][field] = e.target.value;
}

function handleRemove(e) {
  const index = parseInt(e.target.dataset.index);
  meetingLinks.splice(index, 1);

  // Keep at least one empty link
  if (meetingLinks.length === 0) {
    meetingLinks = [{ name: '', url: '' }];
  }

  renderMeetingLinks();
}

function addMeetingLink() {
  meetingLinks.push({ name: '', url: '' });
  renderMeetingLinks();
}

// Save settings
document.getElementById('settingsForm').addEventListener('submit', function(e) {
  e.preventDefault();

  // Validate and filter links
  const validLinks = meetingLinks.filter(link => {
    return link.name.trim() !== '' && link.url.trim() !== '';
  });

  if (validLinks.length === 0) {
    showStatus('Please add at least one meeting link with both name and URL', 'error');
    return;
  }

  // Validate URLs
  for (const link of validLinks) {
    if (!link.url.startsWith('http://') && !link.url.startsWith('https://')) {
      showStatus(`Invalid URL for "${link.name}". URLs must start with http:// or https://`, 'error');
      return;
    }
  }

  // Save to Chrome storage
  chrome.storage.sync.set({
    meetingLinks: validLinks
  }, function() {
    if (chrome.runtime.lastError) {
      showStatus('Error saving settings: ' + chrome.runtime.lastError.message, 'error');
    } else {
      showStatus('Settings saved successfully!', 'success');
    }
  });
});

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;

  if (type === 'success') {
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  }
}

// ==========================================
// CACHE MANAGEMENT
// ==========================================

// Load cache statistics on page load
document.addEventListener('DOMContentLoaded', function() {
  loadCacheStats();

  // Cache management button handlers
  document.getElementById('clearCacheBtn').addEventListener('click', clearCache);
  document.getElementById('exportCacheBtn').addEventListener('click', exportCacheToCSV);
});

function loadCacheStats() {
  chrome.storage.local.get(['enrichment_cache'], function(result) {
    const cache = result.enrichment_cache || {};
    const entries = Object.keys(cache);
    const count = entries.length;

    // Calculate approximate size
    const sizeInBytes = new Blob([JSON.stringify(cache)]).size;
    const sizeFormatted = formatBytes(sizeInBytes);

    document.getElementById('cacheCount').textContent = count === 0 ? 'No cached profiles' : `${count} profile${count !== 1 ? 's' : ''}`;
    document.getElementById('cacheSize').textContent = sizeFormatted;
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function clearCache() {
  if (!confirm('Are you sure you want to clear all cached enrichment data? This will cause new API calls for all profiles.')) {
    return;
  }

  chrome.storage.local.set({ enrichment_cache: {} }, function() {
    if (chrome.runtime.lastError) {
      showCacheStatus('Error clearing cache: ' + chrome.runtime.lastError.message, 'error');
    } else {
      showCacheStatus('Cache cleared successfully!', 'success');
      loadCacheStats();
    }
  });
}

function exportCacheToCSV() {
  chrome.storage.local.get(['enrichment_cache'], function(result) {
    const cache = result.enrichment_cache || {};
    const entries = Object.entries(cache);

    if (entries.length === 0) {
      showCacheStatus('No cached data to export', 'error');
      return;
    }

    // Build CSV content
    const headers = ['Profile ID', 'Emails', 'Email Sources', 'Phones', 'Phone Sources', 'Cached Date', 'Expires Date'];
    const rows = entries.map(([profileId, data]) => {
      const emails = (data.emails || []).map(e => e.email).join('; ');
      const emailSources = (data.emails || []).map(e => (e.found_on || []).join('/')).join('; ');
      const phones = (data.phones || []).map(p => p.phone).join('; ');
      const phoneSources = (data.phones || []).map(p => (p.found_on || []).join('/')).join('; ');
      const cachedDate = data.cached_at ? new Date(data.cached_at).toISOString() : '';
      const expiresDate = data.expires_at ? new Date(data.expires_at).toISOString() : '';

      return [
        profileId,
        `"${emails}"`,
        `"${emailSources}"`,
        `"${phones}"`,
        `"${phoneSources}"`,
        cachedDate,
        expiresDate
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eleos-b2b-cache-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showCacheStatus(`Exported ${entries.length} cached profile${entries.length !== 1 ? 's' : ''} to CSV`, 'success');
  });
}

function showCacheStatus(message, type) {
  const statusDiv = document.getElementById('cacheStatus');
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;

  if (type === 'success') {
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  }
}
