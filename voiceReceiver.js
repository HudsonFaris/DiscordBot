// voiceReceiver.js
import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';

export function listenToUser(connection, userId) {
    const receiver = connection.receiver;

    const opusStream = receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 500, // 100ms is too short, you'll get cut off. 500ms is better.
        },
    });

    // Convert Opus to PCM
    const pcmStream = opusStream.pipe(new prism.opus.Decoder({ 
        rate: 48000, 
        channels: 2, 
        frameSize: 960 
    }));

    return pcmStream;
}