import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const userStreams = new Map();
let recordingDir = '';
let isRecording = false;
let receiver = null;
let speakingListener = null;
let mixedFileStream = null;
let mixedFilePath = '';

export function startRecording(connection, guild) {
    receiver = connection.receiver;
    recordingDir = path.join(process.cwd(), 'recordings', Date.now().toString());

    if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
    }

    mixedFilePath = path.join(recordingDir, 'recording.pcm');
    mixedFileStream = fs.createWriteStream(mixedFilePath);

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
    console.log(`🎙️ Now capturing ${username}`);

    const opusStream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.Manual },
    });

    const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960
    });

    decoder.on('error', () => { });
    opusStream.on('error', () => { });

    // Just dump everything into the one file
    decoder.on('data', (chunk) => {
        if (isRecording && mixedFileStream && !mixedFileStream.destroyed) {
            mixedFileStream.write(chunk);
        }
    });

    opusStream.pipe(decoder);
    userStreams.set(userId, { opusStream, decoder, username });
}

export async function stopRecording(connection) {
    console.log('⏹️ Stopping recording...');
    isRecording = false;

    if (speakingListener && receiver) {
        receiver.speaking.off('start', speakingListener);
        speakingListener = null;
    }

    for (const [userId, data] of userStreams.entries()) {
        try { data.opusStream.destroy(); } catch (e) { }
        try { data.decoder.destroy(); } catch (e) { }
    }
    userStreams.clear();

    await new Promise((resolve) => {
        if (mixedFileStream && !mixedFileStream.destroyed) {
            mixedFileStream.end(resolve);
        } else {
            resolve();
        }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    if (!fs.existsSync(mixedFilePath)) return [];

    const stats = fs.statSync(mixedFilePath);
    console.log(`📁 recording.pcm: ${stats.size} bytes`);

    if (stats.size === 0) {
        fs.unlinkSync(mixedFilePath);
        return [];
    }

    const mp3Path = mixedFilePath.replace('.pcm', '.mp3');

    try {
        execSync(
            `ffmpeg -f s16le -ar 48000 -ac 2 -i "${mixedFilePath}" -b:a 128k "${mp3Path}" -y`,
            { stdio: 'pipe' }
        );
        console.log('🎵 Converted to MP3');
    } catch (err) {
        console.error('Failed to convert:', err.message);
        return [];
    }

    try {
        console.log('☁️ Uploading to Cloudinary...');
        const uploadResult = await cloudinary.uploader.upload(mp3Path, {
            resource_type: 'video',
            folder: 'discord_recordings',
            public_id: `recording_${Date.now()}`,
            invalidate: true,
        });

        setTimeout(async () => {
            try {
                await cloudinary.uploader.destroy(uploadResult.public_id, {
                    resource_type: 'video'
                });
                console.log('🗑️ Deleted from Cloudinary');
            } catch (e) { }
        }, 24 * 60 * 60 * 1000);

        console.log(`✅ Uploaded: ${uploadResult.secure_url}`);

        return [{
            url: uploadResult.secure_url,
            pcmPath: mixedFilePath,
            mp3Path,
        }];

    } catch (err) {
        console.error('Failed to upload:', err.message);
        return [];
    }
}

export function cleanupFiles(results) {
    for (const file of results) {
        if (fs.existsSync(file.pcmPath)) fs.unlinkSync(file.pcmPath);
        if (fs.existsSync(file.mp3Path)) fs.unlinkSync(file.mp3Path);
    }
    if (fs.existsSync(recordingDir)) {
        try { fs.rmdirSync(recordingDir); } catch (e) { }
    }
}