import mc from 'minecraft-protocol';

export function setupMinecraftStatus(client) {
    const MINECRAFT_CHANNEL_ID = process.env.MINECRAFT_CHANNEL_ID;

    if (!MINECRAFT_CHANNEL_ID) {
        console.warn('⚠️ MINECRAFT_CHANNEL_ID not found in .env. Status updater disabled.');
        return;
    }

    console.log('🎮 Minecraft status updater initialized.');

    // Run every 60 seconds
    setInterval(async () => {
        mc.ping({ host: 'localhost', port: 25565 }, async (err, res) => {
            try {
                const channel = await client.channels.fetch(MINECRAFT_CHANNEL_ID);
                if (!channel) return;

                let statusText = '';
                if (err) {
                    statusText = '🔴・offline';
                } else {
                    statusText = `🟢・${res.players.online}-${res.players.max}`;
                }

                // Only update if the name changed to minimize Discord API overhead
                if (channel.name !== statusText) {
                    await channel.setName(statusText);
                }
            } catch (error) {
                // Ignore standard Discord rate limit (status 429) errors gracefully
                if (error.status !== 429) {
                    console.error('Minecraft status update error:', error.message);
                }
            }
        });
    }, 60000);
}