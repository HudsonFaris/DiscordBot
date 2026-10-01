import mc from 'minecraft-protocol';

export function setupMinecraftStatus(client) {
    const MINECRAFT_CHANNEL_ID = process.env.MINECRAFT_CHANNEL_ID;

    if (!MINECRAFT_CHANNEL_ID) {
        console.warn('⚠️ MINECRAFT_CHANNEL_ID not found in .env. Status updater disabled.');
        return;
    }

    console.log('🎮 Minecraft status updater initialized (10-minute interval).');

    // Function to perform the status update
    async function updateStatus() {
        mc.ping({ host: 'localhost', port: 25565 }, async (err, res) => {
            try {
                const channel = await client.channels.fetch(MINECRAFT_CHANNEL_ID);
                if (!channel) return;

                // 1. Ensure the channel name itself is always "minecraft"
                if (channel.name !== 'minecraft') {
                    await channel.setName('minecraft');
                }

                // 2. Format the topic header
                let topicText = '';
                if (err) {
                    topicText = '🔴 Offline | Server unreachable';
                } else {
                    topicText = `🟩 ${res.players.online}/${res.players.max} player(s) online`;
                }

                // Update the channel topic if it changed
                if (channel.topic !== topicText) {
                    await channel.setTopic(topicText);
                    console.log('Updated Minecraft channel topic.');
                }
            } catch (error) {
                // If it fails due to permissions on the name change, log it clearly
                console.error('Minecraft status update error:', error.message);
            }
        });
    }

    // Run once immediately on startup
    updateStatus();

    // Then run every 10 minutes (600,000 ms)
    setInterval(updateStatus, 600000);
}