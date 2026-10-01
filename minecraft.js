import mc from 'minecraft-protocol';

export function setupMinecraftStatus(client) {
    const MINECRAFT_CHANNEL_ID = process.env.MINECRAFT_CHANNEL_ID;

    if (!MINECRAFT_CHANNEL_ID) {
        console.warn('⚠️ MINECRAFT_CHANNEL_ID not found in .env. Status updater disabled.');
        return;
    }

    console.log('🎮 Minecraft status updater initialized (1-minute interval).');

    // Function to perform the status update
    async function updateStatus() {
        console.log('pinging minecraft server...'); // <-- Debug log to verify timer is ticking

        mc.ping({ host: 'localhost', port: 25565, timeout: 3000 }, async (err, res) => {
            try {
                const channel = await client.channels.fetch(MINECRAFT_CHANNEL_ID);
                if (!channel) {
                    console.error('❌ Minecraft channel not found!');
                    return;
                }

                // 1. Ensure the channel name itself is always "minecraft"
                if (channel.name !== 'minecraft') {
                    await channel.setName('minecraft');
                    console.log('Renamed channel back to "minecraft".');
                }

                // 2. Format the topic header
                let topicText = '';
                if (err) {
                    topicText = '🔴 Offline | Server unreachable';
                    console.log('Minecraft server ping failed:', err.message);
                } else {
                    topicText = `🟩 ${res.players.online}/${res.players.max} player(s) online`;
                    console.log(`Minecraft ping successful: ${res.players.online}/${res.players.max} players`);
                }

                // Update the channel topic if it changed
                if (channel.topic !== topicText) {
                    await channel.setTopic(topicText);
                    console.log('Updated Minecraft channel topic.');
                }
            } catch (error) {
                console.error('Minecraft status update error:', error.message);
            }
        });
    }

    // Run once immediately on startup
    updateStatus();

    // Then run every 1 minute (60,000 ms)
    setInterval(updateStatus, 60000);
}