// voiceReceiver.js
const { EndBehaviorType } = require('@discordjs/voice');
const prism = require('prism-media');

function listenToUser(connection, userId) {
    const receiver = connection.receiver;

    //voice strewam
    const opusStream = receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 100, //stop listening after 100ms of silence
        },
    });

    //Convert Opus to PCM
    const pcmStream = opusStream.pipe(new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 }));

    return pcmStream;
}

module.exports = { listenToUser };