const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const ffmpeg = require('ffmpeg-static');
require("dotenv").config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const queue = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args.shift().toLowerCase();

    const serverQueue = queue.get(message.guild.id);

    if (command === '!play') {
        execute(message, serverQueue, args.join(' '));
    } else if (command === '!skip') {
        skip(message, serverQueue);
    } else if (command === '!pause') {
        pause(message, serverQueue);
    } else if (command === '!resume') {
        resume(message, serverQueue);
    } else if (command === '!queue') {
        displayQueue(message, serverQueue);
    }
});

async function execute(message, serverQueue, searchString) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        return message.channel.send('You need to be in a voice channel to play music!');
    }

    // Search for the video on YouTube
    const videoResult = await ytSearch(searchString);
    const video = videoResult.videos.length > 0 ? videoResult.videos[0] : null;

    if (!video) {
        return message.channel.send('No video found with the provided title.');
    }

    const song = {
        title: video.title,
        url: video.url
    };

    if (!serverQueue) {
        const queueContruct = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            player: null,
            songs: [],
            playing: true
        };

        queue.set(message.guild.id, queueContruct);
        queueContruct.songs.push(song);

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
            queueContruct.connection = connection;

            play(message.guild, queueContruct.songs[0]);
        } catch (err) {
            console.error(err);
            queue.delete(message.guild.id);
            return message.channel.send(err.message);
        }
    } else {
        serverQueue.songs.push(song);
        return message.channel.send(`${song.title} has been added to the queue!`);
    }
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const stream = ytdl(song.url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 });
    const resource = createAudioResource(stream, {
        inputType: require('@discordjs/voice').StreamType.Arbitrary,
        inlineVolume: true,
        ffmpegArguments: ['-i', ffmpeg],
    });
    const player = createAudioPlayer();

    serverQueue.connection.subscribe(player);
    player.play(resource);

    player.on(AudioPlayerStatus.Idle, () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
    });

    serverQueue.player = player;
    serverQueue.textChannel.send(`Now playing: **${song.title}**`);
}

function skip(message, serverQueue) {
    if (!message.member.voice.channel) {
        return message.channel.send('You have to be in a voice channel to skip the music!');
    }
    if (!serverQueue) {
        return message.channel.send('There is no song that I could skip!');
    }
    serverQueue.player.stop();
}

function pause(message, serverQueue) {
    if (!message.member.voice.channel) {
        return message.channel.send('You have to be in a voice channel to pause the music!');
    }
    if (!serverQueue) {
        return message.channel.send('There is no song that I could pause!');
    }
    serverQueue.player.pause();
    message.channel.send('Music paused!');
}

function resume(message, serverQueue) {
    if (!message.member.voice.channel) {
        return message.channel.send('You have to be in a voice channel to resume the music!');
    }
    if (!serverQueue) {
        return message.channel.send('There is no song that I could resume!');
    }
    serverQueue.player.unpause();
    message.channel.send('Music resumed!');
}

function displayQueue(message, serverQueue) {
    if (!serverQueue) {
        return message.channel.send('There is no queue!');
    }
    const queueString = serverQueue.songs.map((song, index) => `${index + 1}. ${song.title}`).join('\n');
    message.channel.send(`Current queue:\n${queueString}`);
}

client.login(process.env.TOKEN);
