// Gmail Calendly Link Inserter - Part of Eleos B2B
// Adds quick-access buttons to Gmail compose for inserting meeting links

let meetingLinks = [];

// Load the saved meeting links from storage
chrome.storage.sync.get(['meetingLinks'], function(result) {
  meetingLinks = result.meetingLinks || [];
});

// Listen for storage changes
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (changes.meetingLinks) {
    meetingLinks = changes.meetingLinks.newValue || [];
  }
});

// Function to add button to compose window
function addCalendlyButton(composeContainer) {
  // Check if button already exists
  if (composeContainer.querySelector('.meeka-calendly-btn')) {
    return;
  }

  // Find the toolbar container
  const toolbarCell = composeContainer.querySelector('td.a8X.gU');
  if (!toolbarCell) {
    return;
  }

  // Check again if button already exists in this specific toolbar
  if (toolbarCell.querySelector('.meeka-calendly-btn')) {
    return;
  }

  // Create button element matching Gmail's button style
  const button = document.createElement('div');
  button.className = 'wG J-Z-I meeka-calendly-btn';
  button.setAttribute('role', 'button');
  button.setAttribute('data-tooltip', 'Insert Meeting Link');
  button.setAttribute('aria-label', 'Insert Meeting Link');
  button.setAttribute('tabindex', '1');
  button.style.userSelect = 'none';

  // Create button HTML matching Gmail's structure
  button.innerHTML = `
    <div class="J-J5-Ji J-Z-I-Kv-H" style="user-select: none;">
      <div class="J-J5-Ji J-Z-I-J6-H" style="user-select: none;">
        <div class="aaA aMZ" style="user-select: none;">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style="display: block;">
            <path d="M4 2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h1V2zm2 1v1h8V3H6zm-2 3v10h12V6H4z"/>
          </svg>
        </div>
      </div>
    </div>
  `;

  // Add click handler
  button.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    showMeetingLinkMenu(button, composeContainer);
  });

  // Find the container div with class bAK that holds all the buttons
  const buttonContainer = toolbarCell.querySelector('.bAK');

  if (buttonContainer) {
    const lastButton = buttonContainer.querySelector('.wG.J-Z-I:last-of-type');
    if (lastButton) {
      lastButton.parentNode.insertBefore(button, lastButton.nextSibling);
    } else {
      buttonContainer.appendChild(button);
    }
  }
}

// Function to show meeting link menu
function showMeetingLinkMenu(button, composeContainer) {
  // Remove any existing menu
  const existingMenu = document.querySelector('.meeka-calendly-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  if (!meetingLinks || meetingLinks.length === 0) {
    showGmailNotification('No meeting links configured. Right-click extension icon → Options to add links.', 'error');
    return;
  }

  // If only one link, copy directly
  if (meetingLinks.length === 1) {
    copyMeetingLinkToClipboard(meetingLinks[0], composeContainer);
    return;
  }

  // Create menu
  const menu = document.createElement('div');
  menu.className = 'meeka-calendly-menu';

  // Add menu items
  meetingLinks.forEach((link) => {
    const menuItem = document.createElement('div');
    menuItem.className = 'meeka-calendly-menu-item';
    menuItem.textContent = link.name;
    menuItem.addEventListener('click', function(e) {
      e.stopPropagation();
      copyMeetingLinkToClipboard(link, composeContainer);
      menu.remove();
    });
    menu.appendChild(menuItem);
  });

  // Position menu above button
  const buttonRect = button.getBoundingClientRect();
  document.body.appendChild(menu);

  menu.style.bottom = (window.innerHeight - buttonRect.top + 5) + 'px';
  menu.style.left = buttonRect.left + 'px';

  // Close menu when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 10);
}

// Function to extract recipient email from To field
function getRecipientEmail(composeContainer) {
  try {
    const toField = composeContainer.querySelector('div[name="to"]');
    if (!toField) {
      return null;
    }

    // Try multiple selectors for email chips
    let emailChips = toField.querySelectorAll('span[email]');

    if (emailChips.length === 0) {
      emailChips = toField.querySelectorAll('div[email]');
    }

    if (emailChips.length === 0) {
      emailChips = toField.querySelectorAll('[data-hovercard-id]');
    }

    // Check if there's exactly one recipient
    if (emailChips.length === 1) {
      const chip = emailChips[0];
      let email = chip.getAttribute('email');

      if (!email) {
        email = chip.getAttribute('data-hovercard-id');
      }

      if (!email) {
        const text = chip.textContent || '';
        const emailMatch = text.match(/[\w\.-]+@[\w\.-]+\.\w+/);
        if (emailMatch) {
          email = emailMatch[0];
        }
      }

      return email;
    }

    // If no chips, check the input field for typed email
    if (emailChips.length === 0) {
      const input = toField.querySelector('input[type="text"]');
      if (input && input.value) {
        const email = input.value.trim();
        if (email.includes('@') && email.includes('.')) {
          return email;
        }
      }
    }

    return null;
  } catch (error) {
    console.log('Eleos: Error extracting recipient email:', error);
    return null;
  }
}

// Function to copy link to clipboard
function copyMeetingLinkToClipboard(link, composeContainer) {
  let finalUrl = link.url;

  // Try to get recipient email if there's exactly one recipient
  const recipientEmail = getRecipientEmail(composeContainer);

  if (recipientEmail) {
    try {
      const url = new URL(finalUrl);
      url.searchParams.set('email', recipientEmail);
      finalUrl = url.toString();
    } catch (error) {
      // If URL parsing fails, use original URL
    }
  }

  // Use the Clipboard API
  navigator.clipboard.writeText(finalUrl).then(function() {
    const message = recipientEmail
      ? `${link.name} link copied with email prefilled!`
      : `${link.name} link copied to clipboard!`;
    showGmailNotification(message);
  }).catch(function() {
    // Fallback method
    const textArea = document.createElement('textarea');
    textArea.value = finalUrl;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      const message = recipientEmail
        ? `${link.name} link copied with email prefilled!`
        : `${link.name} link copied to clipboard!`;
      showGmailNotification(message);
    } catch (err) {
      showGmailNotification('Failed to copy link', 'error');
    }

    document.body.removeChild(textArea);
  });
}

// Function to show notification
function showGmailNotification(message, type = 'success') {
  // Remove existing notification
  const existing = document.querySelector('.meeka-gmail-notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.className = `meeka-gmail-notification meeka-gmail-notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 2500);
}

// Observer to detect when compose windows are opened
const gmailObserver = new MutationObserver(function() {
  const composeWindows = document.querySelectorAll('.M9');
  composeWindows.forEach(compose => {
    addCalendlyButton(compose);
  });
});

// Start observing when DOM is ready
function initGmailObserver() {
  gmailObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also check for existing compose windows
  setTimeout(() => {
    const composeWindows = document.querySelectorAll('.M9');
    composeWindows.forEach(compose => {
      addCalendlyButton(compose);
    });
  }, 1000);
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGmailObserver);
} else {
  initGmailObserver();
}
