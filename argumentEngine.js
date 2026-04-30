import axios from 'axios';
import FormData from 'form-data';

export async function startArgumentEngine(connection) {
    const receiver = connection.receiver;

    console.log("👂 Engine is live. Waiting for someone to speak...");

    receiver.speaking.on('start', (userId) => {
        // LOG 1: Audio detection
        console.log(`🎤 Detected voice activity from user: ${userId}`);

        const audioStream = receiver.subscribe(userId, {
            mode: 'pcm',
        });

        const chunks = [];
        audioStream.on('data', (chunk) => {
            // LOG 2: Data flowing
            // Only log this once per "sentence" to avoid spam
            if (chunks.length === 0) console.log("⏳ Receiving audio chunks...");
            chunks.push(chunk);
        });

        audioStream.on('end', async () => {
            console.log(`✅ Audio stream ended. Captured ${chunks.length} chunks.`);
            
            if (chunks.length < 5) {
                console.log("⚠️ Audio too short, skipping...");
                return;
            }

            const buffer = Buffer.concat(chunks);

            const form = new FormData();
            form.append('file', buffer, {
                filename: 'voice.raw',
                contentType: 'application/octet-stream',
            });

            try {
                console.log("🚀 Sending audio to Python Sidecar (Port 8000)...");
                const response = await axios.post('http://127.0.0.1:8000/process_audio', form, {
                    headers: form.getHeaders(),
                    timeout: 10000 // 10 second timeout
                });

                if (response.data.text) {
                    console.log(`\n--- ARGUMENT LOG ---`);
                    console.log(`User: "${response.data.text}"`);
                    console.log(`AI: "${response.data.response}"`);
                    console.log(`--------------------\n`);
                }
            } catch (error) {
                console.error("❌ API Error:", error.code === 'ECONNREFUSED' 
                    ? "Python Sidecar is NOT running on port 8000!" 
                    : error.message);
            }
        });
    });
}