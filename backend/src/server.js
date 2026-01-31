const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { classifyIntent, generateSolution } = require("./services/llm-engine");
const { verifyCode } = require("./services/verification-engine");
const { transcribeAudio } = require("./services/speech-router");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get("/", (req, res) => {
    res.json({
        status: "✨ Sparkles AI Backend is running!",
        endpoints: {
            chat: "POST /api/chat",
            stt: "POST /api/stt"
        }
    });
});

app.post("/api/chat", async (req, res) => {
    try {
        const { query, mode } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });

        const intent = await classifyIntent(query);
        let solution = await generateSolution(query, intent, mode);

        // Verification Loop for Coding intent
        if (intent === "Coding" && mode === "full") {
            const codeMatch = solution.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
            if (codeMatch) {
                const code = codeMatch[1];
                const verification = await verifyCode(code);
                if (!verification.success) {
                    console.log("Verification failed, regenerating...");
                    solution = await generateSolution(`The previous solution had an error: ${verification.error}. Please provide a corrected version.\n\nQuery: ${query}`, intent, mode);
                }
            }
        }

        res.json({
            intent,
            solution
        });
    } catch (error) {
        console.error("Error in /api/chat:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Speech-to-Text endpoint
app.post("/api/stt", express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '10mb' }), async (req, res) => {
    try {
        console.log("STT request received, body size:", req.body?.length || 0);

        if (!req.body || req.body.length === 0) {
            return res.status(400).json({ error: "No audio data provided" });
        }

        const transcript = await transcribeAudio(req.body);
        res.json({ transcript });
    } catch (error) {
        console.error("Error in /api/stt:", error);
        res.status(500).json({ error: error.message || "Transcription failed" });
    }
});

app.listen(PORT, () => {
    console.log(`Sparkles AI Backend running on http://localhost:${PORT}`);
});
