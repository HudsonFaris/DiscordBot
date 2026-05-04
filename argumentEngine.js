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
    const audioQueue = [];
    let isPlayingQueue = false;

    async function playQueue() {
        if (isPlayingQueue || audioQueue.length === 0) return;
        isPlayingQueue = true;
        isSpeaking = true;

        while (audioQueue.length > 0) {
            const audioPath = audioQueue.shift();
            if (!fs.existsSync(audioPath)) continue;

            await new Promise((resolve) => {
                const resource = createAudioResource(audioPath);
                player.play(resource);

                const timeout = setTimeout(() => resolve(), 15000);

                player.once(AudioPlayerStatus.Idle, () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        }

        console.log('🔊 Finished speaking all chunks');
        isSpeaking = false;
        isProcessing = false;
        isPlayingQueue = false;
    }

    receiver.speaking.on('start', (userId) => {
        // Safety: auto-reset if stuck
        if (isProcessing && !isPlayingQueue && audioQueue.length === 0) {
            console.log('🔄 Auto-resetting stuck state');
            isProcessing = false;
            isSpeaking = false;
        }

        console.log(`🔔 Speaking start - isSpeaking:${isSpeaking} isProcessing:${isProcessing}`);
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

        decoder.on('error', () => activeStreams.delete(userId));
        opusStream.on('error', () => activeStreams.delete(userId));

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
            audioQueue.length = 0;

            const buffer = Buffer.concat(chunks);
            const form = new FormData();
            form.append('file', buffer, {
                filename: 'voice.raw',
                contentType: 'application/octet-stream',
            });

            try {
                console.log("🚀 Streaming from Python Sidecar...");
                
                const response = await axios.post('http://127.0.0.1:8000/process_stream', form, {
                    headers: form.getHeaders(),
                    responseType: 'stream',
                    timeout: 120000
                });

                let headerParsed = false;
                let bufferData = '';

                response.data.on('data', (chunk) => {
                    bufferData += chunk.toString();
                    const lines = bufferData.split('\n');
                    bufferData = lines.pop();

                    for (const line of lines) {
                        if (!headerParsed && line.includes('---AUDIO---')) {
                            headerParsed = true;
                            try {
                                const jsonPart = line.split('---AUDIO---')[0];
                                const parsed = JSON.parse(jsonPart);
                                console.log(`\n--- ARGUMENT LOG ---`);
                                console.log(`User: "${parsed.text}"`);
                                console.log(`AI: "${parsed.response}"`);
                                console.log(`--------------------\n`);
                            } catch(e) {}
                        } else if (line.startsWith('CHUNK:')) {
                            const chunkPath = line.replace('CHUNK:', '').trim();
                            console.log(`🎵 Queuing chunk: ${chunkPath}`);
                            audioQueue.push(chunkPath);
                            playQueue();
                        }
                    }
                });

                response.data.on('end', () => {
                    console.log('📡 Stream ended');
                    setTimeout(() => {
                        if (!isPlayingQueue) {
                            isProcessing = false;
                            isSpeaking = false;
                        }
                    }, 500);
                });

                response.data.on('error', (err) => {
                    console.error('Stream error:', err.message);
                    isProcessing = false;
                    isSpeaking = false;
                });

            } catch (error) {
                console.error("❌ API Error:", error.message);
                isProcessing = false;
                isSpeaking = false;
            }
        });
    });
}