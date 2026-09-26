import { Client, GatewayIntentBits, Events } from 'discord.js';
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

client.once(Events.ClientReady, (readyClient) => {
  console.log(` Gateway connected! ${readyClient.user.tag} is now online.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

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
          await interaction.editReply('Failed to join the voice channel.');
        }
      }
    }

    if (subcommand === 'stop') {
      const connection = getVoiceConnection(interaction.guild.id);

      if (!connection) {
        return interaction.editReply('Not currently recording.');
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
      const results = await stopRecording(connection);

      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }

      if (!results || results.length === 0) {
        await interaction.editReply('Stopped. No audio recorded.');
        return;
      }

      try {
        const links = results.map(f =>
          `🎙️ **${f.username}**: ${f.url}`
        ).join('\n');

        await finalChannel.send({
          content: `Recording complete! Links expire in 24 hours:\n${links}`,
        });
        await interaction.editReply('Goodbye.');
      } catch (err) {
        console.error('Failed to send links:', err.message);
        await interaction.editReply('Stopped but failed to send links.');
      } finally {
        cleanupFiles(results);
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);