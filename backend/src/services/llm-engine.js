const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI = null;
let model = null;

function getModel() {
    if (!model) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Using gemini-2.0-flash for fastest responses
        model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                maxOutputTokens: 1024,  // Limit response length for speed
                temperature: 0.7
            }
        });
    }
    return model;
}

// Optimized system prompt - shorter = faster
const SYSTEM_PROMPT = `You are an expert interview assistant. Be concise and accurate.
- Give direct answers
- Code must be correct and runnable
- Keep explanations brief
- No filler text`;

// Fast intent detection using simple keyword matching (no API call)
function classifyIntentFast(query) {
    const q = query.toLowerCase();

    if (q.includes('code') || q.includes('implement') || q.includes('write') ||
        q.includes('function') || q.includes('program') || q.includes('algorithm')) {
        return 'Coding';
    }
    if (q.includes('error') || q.includes('bug') || q.includes('fix') ||
        q.includes('not working') || q.includes('wrong')) {
        return 'Debug';
    }
    if (q.includes('tell me about') || q.includes('why should') ||
        q.includes('describe a time') || q.includes('strength') || q.includes('weakness')) {
        return 'Behavioral';
    }
    return 'Theory';
}

// Optimized prompts for speed
const INTENT_PROMPTS = {
    Coding: `Provide working code. Include brief approach and complexity.`,
    Theory: `Explain concisely with a simple example.`,
    Debug: `Identify the bug and provide the fix.`,
    Behavioral: `Give a structured, professional answer.`
};

async function generateSolution(query, intent, mode = "full") {
    const intentPrompt = INTENT_PROMPTS[intent] || INTENT_PROMPTS.Theory;

    let prompt;
    if (mode === "hint") {
        prompt = `${SYSTEM_PROMPT}\n\nGive 2-3 hints only, no full solution.\n\nQuestion: ${query}`;
    } else {
        prompt = `${SYSTEM_PROMPT}\n\n${intentPrompt}\n\nQuestion: ${query}`;
    }

    // Add timeout for faster perceived response
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Response timeout')), 15000)
    );

    const generatePromise = getModel().generateContent(prompt);

    try {
        const result = await Promise.race([generatePromise, timeoutPromise]);
        const response = await result.response;
        return response.text();
    } catch (error) {
        if (error.message === 'Response timeout') {
            throw new Error('AI took too long. Try a simpler question.');
        }
        throw error;
    }
}

// Legacy function for backward compatibility
async function classifyIntent(query) {
    return classifyIntentFast(query);
}

module.exports = {
    classifyIntent,
    classifyIntentFast,
    generateSolution
};
