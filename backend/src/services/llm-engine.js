const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios'); // Added axios for Hugging Face

let genAI = null;
let model = null;

// Hugging Face Config
const HF_API_URL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3';

function getModel() {
    if (!model) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                maxOutputTokens: 1024,
                temperature: 0.7
            }
        });
    }
    return model;
}

const SYSTEM_PROMPT = `You are "Prateek-AI", a Senior Technical Interview Mentor.
Your goal is to help candidates pass top-tier interviews (FAANG level).

### 🧠 Persona & Behavior
- **Tone:** Confident, encouraging, expert, and human-like.
- **Context:** You MUST remember previous messages. Resolve pronouns like "it", "this", "that" based on conversation history immediately.
- **Zero-Loss:** Never ask the user to repeat themselves.

### 📝 Output Structure (Strict Markdown)
You must structure your technical answers exactly as follows:

**Summary:**
<Direct, senior-level summary (1-2 lines)>

**Explanation:**
<Deep, conceptual explanation. Use analogies if helpful.>

**Complexity:**
<Time & Space Complexity (Required for Coding)>

**Code:**
<Production-grade, optimized code (Required for Coding)>

**Notes:**
<Edge cases, interview tips, or follow-up questions>

Rules:
- If intent is 'Coding', 'Code' and 'Complexity' are MANDATORY.
- Keep 'Summary' concise but insightful.
- Use explicit Markdown headers (**Header**) for the sections.`;

function classifyIntentFast(query) {
    const q = query.toLowerCase();
    if (q.includes('code') || q.includes('implement') || q.includes('write') ||
        q.includes('function') || q.includes('program') || q.includes('algorithm')) return 'Coding';
    if (q.includes('error') || q.includes('bug') || q.includes('fix') ||
        q.includes('not working') || q.includes('wrong')) return 'Debug';
    if (q.includes('tell me about') || q.includes('why should') ||
        q.includes('describe a time') || q.includes('strength') || q.includes('weakness')) return 'Behavioral';
    return 'Theory';
}

const INTENT_PROMPTS = {
    Coding: `Provide an optimized solution (O(n) or better if possible). Focus on clean, production-ready code.`,
    Theory: `Explain like a Senior Engineer mentoring a Junior. Focus on "Why" and trade-offs.`,
    Debug: `Identify the root cause clearly. Explain the fix.`,
    Behavioral: `Structure using STAR (Situation, Task, Action, Result). Make it impactful.`
};

// Refine solution using Hugging Face (Optional/Secondary check)
async function refineWithHuggingFace(initialSolution, query) {
    const apiKey = process.env.HUGGING_FACE_API_KEY;
    if (!apiKey) return initialSolution; // Skip if no key

    console.log('LLM Engine: Refining with Hugging Face...');

    // Prompt for refinement
    const prompt = `[INST] Review the following answer to the user's question. 
    If it is correct, return it as is. 
    If it has errors or can be improved (especially code correctness or language specific requests), provide the improved version.
    Do NOT add conversational filler.
    
    User Question: ${query}
    
    Initial Answer:
    ${initialSolution}
    [/INST]`;

    try {
        const response = await axios.post(HF_API_URL, {
            inputs: prompt,
            parameters: {
                max_new_tokens: 1024,
                temperature: 0.2, // Low temp for correctness
                return_full_text: false
            }
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            timeout: 8000 // 8s timeout to not delay too much
        });

        if (response.data && response.data[0] && response.data[0].generated_text) {
            console.log('LLM Engine: Refinement successful');
            return response.data[0].generated_text.trim();
        }
    } catch (error) {
        console.error('LLM Engine: HF Refinement failed (falling back to Gemini):', error.message);
    }

    return initialSolution;
}

async function generateSolution(query, intent, mode = "full") {
    const intentPrompt = INTENT_PROMPTS[intent] || INTENT_PROMPTS.Theory;

    let prompt;
    if (mode === "hint") {
        prompt = `${SYSTEM_PROMPT}\n\nGive 2-3 hints only, no full solution.\n\nQuestion: ${query}`;
    } else {
        prompt = `${SYSTEM_PROMPT}\n\n${intentPrompt}\n\nQuestion: ${query}`;
    }

    // 15s timeout for Gemini
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Response timeout')), 15000)
    );

    const generatePromise = getModel().generateContent(prompt);

    try {
        const result = await Promise.race([generatePromise, timeoutPromise]);
        const response = await result.response;
        let solution = response.text();

        // Apply HF Refinement ONLY for Coding tasks (to ensure correctness/language compliance)
        // because user specifically asked for "perfect answers" and "any language"
        if (intent === 'Coding' || intent === 'Debug') {
            // We run this in parallel? 
            // No, must be sequential: Gemini -> HF.
            // But we respect the timeout?
            // Let's execute it, but if it takes too long, we skip?
            // The refined function handles errors and timeouts.
            solution = await refineWithHuggingFace(solution, query);
        }

        return solution;
    } catch (error) {
        if (error.message === 'Response timeout') {
            throw new Error('AI took too long. Try a simpler question.');
        }
        throw error;
    }
}

// Stream solution with CONVERSATION HISTORY (Context-Aware)
async function generateSolutionStream(query, intent, mode = "full", history = []) {
    const intentPrompt = INTENT_PROMPTS[intent] || INTENT_PROMPTS.Theory;

    // Transform simple history [{role: 'user', text: '...'}] to Gemini format
    // Gemini roles: 'user' or 'model'
    const formattedHistory = history.map(msg => ({
        role: msg.role === 'AI' ? 'model' : 'user',
        parts: [{ text: msg.text }]
    }));

    // In chat mode, we use the system prompt as the first instruction or setup
    // But startChat doesn't take systemInstruction directly in standard API yet (or depends on version).
    // Using gemini-1.5-pro or 2.0-flash, we can pass systemInstruction to getGenerativeModel.
    // Our getModel() already sets model params. 
    // We'll prepend the system prompt to the history or strictly set it.

    // For simplicity and compatibility, we'll instantiate a chat session.
    // We can prepend the system prompt as the first "user" message logic if needed, 
    // but newer models support systemInstruction in config. 

    // Let's rely on getModel() which initializes the model. 
    // Note: getModel() in this file doesn't set systemInstruction in getGenerativeModel config currently.
    // We'll update getModel to include systemInstruction if possible or just prepend it.

    const chat = getModel().startChat({
        history: formattedHistory,
        generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7
        },
        systemInstruction: {
            role: "system",
            parts: [{ text: SYSTEM_PROMPT }]
        }
    });

    let msg = mode === "hint"
        ? `(Give hints only) ${query}`
        : `${intentPrompt}\n\n${query}`;

    try {
        const streamResult = await chat.sendMessageStream(msg);
        return streamResult.stream;
    } catch (error) {
        throw error;
    }
}

async function classifyIntent(query) {
    return classifyIntentFast(query);
}

module.exports = {
    classifyIntent,
    classifyIntentFast,
    generateSolution,
    generateSolutionStream,
    refineWithHuggingFace
};
