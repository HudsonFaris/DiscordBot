import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import fs from 'fs';
import path from 'path';

const activeStreams = new Map();

export function startRecording(connection, guild) {
    const receiver = connection.receiver;
    const recordingDir = path.join(process.cwd(), 'recordings');

    if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
    }

    console.log('Recording started - voice receiver active.');

    receiver.speaking.on('start', (userId) => {
        if (activeStreams.has(userId)) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(recordingDir, `${userId}_${timestamp}.pcm`);

        console.log(`User ${userId} started speaking, subscribing...`);

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
            console.error(`Decoder error for user ${userId}:`, err.message);
        });

        const fileStream = fs.createWriteStream(filePath, { flags: 'a' });
        opusStream.pipe(decoder).pipe(fileStream);

        activeStreams.set(userId, { filePath, fileStream, opusStream });

        opusStream.on('end', () => {
            console.log(`Finished audio segment for user ${userId}`);
            fileStream.end();
            activeStreams.delete(userId);
        });
    });
}

export async function stopRecording(connection) {
    console.log('Stopping recording...');

    for (const [userId, data] of activeStreams.entries()) {
        if (data.fileStream) data.fileStream.end();
        if (data.opusStream) data.opusStream.destroy();
        activeStreams.delete(userId);
    }

    // Give streams 500ms to flush buffers to disk
    await new Promise((resolve) => setTimeout(resolve, 500));

    const recordingDir = path.join(process.cwd(), 'recordings');
    if (!fs.existsSync(recordingDir)) return [];

    const files = fs.readdirSync(recordingDir).filter(f => f.endsWith('.pcm'));
    if (files.length === 0) return [];

    const filesToSend = [];

    for (const file of files) {
        const pcmPath = path.join(recordingDir, file);
        const wavPath = pcmPath.replace('.pcm', '.wav');

        const pcmData = fs.readFileSync(pcmPath);
        if (pcmData.length === 0) {
            if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);
            continue;
        }

        const wavBuffer = pcmToWav(pcmData, 48000, 2, 16);
        fs.writeFileSync(wavPath, wavBuffer);

        const userId = file.split('_')[0];

        filesToSend.push({
            attachment: wavPath,
            name: `recording_${userId}.wav`,
            pcmPath,
            wavPath,
            userId
        });
    }

    return filesToSend;
}

export function cleanupFiles(filesToSend) {
    for (const file of filesToSend) {
        if (fs.existsSync(file.pcmPath)) fs.unlinkSync(file.pcmPath);
        if (fs.existsSync(file.wavPath)) fs.unlinkSync(file.wavPath);
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