/**
 * Speech Router Service
 * Provides reliable transcription using Hugging Face Whisper.
 */
const axios = require('axios');
const fs = require('fs');

const HF_API_URL = 'https://api-inference.huggingface.co/models/openai/whisper-large-v3';

/**
 * Transcribe audio using Hugging Face Whisper API
 * @param {Buffer} audioBuffer - Audio data buffer (WAV, MP3, WebM, etc.)
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeWithHuggingFace(audioBuffer) {
    const apiKey = process.env.HUGGING_FACE_API_KEY;

    if (!apiKey) {
        throw new Error('HUGGING_FACE_API_KEY not set in environment');
    }

    try {
        const response = await axios.post(HF_API_URL, audioBuffer, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'audio/webm' // Browser MediaRecorder typically outputs WebM
            },
            timeout: 30000 // 30 second timeout
        });

        if (response.data && response.data.text) {
            return response.data.text.trim();
        }

        throw new Error('No transcription returned from Whisper');
    } catch (error) {
        if (error.response) {
            console.error('HF API Error:', error.response.status, error.response.data);
            throw new Error(`Whisper API error: ${error.response.data?.error || error.message}`);
        }
        throw error;
    }
}

/**
 * Main transcription function with fallback logic
 * @param {Buffer} audioBuffer - Audio data
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(audioBuffer) {
    console.log('Speech Router: Transcribing audio buffer of size:', audioBuffer.length);

    if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('Empty audio buffer provided');
    }

    // Use Hugging Face Whisper (primary for now since it's easier to set up)
    try {
        const transcript = await transcribeWithHuggingFace(audioBuffer);
        console.log('Speech Router: Transcription successful:', transcript.substring(0, 50) + '...');
        return transcript;
    } catch (error) {
        console.error('Speech Router: Transcription failed:', error.message);
        throw error;
    }
}

module.exports = {
    transcribeAudio
};
