import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import dotenv from 'dotenv';
import { startRecording, stopRecording } from './recorder.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', () => {
  console.log(`Gateway connected! ${client.user.tag} is now online.`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'record') {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand(false);

    if (!subcommand) {
      return interaction.editReply('Please specify a subcommand: /record start or /record stop.');
    }

    const voiceChannel = interaction.member.voice.channel;

    if (subcommand === 'start') {
      if (!voiceChannel) {
        return interaction.editReply('You must be in a voice channel to start recording.');
      }

      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: false,
        });

        startRecording(connection, interaction.guild);
        await interaction.editReply(`Started recording in ${voiceChannel.name}.`);
      } catch (err) {
        console.error('Error starting recording:', err);
        await interaction.editReply('Failed to join the voice channel and start recording.');
      }
    }

    if (subcommand === 'stop') {
      const connection = getVoiceConnection(interaction.guild.id);

      if (!connection) {
        return interaction.editReply('Not currently recording in any voice channel.');
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

      await stopRecording(connection, finalChannel);

      connection.destroy();
      await interaction.editReply(`Stopped recording. Files sent to <#${finalChannel.id}>.`);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);