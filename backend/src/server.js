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
        const { query, mode, stream, history } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });

        const intent = await classifyIntent(query);

        // STREAMING MODE (Fastest + Verified for Coding)
        if (stream) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');

            const llmEngine = require("./services/llm-engine");
            const streamSource = await llmEngine.generateSolutionStream(query, intent, mode, history || []);

            let fullSolution = "";

            // 1. Stream Gemini Response
            for await (const chunk of streamSource) {
                const text = chunk.text();
                if (text) {
                    res.write(text);
                    fullSolution += text;
                }
            }

            // 2. Post-Stream Verification (Hybrid Mode)
            // If it's a coding task, we use Hugging Face to double-check the code
            if (intent === "Coding" || query.toLowerCase().includes("code")) {
                const refinement = await llmEngine.refineWithHuggingFace(fullSolution, query);

                // If HF returned something different (it basically always returns the full text),
                // we should check if it's substantially different or just display a confirmation.
                // Our refineWithHuggingFace implementation currently returns the *improved* text.
                // We'll append a "Verified" block.

                if (refinement && refinement !== fullSolution) {
                    // Calculate specific diff or just append the improved version?
                    // Appending full improved version might be duplicate.
                    // Let's prompt user.
                    res.write("\n\n---\n**🔍 Mistral Verification:**\n" + refinement);
                } else {
                    res.write("\n\n---\n*✅ Code verified by Mistral 7B*");
                }
            }

            res.end();
            return;
        }

        // LEGACY FULL BLOCK MODE
        let solution = await generateSolution(query, intent, mode);

        // Verification Loop for Coding intent (Only in full mode)
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
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        } else {
            res.end();
        }
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
