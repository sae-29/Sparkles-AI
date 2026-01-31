# Sparkles AI

Real-time AI interview assistant Chrome extension with voice input.

## Project Structure
```
Sparkle AI/
├── backend/          # Node.js + Gemini API
└── extension/        # Chrome Extension (MV3)
```

## Quick Start

### 1. Backend
```bash
cd backend
npm install
# Create .env with GEMINI_API_KEY=your_key
npm start
```

### 2. Extension
1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `extension/` folder

## Features
- 🎤 Continuous voice listening
- 🤖 AI-powered answers (Gemini)
- 🥷 Stealth mode for assessments
- ⌨️ Keyboard shortcuts

## Keyboard Shortcuts
- `Ctrl+Shift+S` - Toggle listening
- `Ctrl+Shift+H` - Toggle stealth mode
- `Ctrl+Shift+O` - Open overlay
- `Esc` - Hide overlay
