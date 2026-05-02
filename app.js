import 'dotenv/config';
import axios from 'axios';
import { EmbedBuilder, Client, GatewayIntentBits, Events } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { startArgumentEngine } from './argumentEngine.js';

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, 
    GatewayIntentBits.GuildMessages,    
    GatewayIntentBits.MessageContent    
  ] 
});

// --- SQUAD DATABASE ---
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

// --- STATS LOGIC ---
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
    console.log("Embed sent to Discord!");
  } catch (error) {
    console.error("Embed Error:", error);
  }
}

// --- HELPER: VOICE JOIN ---
async function handleVoiceJoin(guildId, userId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) return false;

    console.log(`--- Attempting Connection to ${voiceChannel.name} ---`);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.on('stateChange', (oldState, newState) => {
      console.log(`📡 [STATE] ${oldState.status} -> ${newState.status}`);
    });

    startArgumentEngine(connection);
    return true;
  } catch (err) {
    console.error("💥 [CRITICAL FAILURE]:", err);
    return false;
  }
}

// --- GATEWAY EVENTS ---
client.once(Events.ClientReady, (readyClient) => {
  console.log(`✅ Gateway connected! ${readyClient.user.tag} is now online.`);

  const CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID;
  const PLAYERS = Object.keys(SQUAD_DATABASE);

  if (CHANNEL_ID == "67") {
    sendSquadLeaderboard(CHANNEL_ID, PLAYERS);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'argue') {
    await interaction.deferReply();
    const joined = await handleVoiceJoin(interaction.guildId, interaction.user.id);
    if (!joined) {
      return interaction.editReply({ content: "Join a VC first!" });
    }
    await interaction.editReply("In.");
  }

  if (interaction.commandName === 'stop') {
    const connection = getVoiceConnection(interaction.guildId);
    if (!connection) {
      return interaction.reply({ content: "I'm not even in a voice channel, chill.", ephemeral: true });
    }
    connection.destroy();
    console.log("🛑 Voice connection destroyed.");
    await interaction.reply("Out.");
  }
});

client.login(process.env.DISCORD_TOKEN);


