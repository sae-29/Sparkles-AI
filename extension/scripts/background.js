// ⚠️ CHANGE THIS URL BEFORE DEPLOYING!
// For local development: 'http://localhost:3000/api'
// For production: 'https://your-render-app.onrender.com/api'
const BACKEND_URL = 'http://localhost:3000/api';

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background: Received message:', request.type);

    if (request.type === 'CHAT_REQUEST') {
        // Handle chat request from content script

        // 1. Send immediate response to close the request channel
        // behavior: synchronous response
        sendResponse({ streamStarted: true });

        // 2. Perform async work safely
        (async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: request.query,
                        mode: request.mode || 'full',
                        stream: true, // Enable streaming
                        history: request.history || [] // Pass context
                    })
                });

                if (!response.ok) throw new Error(response.statusText);

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                // Stream processing...

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    // Send chunk to active tab
                    if (sender.tab?.id) {
                        try {
                            chrome.tabs.sendMessage(sender.tab.id, {
                                type: 'CHAT_STREAM_CHUNK',
                                requestId: request.requestId, // Ensure we match the request
                                chunk: chunk
                            });
                        } catch (e) {
                            // Tab might be closed
                            break;
                        }
                    }
                }

                // Send end message
                if (sender.tab?.id) {
                    chrome.tabs.sendMessage(sender.tab.id, {
                        type: 'CHAT_STREAM_DONE',
                        requestId: request.requestId
                    });
                }

            } catch (error) {
                console.error('Background: Chat error:', error);

                // Note: We cannot use sendResponse here anymore because we already closed it.
                // We use tabs.sendMessage instead.

                if (sender.tab?.id) {
                    chrome.tabs.sendMessage(sender.tab.id, {
                        type: 'CHAT_STREAM_ERROR',
                        requestId: request.requestId,
                        error: error.message
                    });
                }
            }
        })();

        return false; // Explicitly close the message channel (Synchronous)
    }

    if (request.type === 'TOGGLE_FROM_POPUP') {
        // Handle toggle request from popup
        console.log('Background: Toggle from popup');
        toggleOverlay();
        sendResponse({ received: true });
        return true;
    }

    if (request.type === 'STT_REQUEST') {
        // Handle speech-to-text request
        console.log('Background: STT request received, audio size:', request.audioData?.length || 0);

        // Convert base64 to ArrayBuffer
        const binaryString = atob(request.audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        fetch(`${BACKEND_URL}/stt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'audio/webm'
            },
            body: bytes.buffer
        })
            .then(response => response.json())
            .then(data => {
                console.log('Background: STT response:', data);
                sendResponse(data);
            })
            .catch(error => {
                console.error('Background: STT error:', error);
                sendResponse({ error: error.message });
            });

        return true; // Keep message channel open for async response
    }
});

// Toggle overlay on the current active tab
async function toggleOverlay() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            console.error('Background: No active tab found');
            return;
        }

        console.log('Background: Active tab:', tab.url);

        // Check if it's a restricted page
        if (tab.url.startsWith('chrome://') ||
            tab.url.startsWith('chrome-extension://') ||
            tab.url.startsWith('edge://') ||
            tab.url.startsWith('about:')) {
            console.log('Background: Cannot inject into browser internal pages');
            return;
        }

        // Inject the content script
        console.log('Background: Injecting content script...');
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['scripts/content.js']
            });
            console.log('Background: Script injection successful');
        } catch (e) {
            console.log('Background: Script injection note:', e.message);
        }

        // Inject CSS
        try {
            await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['styles/overlay.css']
            });
            console.log('Background: CSS injection successful');
        } catch (e) {
            console.log('Background: CSS injection note:', e.message);
        }

        // Wait for script to initialize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Send toggle message
        console.log('Background: Sending toggle message...');
        try {
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
            console.log('Background: Toggle response:', response);
        } catch (err) {
            console.error('Background: Failed to send toggle:', err.message);

            // Try one more time with a longer delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
                console.log('Background: Retry toggle response:', response);
            } catch (retryErr) {
                console.error('Background: Retry also failed:', retryErr.message);
            }
        }
    } catch (error) {
        console.error('Background: Error in toggleOverlay:', error);
    }
}
// Direct Launch: Toggle overlay when icon is clicked (no popup)
chrome.action.onClicked.addListener((tab) => {
    console.log('Background: Icon clicked, toggling overlay');
    toggleOverlay();
});

// AUTO-RECOVERY: Inject content scripts on install/update to avoid "Extension context invalidated"
chrome.runtime.onInstalled.addListener(async () => {
    console.log('Sparkles AI: Extension installed/updated. Injecting scripts...');

    try {
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });

        for (const tab of tabs) {
            // Skip restricted pages
            if (tab.url.startsWith('chrome://') ||
                tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('edge://')) continue;

            console.log(`Sparkles AI: Re-injecting into tab ${tab.id} (${tab.title})`);

            try {
                // Determine if we should inject styles and scripts
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['scripts/content.js']
                });

                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['styles/overlay.css']
                });
            } catch (err) {
                // Some tabs might be restricted or closed
                console.log(`Sparkles AI: Could not inject into ${tab.id}:`, err.message);
            }
        }
    } catch (e) {
        console.error('Sparkles AI: Auto-injection failed:', e);
    }
});
