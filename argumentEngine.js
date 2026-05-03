import axios from 'axios';
import FormData from 'form-data';
import { EndBehaviorType, createAudioResource, createAudioPlayer, AudioPlayerStatus } from '@discordjs/voice';
import prism from 'prism-media';
import fs from 'fs';
import path from 'path';

export async function startArgumentEngine(connection) {
    const receiver = connection.receiver;
    const player = createAudioPlayer();
    connection.subscribe(player);

    connection.on('stateChange', (oldState, newState) => {
        console.log(`📡 Connection state: ${oldState.status} -> ${newState.status}`);
    });

    console.log("👂 Engine is live. Waiting for someone to speak...");

    const activeStreams = new Set();
    let isSpeaking = false;
    let isProcessing = false;

    receiver.speaking.on('start', (userId) => {
        console.log(`🔔 Speaking start - isSpeaking:${isSpeaking} isProcessing:${isProcessing} activeStreams:${activeStreams.size}`);
    if (activeStreams.has(userId) || isSpeaking || isProcessing) return;
        if (activeStreams.has(userId) || isSpeaking || isProcessing) return;
        activeStreams.add(userId);

        console.log(`🎤 Detected voice activity from user: ${userId}`);

        const opusStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1000,
            },
        });

        const decoder = new prism.opus.Decoder({
            rate: 48000,
            channels: 2,
            frameSize: 960
        });

        decoder.on('error', () => {
            activeStreams.delete(userId);
        });

        opusStream.on('error', () => {
            activeStreams.delete(userId);
        });

        const pcmStream = opusStream.pipe(decoder);

        const chunks = [];
        pcmStream.on('data', (chunk) => {
            if (chunks.length === 0) console.log("⏳ Receiving audio chunks...");
            chunks.push(chunk);
        });

        pcmStream.on('end', async () => {
            activeStreams.delete(userId);
            console.log(`✅ Audio stream ended. Captured ${chunks.length} chunks.`);
            
            if (chunks.length < 10) {
                console.log("⚠️ Audio too short, skipping...");
                return;
            }

            if (isProcessing) {
                console.log("⏭️ Already processing, skipping...");
                return;
            }

            isProcessing = true;

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
                    timeout: 60000
                });

                if (response.data.text) {
                    console.log(`\n--- ARGUMENT LOG ---`);
                    console.log(`User: "${response.data.text}"`);
                    console.log(`AI: "${response.data.response}"`);
                    console.log(`--------------------\n`);

                    const audioResponse = await axios.get('http://127.0.0.1:8000/get_audio', {
                        responseType: 'arraybuffer'
                    });
                    
                    const audioPath = path.join(process.cwd(), 'response.wav');
                    fs.writeFileSync(audioPath, Buffer.from(audioResponse.data));
                    
                    isSpeaking = true;
                    const resource = createAudioResource(audioPath);
                    player.play(resource);

                    const timeout = setTimeout(() => {
                        console.log('🔊 Response timeout - resetting');
                        isSpeaking = false;
                        isProcessing = false;
                    }, 15000);

                    player.once(AudioPlayerStatus.Idle, () => {
                        clearTimeout(timeout);
                        console.log('🔊 Finished speaking response');
                        isSpeaking = false;
                        isProcessing = false;
                    });
                } else {
                    isProcessing = false;
                }
            } catch (error) {
                console.error("❌ API Error:", error.code === 'ECONNREFUSED' 
                    ? "Python Sidecar is NOT running!" 
                    : error.message);
                isProcessing = false;
            }
        });
    });
}