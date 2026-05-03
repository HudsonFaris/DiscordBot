import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { joinVoiceChannel, VoiceConnectionStatus, entersState } from '@discordjs/voice';

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ] 
});

client.once(Events.ClientReady, () => {
  console.log('Ready!');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'argue') return;

  const member = interaction.guild.members.cache.get(interaction.user.id);
  const channel = member?.voice?.channel;
  
  if (!channel) return interaction.reply('Join a VC!');

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  connection.on('debug', (msg) => {
  console.log('🔍 DEBUG:', msg);
});

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log('✅ CONNECTED AND READY!');
    await interaction.reply('Connected!');
  } catch (err) {
    console.error('❌ Failed to connect:', err);
    connection.destroy();
    await interaction.reply('Failed!');
  }
});

client.login(process.env.DISCORD_TOKEN);