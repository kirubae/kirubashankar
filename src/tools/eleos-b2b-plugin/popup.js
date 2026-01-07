// popup.js
document.addEventListener('DOMContentLoaded', function() {
  // Display the extension ID
  document.getElementById('extensionId').textContent = chrome.runtime.id;

  // Open settings page
  document.getElementById('openSettings').addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});