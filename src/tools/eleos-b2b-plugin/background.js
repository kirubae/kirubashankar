// Eleos B2B - Background Service Worker

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openOptionsPage') {
    chrome.runtime.openOptionsPage();
  }
});
