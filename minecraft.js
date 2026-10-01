import mc from 'minecraft-protocol';

export function setupMinecraftStatus(client) {
    const MINECRAFT_CHANNEL_ID = process.env.MINECRAFT_CHANNEL_ID;

    if (!MINECRAFT_CHANNEL_ID) {
        return;
    }

    async function updateStatus() {
        try {
            mc.ping({ host: 'localhost', port: 25565, timeout: 4000 }, async (err, res) => {
                try {
                    const channel = await client.channels.fetch(MINECRAFT_CHANNEL_ID);
                    if (!channel) {
                        return;
                    }

                    let topicText = '';

                    if (err) {
                        topicText = '🔴 Offline | Server unreachable';
                    } else {
                        topicText = `🟩 ${res.players.online}/${res.players.max} player(s) online`;

                        if (channel.name !== 'minecraft') {
                            await channel.setName('minecraft');
                        }
                    }

                    if (channel.topic !== topicText) {
                        await channel.setTopic(topicText);
                    }
                } catch (innerErr) {
                }
            });
        } catch (outerErr) {
        }
    }

    updateStatus();
    // 10 min timer
    setInterval(updateStatus, 600000);
}