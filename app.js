import { Client, GatewayIntentBits, Events, ActivityType, EmbedBuilder } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import dotenv from 'dotenv';
import axios from 'axios';
import { startRecording, stopRecording, cleanupFiles } from './recorder.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

const SQUAD_DATABASE = {
  "BlueDragon12336": { player_id: 891692513, user_id: 1000091551547, platform: "xboxone", display: "BlueDragon" },
  "Waterishshark67": { player_id: 1845585091, user_id: 1004812473201, platform: "xboxone", display: "WaterishShark" },
  "nujraq": { player_id: 1885125573, user_id: 1005806777237, platform: "pc", display: "nujraq" },
  "dustycorgi289": { player_id: 1840425312, user_id: 1004788837066, platform: "xboxone", display: "Dusty" },
  "S0NIFY": { player_id: 1005102117028, user_id: 1010076717028, platform: "pc", display: "S0NIFY" },
  "KFC IS CHICKEN": { player_id: 1833329689, user_id: 1004676048444, platform: "pc", display: "KFC (Cheater)" },
  "jjlewie3": { player_id: 1007470702122, user_id: 1015921902122, platform: "pc", display: "John" },
  "foggytugboat207": { player_id: 1879706570, user_id: 1005698177818, platform: "pc", display: "FoggyTugboat" },
};

async function getStatsData(squadNames) {
  const url = `https://api.gametools.network/bf6/multiple/`;
  const requestBody = squadNames.map(name => {
    const info = SQUAD_DATABASE[name];
    if (!info) return null;
    return { name, player_id: info.player_id, user_id: info.user_id, platform: info.platform, skip_battlelog: true };
  }).filter(item => item !== null);

  try {
    const response = await axios.post(url, requestBody);
    let squadData = response.data.data || response.data;
    if (!Array.isArray(squadData)) squadData = [squadData];
    squadData.sort((a, b) => (b.killDeath || 0) - (a.killDeath || 0));
    return squadData;
  } catch (error) {
    console.error("API Error:", error.message);
    return [];
  }
}

async function sendSquadLeaderboard(channelId, squadNames) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return console.error("No channel exists");

    const squadData = await getStatsData(squadNames);
    if (squadData.length === 0) return;

    const leaderboardEmbed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle('🏆 Squad Leaderboard')
      .setDescription('Battlefield 6 Live Stats')
      .setTimestamp()
      .setFooter({ text: 'Stats provided by yours truly.' });

    squadData.forEach((p, i) => {
      const matchedEntry = Object.entries(SQUAD_DATABASE).find(([dbKey, info]) => {
        return info.player_id == p.id || info.user_id == p.userId;
      });

      const dbInfo = matchedEntry ? matchedEntry[1] : null;
      const displayName = dbInfo?.display || (p.userName || "Unknown Soldier");

      const kd = p.killDeath ? p.killDeath.toFixed(2) : "0.00";
      const kills = p.kills || 0;
      const assists = p.killAssists || 0;
      const revives = p.revives || 0;
      const accuracy = p.accuracy || "0.0%";

      let level = p.rank || p.level;
      if (!level && p.XP && p.XP[0]) {
        const totalXP = p.XP[0].total;
        level = totalXP < 650000 ? Math.floor(totalXP / 13000) : 50 + Math.floor((totalXP - 650000) / 25000);
      }
      const castLevel = Math.floor((Number(level || 1) / 3) + 4);

      const topClass = p.classes?.sort((a, b) => b.kills - a.kills)[0]?.className || "N/A";
      const topVehicle = p.vehicles?.sort((a, b) => b.kills - a.kills)[0]?.vehicleName || "None";
      const topGun = p.weapons?.sort((a, b) => b.kills - a.kills)[0]?.weaponName || "None";

      leaderboardEmbed.addFields({
        name: `${i + 1}. ${displayName} (Level ${castLevel})`,
        value: `**COMBAT**\nK/D: \`${kd}\` | Kills: \`${kills.toLocaleString()}\` | Acc: \`${accuracy}\` \n` +
          `**PLAYSTYLE**\nClass: \`${topClass}\` | Vehicle: \`${topVehicle}\` | Preferred Gun: \`${topGun}\` \n` +
          `**TEAMWORK**\nAssists: \`${assists.toLocaleString()}\` | Revives: \`${revives.toLocaleString()}\``,
        inline: false
      });
    });

    await channel.send({ embeds: [leaderboardEmbed] });
    console.log("Leaderboard sent!");
  } catch (error) {
    console.error("Embed Error:", error);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(` Gateway connected! ${readyClient.user.tag} is now online.`);

  readyClient.user.setPresence({
    activities: [{
      name: 'Fairhaven Middle School',
      type: ActivityType.Playing,
      state: 'Milking'
    }],
    status: 'dnd',
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply();
  } catch (err) {
    console.error('Interaction expired or already handled:', err.message);
    return;
  }

  if (interaction.commandName === 'leaderboard') {
    const CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID;
    const PLAYERS = Object.keys(SQUAD_DATABASE);
    await sendSquadLeaderboard(CHANNEL_ID, PLAYERS);
    await interaction.editReply('Leaderboard sent!');
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
          `🎙️ Recording: ${f.url}`
        ).join('\n');

        await finalChannel.send({
          content: `Recording complete! Link expires in 24 hours:\n${links}`,
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