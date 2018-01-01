const { Client } = require("discord.js");
const { get } = require("snekfetch");
const config = require("./config.json");
const { PlayerManager } = require("../src/index");
const client = new Client();

const nodes = [
    { host: "localhost", port: 80, region: "asia", password: "youshallnotpass" }
];

client.on("ready", () => {
    console.log(`LavaLink testing bot is ready!!!!!!`);
    client.player = new PlayerManager(client, nodes, {
        numShards: 1,
        userId: client.user.id,
        defaultRegion: "us"
    });
});

const prefix = ".";
client.on("message", async msg => {
    if (!msg.guild) return;
    if (!msg.content.startsWith(prefix)) return;
    const args = msg.content.slice(prefix.length).trim().split(/ +/g);
    const cmd = args.shift().toLowerCase();
    if (cmd === "play") {
        if (!msg.member.voiceChannel) return msg.channel.send("You need to be in a voice channel");
        const [song] = await getSongs(`ytsearch:${args.join(" ")}`);
        if (!song) return;
        client.player.join(msg.guild.id, msg.member.voiceChannel.id).then(async player => {
            await msg.channel.send(JSON.stringify(song.info), { code: "json" });
            await player.play(song.track, { region: msg.guild.region });

            player.on("end", async () => {
                await msg.channel.send("Song has ended... leaving voice channel");
                await player.disconnect();
            });
        }).catch(console.log);
    }

    if (cmd === "eval" && msg.author.id === "272689325521502208") {
        const evaled = await eval(args.join(" "));
        return msg.channel.send(require("util").inspect(evaled, { showHidden: true }), { code: "js", split: true });
    }
 
});


client.login(config.token);

process.on("unhandledRejection", error => console.log(`unhandledRejection:\n${error.stack}`))
    .on("uncaughtException", error => {
        console.log(`uncaughtException:\n${error.stack}`);
        process.exit();
    })
    .on("error", error => console.log(`Error:\n${error.stack}`))
    .on("warn", error => console.log(`Warning:\n${error.stack}`));

async function getSongs(search) {
    const { body } = await get(`http://localhost:2333/loadtracks?identifier=${search}`)
        .set("Authorization", "youshallnotpass")
        .set("Accept", "application/json");
    if (!body) return `No tracks found`;
    return body;
}
