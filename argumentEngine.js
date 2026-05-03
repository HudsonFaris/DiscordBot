import axios from 'axios';
import FormData from 'form-data';
import { EndBehaviorType } from '@discordjs/voice';

export async function startArgumentEngine(connection) {
    const receiver = connection.receiver;

    connection.on('stateChange', (oldState, newState) => {
        console.log(`📡 Connection state: ${oldState.status} -> ${newState.status}`);
    });

    console.log("👂 Engine is live. Waiting for someone to speak...");

    const activeStreams = new Set();

    receiver.speaking.on('start', (userId) => {
        if (activeStreams.has(userId)) return;
        activeStreams.add(userId);

        console.log(`🎤 Detected voice activity from user: ${userId}`);

        const audioStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1000,
            },
        });

        const chunks = [];
        audioStream.on('data', (chunk) => {
            if (chunks.length === 0) console.log("⏳ Receiving audio chunks...");
            chunks.push(chunk);
        });

        audioStream.on('end', async () => {
            activeStreams.delete(userId);
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
                console.log("🚀 Sending audio to Python Sidecar...");
                const response = await axios.post('http://127.0.0.1:8000/process_audio', form, {
                    headers: form.getHeaders(),
                    timeout: 30000
                });

                if (response.data.text) {
                    console.log(`\n--- ARGUMENT LOG ---`);
                    console.log(`User: "${response.data.text}"`);
                    console.log(`AI: "${response.data.response}"`);
                    console.log(`--------------------\n`);
                }
            } catch (error) {
                console.error("❌ API Error:", error.code === 'ECONNREFUSED' 
                    ? "Python Sidecar is NOT running!" 
                    : error.message);
            }
        });
    });
}