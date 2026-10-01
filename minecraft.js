import mc from 'minecraft-protocol';

export function setupMinecraftStatus(client) {
    const MINECRAFT_CHANNEL_ID = process.env.MINECRAFT_CHANNEL_ID;

    if (!MINECRAFT_CHANNEL_ID) {
        console.warn(' MINECRAFT_CHANNEL_ID not found in .env. Status updater disabled.');
        return;
    }

    console.log(' Minecraft status updater initialized (10-minute interval).');

    // Run every 10 minutes (600,000 ms)
    setInterval(async () => {
        mc.ping({ host: 'localhost', port: 25565 }, async (err, res) => {
            try {
                const channel = await client.channels.fetch(MINECRAFT_CHANNEL_ID);
                if (!channel) return;

                let nameText = '';
                let topicText = '';

                if (err) {
                    nameText = '🔴-offline';
                    topicText = 'Server Status: 🔴 Offline | Unable to reach Minecraft server';
                } else {
                    nameText = `🟢-${res.players.online}-${res.players.max}`;
                    topicText = `🟩 ${res.players.online}/${res.players.max} player(s) online | Server is running smoothly`;
                }

                // Update channel name (requires 'Manage Channels' permission)
                if (channel.name !== nameText) {
                    await channel.setName(nameText);
                }

                // Update channel topic (the subtitle header next to it)
                if (channel.topic !== topicText) {
                    await channel.setTopic(topicText);
                }

                console.log('Updated Minecraft channel status header.');
            } catch (error) {
                console.error('Minecraft status update error:', error.message);
            }
        });
    }, 600000);
}