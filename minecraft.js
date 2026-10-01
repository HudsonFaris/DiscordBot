import mc from 'minecraft-protocol';

export function setupMinecraftStatus(client) {
    const MINECRAFT_CHANNEL_ID = process.env.MINECRAFT_CHANNEL_ID;

    if (!MINECRAFT_CHANNEL_ID) {
        console.warn('⚠️ MINECRAFT_CHANNEL_ID not found in .env. Status updater disabled.');
        return;
    }

    console.log('🎮 Minecraft status updater initialized (10-minute interval).');

    // Run every 10 minutes (600,000 ms)
    setInterval(async () => {
        mc.ping({ host: 'localhost', port: 25565 }, async (err, res) => {
            try {
                const channel = await client.channels.fetch(MINECRAFT_CHANNEL_ID);
                if (!channel) return;
                let nameText = '';
                let topicText = '';

                if (err) {
                    nameText = 'Minecraft';
                    topicText = `🔴 Offline | Server unreachable `;
                } else {
                    nameText = `Minecraft`;
                    topicText = `🟩 ${res.players.online}/${res.players.max} player(s) online `;
                }

                // 1. Update the sidebar channel name (Requires 'Manage Channels' permission)
                if (channel.name !== nameText) {
                    await channel.setName(nameText);
                }

                // 2. Update the header subtitle topic (Matches your screenshot style)
                if (channel.topic !== topicText) {
                    await channel.setTopic(topicText);
                }

                console.log(`Updated Minecraft status at ${timeString}`);
            } catch (error) {
                console.error('Minecraft status update error:', error.message);
            }
        });
    }, 60000);
}