# Sparkles AI Backend

Real-time AI interview assistant backend powered by Gemini.

## Deployment

### Environment Variables (Required)
Set these in your Render dashboard:
- `GEMINI_API_KEY` - Your Google AI API key
- `PORT` - Automatically set by Render

### Deploy to Render
1. Push to GitHub
2. Connect repo to Render
3. Set environment variables
4. Deploy!

## API Endpoints

- `GET /` - Health check
- `POST /api/chat` - Send question, get AI response

## Local Development
```bash
npm install
npm start
```
