import { EndBehaviorType, VoiceConnectionStatus } from '@discordjs/voice';
import prism from 'prism-media';
import fs from 'fs';
import path from 'path';

const userStreams = new Map();
let recordingDir = '';
let isRecording = false;
let receiver = null;
let speakingListener = null;

export function startRecording(connection, guild) {
    receiver = connection.receiver;
    recordingDir = path.join(process.cwd(), 'recordings', Date.now().toString());

    if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
    }

    isRecording = true;
    console.log(' Recording started');

    // Subscribe to all members already in the channel
    const voiceChannel = guild.channels.cache.find(c =>
        c.isVoiceBased?.() && c.members?.has(guild.members.me?.id)
    );

    if (voiceChannel) {
        voiceChannel.members.forEach(member => {
            if (!member.user.bot) {
                subscribeUser(member.id, member.user.username);
            }
        });
    }

    // Subscribe when new people start speaking
    speakingListener = (userId) => {
        if (!isRecording) return;
        if (userStreams.has(userId)) return;

        const member = guild.members.cache.get(userId);
        const username = member?.user?.username || userId;
        subscribeUser(userId, username);
    };

    receiver.speaking.on('start', speakingListener);
}

function subscribeUser(userId, username) {
    if (userStreams.has(userId)) return;

    console.log(`🎙️ Subscribing to ${username} (${userId})`);

    const filePath = path.join(recordingDir, `${username}_${userId}.pcm`);

    const opusStream = receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.Manual,
        },
    });

    const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960
    });

    decoder.on('error', () => { });
    opusStream.on('error', () => { });

    const fileStream = fs.createWriteStream(filePath, { flags: 'a' });
    opusStream.pipe(decoder).pipe(fileStream);

    userStreams.set(userId, { filePath, fileStream, opusStream, decoder, username });
}

export async function stopRecording(connection) {
    console.log(' Stopping recording...');
    isRecording = false;

    if (speakingListener && receiver) {
        receiver.speaking.off('start', speakingListener);
        speakingListener = null;
    }

    // Close all streams
    const closePromises = [];
    for (const [userId, data] of userStreams.entries()) {
        closePromises.push(new Promise((resolve) => {
            data.opusStream.destroy();
            data.decoder.destroy();
            data.fileStream.end(() => {
                console.log(`✅ Closed stream for ${data.username}`);
                resolve();
            });
        }));
    }

    await Promise.all(closePromises);
    await new Promise(resolve => setTimeout(resolve, 500));
    userStreams.clear();

    // Convert PCM files to WAV
    if (!fs.existsSync(recordingDir)) return [];

    const files = fs.readdirSync(recordingDir).filter(f => f.endsWith('.pcm'));
    if (files.length === 0) return [];

    const filesToSend = [];

    for (const file of files) {
        const pcmPath = path.join(recordingDir, file);
        const wavPath = pcmPath.replace('.pcm', '.wav');

        const pcmData = fs.readFileSync(pcmPath);
        if (pcmData.length === 0) {
            fs.unlinkSync(pcmPath);
            continue;
        }

        const wavBuffer = pcmToWav(pcmData, 48000, 2, 16);
        fs.writeFileSync(wavPath, wavBuffer);

        const parts = file.replace('.pcm', '').split('_');
        const username = parts[0];

        filesToSend.push({
            wavPath,
            pcmPath,
            name: `${username}_recording.wav`,
        });
    }

    return filesToSend;
}

export function cleanupFiles(filesToSend) {
    for (const file of filesToSend) {
        if (fs.existsSync(file.pcmPath)) fs.unlinkSync(file.pcmPath);
        if (fs.existsSync(file.wavPath)) fs.unlinkSync(file.wavPath);
    }

    // Clean up recording directory
    if (fs.existsSync(recordingDir)) {
        try { fs.rmdirSync(recordingDir); } catch (e) { }
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