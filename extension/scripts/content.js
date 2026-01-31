// Content script for Sparkles AI - Continuous Listening Mode with Stealth
(function () {
    // Prevent double initialization
    if (window.sparklesAILoaded) {
        console.log('Sparkles AI: Already loaded, skipping initialization');
        // Prevent double injection
        if (window.sparklesAIInjected) {
            console.log('Sparkles AI: Already injected, skipping initialization.');
            return;
        }
        window.sparklesAIInjected = true;

        let state = {
            isListening: false,
            recognition: null,
            chatHistory: [], // Will load from storage
            currentAIRequest: null, // { id, loadingEl, fullResponse }
            transcriptBuffer: '',
            silenceTimer: null,
            resumeContext: ''
        };

        // Load history from storage
        chrome.storage.local.get(['sparklesHistory'], (result) => {
            if (result.sparklesHistory) {
                state.chatHistory = result.sparklesHistory;
                console.log('Sparkles AI: Loaded history:', state.chatHistory.length, 'turns');
            }
        });

        function saveHistory() {
            // Limit history to last 50 turns to prevent storage overflow
            const trimmed = state.chatHistory.slice(-50);
            chrome.storage.local.set({ sparklesHistory: trimmed });
        }

        // Helper to append to history and save
        function addToHistory(role, text) {
            state.chatHistory.push({ role, text });
            saveHistory();
        }

        // Listen for stream chunks from background
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'CHAT_STREAM_CHUNK') {
                if (state.currentAIRequest && state.currentAIRequest.id === msg.requestId) {
                    if (state.currentAIRequest.loadingEl) {
                        if (state.currentAIRequest.isFirstChunk) {
                            state.currentAIRequest.loadingEl.innerHTML = '';
                            state.currentAIRequest.isFirstChunk = false;
                        }
                        state.currentAIRequest.fullResponse += msg.chunk;
                        state.currentAIRequest.loadingEl.innerHTML = formatMarkdown(state.currentAIRequest.fullResponse);

                        const responseArea = document.getElementById('sparkles-response-area');
                        if (responseArea) responseArea.scrollTop = responseArea.scrollHeight;
                    }
                }
            }
            if (msg.type === 'CHAT_STREAM_DONE') {
                if (state.currentAIRequest && state.currentAIRequest.id === msg.requestId) {
                    updateStatus(state.isListening ? '🎤 Listening...' : 'Ready');

                    // Save context to history
                    if (state.chatHistory) {
                        state.chatHistory.push({ role: 'user', text: state.currentAIRequest.query });
                        state.chatHistory.push({ role: 'AI', text: state.currentAIRequest.fullResponse });
                        // Limit memory to last 10 exchanges (20 messages)
                        if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);
                    }
                }
            }
            // ... (error handling) ...
        });

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
            // CLEANUP: Remove any existing overlay (likely from a previous extension version)
            const oldOverlay = document.getElementById('sparkles-ai-overlay');
            if (oldOverlay) {
                console.log('Sparkles AI: Removing orphaned overlay');
                oldOverlay.remove();
            }

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
                if (event.error === 'no-speech') {
                    // Benign error, just ignore (loop will restart in onend)
                    return;
                }
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

        // Listen for stream chunks from background
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'CHAT_STREAM_CHUNK') {
                if (state.currentAIRequest && state.currentAIRequest.id === msg.requestId) {
                    if (state.currentAIRequest.loadingEl) {
                        // Clear "Thinking..." on first chunk
                        if (state.currentAIRequest.isFirstChunk) {
                            state.currentAIRequest.loadingEl.innerHTML = '';
                            state.currentAIRequest.isFirstChunk = false;
                        }
                        // Append text (preserving newlines/formatting logic is complex for partial markdown, 
                        // but for speed we append raw text or formatted if possible. 
                        // Simple append for now, markdown parsing usually needs full block)
                        // Ideally we buffer or just append.

                        // For smoother markdown, we just append text content. 
                        // Full markdown rendering on every chunk is expensive/glitchy.
                        // We'll append to a buffer and update innerHTML?
                        state.currentAIRequest.fullResponse += msg.chunk;
                        state.currentAIRequest.loadingEl.innerHTML = formatMarkdown(state.currentAIRequest.fullResponse);

                        // Scroll to bottom
                        const responseArea = document.getElementById('sparkles-response-area');
                        if (responseArea) responseArea.scrollTop = responseArea.scrollHeight;
                    }
                }
            }
            if (msg.type === 'CHAT_STREAM_DONE') {
                if (msg.requestId !== state.currentAIRequest?.id) return;

                // Finalize
                const finalResponse = state.currentAIRequest.fullResponse;
                state.currentAIRequest.loadingEl.classList.remove('loading');
                state.currentAIRequest = null;

                // Add AI response to history
                addToHistory('AI', finalResponse);
            }

            if (msg.type === 'CHAT_STREAM_ERROR') {
                if (msg.requestId !== state.currentAIRequest?.id) return;

                state.currentAIRequest.loadingEl.innerHTML += `<br><span style="color:red">Error: ${msg.error}</span>`;
                state.currentAIRequest.loadingEl.classList.remove('loading');
                state.currentAIRequest = null;
            }
        });

        async function processQuery() {
            if (state.isProcessing || !state.transcriptBuffer.trim()) return;

            const query = state.transcriptBuffer.trim();
            state.isProcessing = true;
            updateStatus('Thinking...');

            // Add User query to history
            addToHistory('User', query);
            appendMessage('User', query);

            state.transcriptBuffer = '';
            const transcriptEl = overlay.querySelector('.sparkles-live-transcript');
            if (transcriptEl) transcriptEl.innerHTML = '';

            // Create AI Message Placeholder
            const requestId = Date.now().toString();
            const loadingEl = appendMessage('AI', '<span class="cursor">|</span>');
            loadingEl.classList.add('loading');

            state.currentAIRequest = {
                id: requestId,
                loadingEl: loadingEl,
                fullResponse: ''
            };

            try {
                // Send request to background (Fire-and-Forget)
                // We use a callback with void 0 to prevent 'message channel closed' errors.
                // Chrome interprets passing a callback as "I handled the response", 
                // even if background returns nothing immediately.
                chrome.runtime.sendMessage({
                    type: 'CHAT_REQUEST',
                    query: query,
                    mode: 'full',
                    requestId: requestId,
                    history: state.chatHistory // Pass full loaded history
                }, (response) => {
                    // Ignore any response or errors here, relying on CHAT_STREAM_ERROR event
                    const err = chrome.runtime.lastError;
                    if (err) {
                        console.error("Sparkles AI: Request Error (caught):", err.message);
                        loadingEl.innerHTML = `<span style="color:red">Error: ${err.message}</span>`;
                    }
                });

                // Note: actual content comes via CHAT_STREAM_CHUNK listener

            } catch (error) {
                console.error('Sparkles AI: Process Error:', error);
                loadingEl.innerHTML = `<span style="color:red">Connection Failed: ${error.message}</span>`;
                state.isProcessing = false;
                updateStatus('Error');
            } finally {
                state.isProcessing = false;
                updateStatus('Ready');
            }
        }

        function updateStatus(status) {
            const statusEl = document.getElementById('sparkles-status');
            if (statusEl) statusEl.textContent = status;
        }
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

        let formatted = text;

        // 1. Split by CLOSED code blocks first
        const parts = formatted.split(/(```[\s\S]*?```)/g);

        return parts.map((part, index) => {
            // Case A: Complete Code Block (Safe)
            if (part.startsWith('```') && part.endsWith('```')) {
                const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
                if (codeMatch) {
                    const lang = codeMatch[1] || '';
                    const code = codeMatch[2];
                    return `<div class="code-block">
                                <div class="code-header">${lang || 'Code'}</div>
                                <pre><code class="language-${lang}">${code}</code></pre>
                            </div>`;
                }
            }

            // Case B: This is the LAST chunk and might contain an OPEN block
            if (index === parts.length - 1 && part.includes('```')) {
                const lastTickIndex = part.lastIndexOf('```');
                // Check if it's really the start of a block (not just inline code like `foo`)
                // Heuristic: If it's at the end, treat as block start.

                const textBefore = part.substring(0, lastTickIndex);
                const potentialBlock = part.substring(lastTickIndex);

                // Render the text before normally
                const renderedText = textBefore
                    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>');

                // Render the rest as an OPEN code block
                const openMatch = potentialBlock.match(/^```(\w*)\n?([\s\S]*)$/);
                if (openMatch) {
                    const lang = openMatch[1] || '';
                    const code = openMatch[2];
                    return renderedText + `<div class="code-block">
                                <div class="code-header">${lang || 'Code'}</div>
                                <pre><code class="language-${lang}">${code}</code></pre>
                            </div>`;
                }
                // If match failed (e.g. just "```"), still render box
                return renderedText + `<div class="code-block">
                            <div class="code-header">...</div>
                            <pre><code></code></pre>
                        </div>`;
            }

            // Case C: Regular Text
            return part
                .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
        }).join('');
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
