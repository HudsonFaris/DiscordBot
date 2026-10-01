import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
  {
    name: 'record',
    description: 'Manage audio recording in voice channels',
    options: [
      {
        name: 'start',
        description: 'Hey there....',
        type: 1,
      },
      {
        name: 'stop',
        description: 'Goodbye....',
        type: 1,
      },
    ],
  },
  {
    name: 'leaderboard',
    description: 'Shows the Battlefield 6 squad leaderboard',
    type: 1,
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();