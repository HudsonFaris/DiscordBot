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

// Simple real-time mixer - writes chunks from all users to one file
const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;
const FRAME_SIZE = 960;
const BYTES_PER_FRAME = FRAME_SIZE * CHANNELS * BYTES_PER_SAMPLE;

function mixBuffers(buffers) {
    if (buffers.length === 0) return Buffer.alloc(BYTES_PER_FRAME);
    if (buffers.length === 1) return buffers[0];

    const mixed = Buffer.alloc(BYTES_PER_FRAME);
    for (let i = 0; i < BYTES_PER_FRAME; i += 2) {
        let sample = 0;
        for (const buf of buffers) {
            if (i + 1 < buf.length) {
                sample += buf.readInt16LE(i);
            }
        }
        // Clamp to 16-bit range
        sample = Math.max(-32768, Math.min(32767, sample));
        mixed.writeInt16LE(sample, i);
    }
    return mixed;
}

export function startRecording(connection, guild) {
    receiver = connection.receiver;
    recordingDir = path.join(process.cwd(), 'recordings', Date.now().toString());

    if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
    }

    mixedFilePath = path.join(recordingDir, 'mixed.pcm');
    mixedFileStream = fs.createWriteStream(mixedFilePath);

    isRecording = true;
    console.log(' Recording started');

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

    const opusStream = receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.Manual,
        },
    });

    const decoder = new prism.opus.Decoder({
        rate: SAMPLE_RATE,
        channels: CHANNELS,
        frameSize: FRAME_SIZE
    });

    decoder.on('error', () => { });
    opusStream.on('error', () => { });

    // Write each user's audio directly to the mixed file
    decoder.on('data', (chunk) => {
        if (isRecording && mixedFileStream) {
            mixedFileStream.write(chunk);
        }
    });

    opusStream.pipe(decoder);

    userStreams.set(userId, { opusStream, decoder, username });
}

export async function stopRecording(connection) {
    console.log(' Stopping recording...');
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
            resolve();
        }));
    }

    await Promise.all(closePromises);

    // Close mixed file stream
    await new Promise((resolve) => {
        if (mixedFileStream) {
            mixedFileStream.end(resolve);
        } else {
            resolve();
        }
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    userStreams.clear();

    if (!fs.existsSync(mixedFilePath)) return [];

    const stats = fs.statSync(mixedFilePath);
    console.log(`📁 mixed.pcm: ${stats.size} bytes`);

    if (stats.size === 0) {
        fs.unlinkSync(mixedFilePath);
        return [];
    }

    const mp3Path = mixedFilePath.replace('.pcm', '.mp3');

    try {
        execSync(
            `ffmpeg -f s16le -ar ${SAMPLE_RATE} -ac ${CHANNELS} -i "${mixedFilePath}" -b:a 128k "${mp3Path}" -y`,
            { stdio: 'pipe' }
        );
        console.log(`🎵 Converted to MP3`);
    } catch (err) {
        console.error('Failed to convert to MP3:', err.message);
        return [];
    }

    try {
        console.log(' Uploading to Cloudinary...');
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
                console.log('🗑️ Deleted recording from Cloudinary');
            } catch (err) {
                console.error('Failed to delete recording:', err.message);
            }
        }, 24 * 60 * 60 * 1000);

        console.log(` Uploaded: ${uploadResult.secure_url}`);

        return [{
            username: 'mixed',
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