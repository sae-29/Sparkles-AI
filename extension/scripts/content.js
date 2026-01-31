// Content script for Sparkles AI - Continuous Listening Mode with Stealth
(function () {
    // Prevent double initialization
    if (window.sparklesAILoaded) {
        console.log('Sparkles AI: Already loaded, skipping initialization');
        return;
    }
    window.sparklesAILoaded = true;

    // Global state stored on window to survive re-injection
    window.sparklesState = window.sparklesState || {
        recognition: null,
        isListening: false,
        currentAIRequest: null,
        partialTranscript: '',
        finalTranscriptBuffer: '',
        silenceTimeout: null,
        stealthMode: false
    };

    const state = window.sparklesState;

    function initSparklesAI() {
        console.log('Sparkles AI: Initializing...');

        // Create overlay if it doesn't exist
        if (!document.getElementById('sparkles-ai-overlay')) {
            createOverlay();
        }

        // Register message listener
        registerMessageListener();

        // Initialize Web Speech API
        initSpeechRecognition();

        // Add global keyboard shortcuts
        setupKeyboardShortcuts();

        console.log('Sparkles AI: Ready!');
    }

    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'sparkles-ai-overlay';
        overlay.classList.add('hidden');

        overlay.innerHTML = `
            <div class="sparkles-header">
                <span class="sparkles-title">✨ Sparkles AI</span>
                <div class="sparkles-controls">
                    <div id="sparkles-status" class="sparkles-status">Ready</div>
                    <button id="sparkles-stealth" title="Stealth Mode (Ctrl+Shift+H)">👁</button>
                    <button id="sparkles-close" title="Close (Esc)">×</button>
                </div>
            </div>
            <div class="sparkles-content" id="sparkles-response-area">
                <div class="sparkles-welcome">🎤 Click mic or press <strong>Ctrl+Shift+S</strong> to start listening</div>
            </div>
            <div id="sparkles-live-transcript" class="sparkles-live-transcript hidden"></div>
            <div class="sparkles-input-area">
                <div class="sparkles-input-wrapper">
                    <textarea id="sparkles-textarea" placeholder="Type here or use voice..." rows="1"></textarea>
                    <button class="sparkles-btn-mic" id="sparkles-mic" title="Toggle Listening (Ctrl+Shift+S)">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="sparkles-shortcuts">
                <small>Ctrl+Shift+S: Listen | Ctrl+Shift+H: Stealth | Esc: Hide</small>
            </div>
        `;

        document.body.appendChild(overlay);
        console.log('Sparkles AI: Overlay created');

        setupUIEventHandlers();
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+S - Toggle listening
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                const overlay = document.getElementById('sparkles-ai-overlay');
                if (overlay && !overlay.classList.contains('hidden')) {
                    toggleListening();
                }
            }

            // Ctrl+Shift+H - Toggle stealth mode
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                toggleStealthMode();
            }

            // Escape - Hide overlay
            if (e.key === 'Escape') {
                const overlay = document.getElementById('sparkles-ai-overlay');
                if (overlay && !overlay.classList.contains('hidden')) {
                    stopListening();
                    overlay.classList.add('hidden');
                }
            }

            // Ctrl+Shift+O - Quick open overlay
            if (e.ctrlKey && e.shiftKey && e.key === 'O') {
                e.preventDefault();
                const overlay = document.getElementById('sparkles-ai-overlay');
                if (overlay) {
                    overlay.classList.remove('hidden');
                }
            }
        });
    }

    function toggleStealthMode() {
        state.stealthMode = !state.stealthMode;
        const overlay = document.getElementById('sparkles-ai-overlay');
        const stealthBtn = document.getElementById('sparkles-stealth');

        if (state.stealthMode) {
            overlay?.classList.add('stealth-mode');
            if (stealthBtn) stealthBtn.textContent = '🙈';
            console.log('Sparkles AI: Stealth mode ON');
        } else {
            overlay?.classList.remove('stealth-mode');
            if (stealthBtn) stealthBtn.textContent = '👁';
            console.log('Sparkles AI: Stealth mode OFF');
        }
    }

    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Sparkles AI: Web Speech API not supported');
            return;
        }

        state.recognition = new SpeechRecognition();
        state.recognition.continuous = true;
        state.recognition.interimResults = true;
        state.recognition.lang = 'en-US';

        state.recognition.onstart = () => {
            state.isListening = true;
            updateStatus('🎤 Listening...');
            document.getElementById('sparkles-mic')?.classList.add('recording');
        };

        state.recognition.onend = () => {
            if (state.isListening) {
                setTimeout(() => {
                    try {
                        if (state.isListening && state.recognition) {
                            state.recognition.start();
                        }
                    } catch (e) {
                        console.log('Sparkles AI: Restart error:', e.message);
                    }
                }, 100);
            } else {
                updateStatus('Ready');
                document.getElementById('sparkles-mic')?.classList.remove('recording');
            }
        };

        state.recognition.onerror = (event) => {
            console.error('Sparkles AI: Error:', event.error);
            if (event.error === 'not-allowed') {
                appendMessage('System', '❌ Mic access denied.');
                state.isListening = false;
                updateStatus('Mic Denied');
            }
        };

        state.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Show live transcript
            const liveTranscriptEl = document.getElementById('sparkles-live-transcript');
            if (liveTranscriptEl) {
                if (interimTranscript || finalTranscript) {
                    liveTranscriptEl.classList.remove('hidden');
                    liveTranscriptEl.innerHTML = `
                        <span class="partial">${interimTranscript}</span>
                        <span class="final">${finalTranscript}</span>
                    `;
                }
            }

            // Process finalized transcript
            if (finalTranscript) {
                state.finalTranscriptBuffer += ' ' + finalTranscript;
                state.finalTranscriptBuffer = state.finalTranscriptBuffer.trim();

                if (state.silenceTimeout) clearTimeout(state.silenceTimeout);

                // 500ms silence triggers AI (reduced from 600ms for faster response)
                state.silenceTimeout = setTimeout(() => {
                    if (state.finalTranscriptBuffer) {
                        const query = state.finalTranscriptBuffer;
                        state.finalTranscriptBuffer = '';

                        if (liveTranscriptEl) {
                            liveTranscriptEl.classList.add('hidden');
                            liveTranscriptEl.innerHTML = '';
                        }

                        processQuery(query);
                    }
                }, 500);
            }
        };
    }

    async function processQuery(query) {
        if (!query.trim()) return;
        if (!isExtensionContextValid()) {
            showContextInvalidMessage();
            return;
        }

        updateStatus('🤔 Thinking...');

        if (state.currentAIRequest) {
            state.currentAIRequest.aborted = true;
        }

        const requestId = Date.now();
        state.currentAIRequest = { id: requestId, aborted: false };

        appendMessage('You', query);
        const loadingEl = appendMessage('AI', '⏳ ...', true);

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'CHAT_REQUEST',
                query: query,
                mode: 'full'
            });

            if (state.currentAIRequest.aborted || state.currentAIRequest.id !== requestId) {
                loadingEl.innerHTML = '<em>(superseded)</em>';
                return;
            }

            if (response && response.solution) {
                loadingEl.innerHTML = formatMarkdown(response.solution);
            } else if (response && response.error) {
                loadingEl.innerHTML = '❌ ' + response.error;
            } else {
                loadingEl.innerHTML = '❌ No response. Backend running?';
            }
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                loadingEl.innerHTML = '⚠️ Refresh page to reconnect.';
            } else {
                loadingEl.innerHTML = '❌ ' + error.message;
            }
        } finally {
            if (state.currentAIRequest && state.currentAIRequest.id === requestId) {
                updateStatus(state.isListening ? '🎤 Listening...' : 'Ready');
            }
        }
    }

    function updateStatus(status) {
        const statusEl = document.getElementById('sparkles-status');
        if (statusEl) statusEl.textContent = status;
    }

    function startListening() {
        if (!state.recognition) {
            appendMessage('System', '❌ Speech recognition not available.');
            return;
        }
        if (state.isListening) return;

        state.isListening = true;
        try {
            state.recognition.start();
        } catch (e) {
            console.log('Sparkles AI: Start error:', e);
        }
    }

    function stopListening() {
        state.isListening = false;
        if (state.recognition) {
            try { state.recognition.stop(); } catch (e) { }
        }
        updateStatus('Ready');
        document.getElementById('sparkles-mic')?.classList.remove('recording');

        const liveTranscriptEl = document.getElementById('sparkles-live-transcript');
        if (liveTranscriptEl) {
            liveTranscriptEl.classList.add('hidden');
            liveTranscriptEl.innerHTML = '';
        }
    }

    function toggleListening() {
        if (state.isListening) {
            stopListening();
        } else {
            startListening();
        }
    }

    function isExtensionContextValid() {
        try {
            return !!chrome.runtime && !!chrome.runtime.id;
        } catch (e) {
            return false;
        }
    }

    function showContextInvalidMessage() {
        const responseArea = document.getElementById('sparkles-response-area');
        if (responseArea) {
            responseArea.innerHTML = `
                <div class="sparkles-refresh-prompt">
                    <div class="sparkles-refresh-icon">🔄</div>
                    <div class="sparkles-refresh-title">Extension Updated</div>
                    <button class="sparkles-refresh-btn" onclick="location.reload()">Refresh Page</button>
                </div>
            `;
        }
    }

    function registerMessageListener() {
        if (window.sparklesAIListenerRegistered) return;
        window.sparklesAIListenerRegistered = true;

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'TOGGLE_OVERLAY') {
                const overlay = document.getElementById('sparkles-ai-overlay');
                if (overlay) {
                    overlay.classList.toggle('hidden');
                    if (!overlay.classList.contains('hidden')) {
                        document.getElementById('sparkles-textarea')?.focus();
                    }
                    sendResponse({ success: true });
                }
            }
            return true;
        });
    }

    function setupUIEventHandlers() {
        const overlay = document.getElementById('sparkles-ai-overlay');
        const textarea = document.getElementById('sparkles-textarea');
        const micBtn = document.getElementById('sparkles-mic');
        const closeBtn = document.getElementById('sparkles-close');
        const stealthBtn = document.getElementById('sparkles-stealth');

        closeBtn.addEventListener('click', () => {
            stopListening();
            overlay.classList.add('hidden');
        });

        stealthBtn.addEventListener('click', toggleStealthMode);

        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
        });

        textarea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const query = textarea.value.trim();
                if (!query) return;
                textarea.value = '';
                textarea.style.height = 'auto';
                processQuery(query);
            }
        });

        micBtn.addEventListener('click', () => {
            if (!isExtensionContextValid()) {
                showContextInvalidMessage();
                return;
            }
            toggleListening();
        });

        makeDraggable(overlay);
    }

    function appendMessage(sender, text) {
        const responseArea = document.getElementById('sparkles-response-area');
        const welcome = responseArea.querySelector('.sparkles-welcome');
        if (welcome) welcome.remove();

        const msgDiv = document.createElement('div');
        msgDiv.className = 'sparkles-message';
        msgDiv.classList.add(sender === 'You' ? 'user' : sender === 'AI' ? 'ai' : 'system');

        msgDiv.innerHTML = `
            <div class="sparkles-sender">${sender}</div>
            <div class="msg-body">${text}</div>
        `;

        responseArea.appendChild(msgDiv);
        responseArea.scrollTop = responseArea.scrollHeight;

        return msgDiv.querySelector('.msg-body');
    }

    function formatMarkdown(text) {
        if (!text) return '';
        return text
            .replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    function makeDraggable(overlay) {
        const header = overlay.querySelector('.sparkles-header');
        let isDragging = false;
        let startX, startY, initialX = 0, initialY = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            startX = e.clientX - initialX;
            startY = e.clientY - initialY;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            initialX = e.clientX - startX;
            initialY = e.clientY - startY;
            overlay.style.transform = `translate(${initialX}px, ${initialY}px)`;
        });

        document.addEventListener('mouseup', () => { isDragging = false; });
    }

    initSparklesAI();
})();
