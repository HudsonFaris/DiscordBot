import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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
    console.log('🔴 Recording started');

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

    decoder.on('error', (err) => {
        console.error(`Decoder error for user ${username}:`, err.message);
    });

    opusStream.on('error', () => {});

    const fileStream = fs.createWriteStream(filePath, { flags: 'a' });
    opusStream.pipe(decoder).pipe(fileStream);

    userStreams.set(userId, { filePath, fileStream, opusStream, decoder, username });
}

export async function stopRecording(connection) {
    console.log('⏹️ Stopping recording...');
    isRecording = false;

    if (speakingListener && receiver) {
        receiver.speaking.off('start', speakingListener);
        speakingListener = null;
    }

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

    if (!fs.existsSync(recordingDir)) return [];

    const files = fs.readdirSync(recordingDir).filter(f => f.endsWith('.pcm'));
    if (files.length === 0) return [];

    const filesToSend = [];

    for (const file of files) {
        const pcmPath = path.join(recordingDir, file);
        const mp3Path = pcmPath.replace('.pcm', '.mp3');

        const stats = fs.statSync(pcmPath);
        console.log(`📁 ${file}: ${stats.size} bytes`);

        if (stats.size === 0) {
            fs.unlinkSync(pcmPath);
            continue;
        }

        try {
            execSync(
                `ffmpeg -f s16le -ar 48000 -ac 2 -i "${pcmPath}" -b:a 128k "${mp3Path}" -y`,
                { stdio: 'pipe' }
            );
            console.log(`🎵 Converted ${file} to MP3`);
        } catch (err) {
            console.error(`Failed to convert ${file}:`, err.message);
            continue;
        }

        const parts = file.replace('.pcm', '').split('_');
        const username = parts[0];

        filesToSend.push({
            mp3Path,
            pcmPath,
            name: `${username}_recording.mp3`,
        });
    }

    return filesToSend;
}

export function cleanupFiles(filesToSend) {
    for (const file of filesToSend) {
        if (fs.existsSync(file.pcmPath)) fs.unlinkSync(file.pcmPath);
        if (fs.existsSync(file.mp3Path)) fs.unlinkSync(file.mp3Path);
    }

    if (fs.existsSync(recordingDir)) {
        try { fs.rmdirSync(recordingDir); } catch(e) {}
    }
}