import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import fs from 'fs';
import path from 'path';

const recordings = new Map();

export function startRecording(connection, guild) {
    const receiver = connection.receiver;
    const recordingDir = path.join(process.cwd(), 'recordings');
    
    if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir);
    }

    console.log('Recording started');

    receiver.speaking.on('start', (userId) => {
        if (recordings.has(userId)) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(recordingDir, `${userId}_${timestamp}.pcm`);
        
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

        decoder.on('error', (err) => {
            console.error('Decoder error:', err.message);
        });

        const fileStream = fs.createWriteStream(filePath);
        const pcmStream = opusStream.pipe(decoder);
        pcmStream.pipe(fileStream);

        recordings.set(userId, { filePath, fileStream, pcmStream });
        console.log(`Recording user ${userId}`);

        pcmStream.on('end', () => {
            recordings.delete(userId);
            console.log(`Saved segment for ${userId}`);
        });
    });
}

export async function stopRecording(connection, channel) {
    console.log('Stopping recording...');
    
    // Close all active streams
    for (const [userId, data] of recordings.entries()) {
        data.fileStream.end();
        recordings.delete(userId);
    }

    // Find all PCM files
    const recordingDir = path.join(process.cwd(), 'recordings');
    if (!fs.existsSync(recordingDir)) {
        await channel.send('No audio was recorded.');
        return;
    }

    const files = fs.readdirSync(recordingDir).filter(f => f.endsWith('.pcm'));

    if (files.length === 0) {
        await channel.send('No audio was recorded.');
        return;
    }

    // Convert each PCM to WAV and send
    for (const file of files) {
        const pcmPath = path.join(recordingDir, file);
        const wavPath = pcmPath.replace('.pcm', '.wav');
        
        // Write WAV header
        const pcmData = fs.readFileSync(pcmPath);
        const wavBuffer = pcmToWav(pcmData, 48000, 2, 16);
        fs.writeFileSync(wavPath, wavBuffer);

        const userId = file.split('_')[0];
        
        try {
            await channel.send({
                content: `Recording for <@${userId}>`,
                files: [{ attachment: wavPath, name: `recording_${userId}.wav` }]
            });
            console.log(`Sent recording for ${userId}`);
        } catch (err) {
            console.error(`Failed to send recording for ${userId}:`, err.message);
        }

        // Cleanup files
        if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    }
}

function pcmToWav(pcmData, sampleRate, channels, bitDepth) {
    const byteRate = sampleRate * channels * bitDepth / 8;
    const blockAlign = channels * bitDepth / 8;
    const dataSize = pcmData.length;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitDepth, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    pcmData.copy(buffer, 44);

    return buffer;
}