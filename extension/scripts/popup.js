// popup.js - Simple: just tell background script to toggle
document.getElementById('toggle-btn').addEventListener('click', async () => {
    // Send message to background script to handle the toggle
    chrome.runtime.sendMessage({ type: 'TOGGLE_FROM_POPUP' });
    window.close();
});
