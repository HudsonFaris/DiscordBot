import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import dotenv from 'dotenv';
import { startRecording, stopRecording, cleanupFiles } from './recorder.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('clientReady', () => {
  console.log(`Gateway connected! ${client.user.tag} is now online.`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // IMMEDIATELY defer to acknowledge Discord within the 3-second limit
  try {
    await interaction.deferReply();
  } catch (err) {
    console.error('Interaction expired or already handled:', err.message);
    return;
  }

  if (interaction.commandName === 'record') {
    const subcommand = interaction.options.getSubcommand(false);

    if (!subcommand) {
      return interaction.editReply('Please specify a subcommand: /record start or /record stop.');
    }

    const voiceChannel = interaction.member?.voice?.channel;

    if (subcommand === 'start') {
      if (!voiceChannel) {
        return interaction.editReply('You must be in a voice channel to start recording.');
      }

      let connection;
      try {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false,
        });

        connection.on('stateChange', (oldState, newState) => {
          console.log(`Voice connection: ${oldState.status} -> ${newState.status}`);
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 15000);
        startRecording(connection, interaction.guild);
        await interaction.editReply(`Hello... ${voiceChannel.name}.`);
      } catch (err) {
        console.error('Error joining voice channel:', err);
        connection?.destroy();
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply('Failed to join the voice channel. Check the bot permissions and its network access to Discord voice.');
        }
      }
    }

    if (subcommand === 'stop') {
      const connection = getVoiceConnection(interaction.guild.id);

      if (!connection) {
        return interaction.editReply('Not currently.');
      }

      const targetChannelId = process.env.RECORDINGS_CHANNEL_ID?.trim();
      let targetChannel = null;

      if (targetChannelId) {
        try {
          targetChannel = client.channels.cache.get(targetChannelId)
            || await client.channels.fetch(targetChannelId);
        } catch (err) {
          console.error(`Failed to fetch channel ID ${targetChannelId}:`, err.message);
        }
      }

      const finalChannel = targetChannel || interaction.channel;
      const filesToSend = await stopRecording(connection);

      connection.destroy();

      if (!filesToSend || filesToSend.length === 0) {
        await interaction.editReply('Stopped.');
        return;
      }

      try {
        await finalChannel.send({
          content: 'Stopped recording. Here are the files:',
          files: filesToSend.map(f => ({ attachment: f.wavPath, name: f.name }))
        });
        await interaction.editReply('Goodbye.');
      } catch (err) {
        console.error('Failed to send files:', err.message);
        await interaction.editReply('Stopped x2.');
      } finally {
        cleanupFiles(filesToSend);
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);