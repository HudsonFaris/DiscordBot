import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji, DiscordRequest } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';
import { Client, GatewayIntentBits } from 'discord.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction id, type and data
  const { id, type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" command
    if (name === 'test') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `hello world ${getRandomEmoji()}`
            }
          ]
        },
      });
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});



/*
    //Const for online member test
    import { Client, GatewayIntentBits } from 'discord.js';

    // Initialize the Gateway client
    const client = new Client({ 
      intents: [GatewayIntentBits.Guilds] 
    });

    // This is what triggers the "Green Dot"
    client.once('ready', () => {
      console.log(`✅ Gateway connected! ${client.user.tag} is now online.`);
    });

    // Use the token from your .env / Railway variables
    client.login(process.env.DISCORD_TOKEN);

    */


//Local Testing functionality

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds] 
});

client.once('clientReady', () => {
  console.log(`Bot is online locally as ${client.user.tag}`);
  console.log(`Ready to test BF6 stats logic!`);
});

client.login(process.env.DISCORD_TOKEN);


//Database for accounts being fetched
const SQUAD_DATABASE = {
  "BlueDragon12336": { 
    player_id: 891692513,
    user_id:   1000091551547,
    platform: "xboxone" 
  },
  "Waterishshark67": { 
    player_id: 1845585091,
    user_id:   1004812473201,
    platform: "xboxone" 
  }
};
  


async function getStatsData(squadNames) {
  const url = `https://api.gametools.network/bf6/multiple/`;

  //Mapping over names for object not strings wanted
  const requestBody = squadNames.map(name => {
    const info = SQUAD_DATABASE[name];
    if (!info) {
    console.warn(`⚠️ Warning: ${name} was not found in SQUAD_DATABASE. Skipping...`);
    return null; 
  }
    return {
      name: name,
      player_id: info.player_id,
      user_id: info.user_id,
      platform: info.platform,
      skip_battlelog: true
    };
  }).filter(item => item !== null); //Remove the empty "null" entries

  try {
    const response = await axios.post(url, requestBody);
    
    //Using the path we discovered: response.data.data
    let squadData = response.data.data || response.data;
    if (!Array.isArray(squadData)) squadData = [squadData];

    squadData.sort((a, b) => (b.killDeath || 0) - (a.killDeath || 0));
    return squadData;
      
  } catch (error) {
    console.error("API Error:", error.message);
    return []; //Return empty array on failure
  }
}

//API Request from Bf6 subAPIWebApp
getStatsData(["BlueDragon12336", "Waterishshark67"]);

//Uncomment functionCall TOO
//Function to find specific ID's, change as needed for everyone else. 
async function findMyIds() {
  const name = "Bluedragon12336";
  const platform = "xboxone";
  const url = `https://api.gametools.network/bf6/stats/?name=${name}&platform=${platform}`;

  try {
    const response = await axios.get(url);
    const data = response.data;

    console.log(`\nFound IDs for ${data.userName}:`);
    console.log(`---------------------------------`);
    console.log(`player_id: ${data.id}`);
    console.log(`user_id:   ${data.userId}`);
    console.log(`---------------------------------\n`);
  } catch (e) {
    console.error("Could not find IDs. Make sure the name is exactly as it appears in-game.");
  }
}

//findMyIds();



//Message Leaderboard (Channel Specific)

async function sendSquadLeaderboard(channelId, squadNames) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return console.error("No channel exists");

    const squadData = await getStatsData(squadNames);
    if (squadData.length === 0) return;

    //Create the Embed object
    const leaderboardEmbed = new EmbedBuilder()
      .setColor(0x2f3136) //Color cade
      .setTitle('🏆 Squad Leaderboard')
      .setDescription('Battlefield 6 Live Stats') //Future add date here (TODO)
      .setTimestamp()
      .setFooter({ text: 'Stats provided by yours truly.' });

    //Add each player as a field in the embed
    squadData.forEach((p, i) => {
      const name = squadNames[i] || "Soldier";
      const kd = p.killDeath ? p.killDeath.toFixed(2) : "0.00";
      const kills = p.kills || 0;

      leaderboardEmbed.addFields({ 
        name: `${i + 1}. ${name}`, 
        value: `**K/D:** \`${kd}\` | **Kills:** \`${kills.toLocaleString()}\``,
        inline: false 
      });
    });

    //Send the embed
    await channel.send({ embeds: [leaderboardEmbed] });
    console.log("Embed sent to Discord!");

  } catch (error) {
    console.error("Embed Error:", error);
  }
}


//Calling message
client.once('clientReady', () => { //Checks if client still ready
  const CHANNEL_ID = "1469191917643366547"; 
  const PLAYERS = ["BlueDragon12336", "Waterishshark67"];

  sendSquadLeaderboard(CHANNEL_ID, PLAYERS);
});
