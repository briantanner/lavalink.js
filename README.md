# lavalink.js

A [Lavalink](https://github.com/Frederikam/Lavalink) client for [discord.js](https://github.com/hydrabolt/discord.js) ported from [eris-lavalink](https://github.com/briantanner/eris-lavalink)

## Links
- **[API Documentation](https://briantanner.github.io/lavalink.js/index.html)**
- **[Lavalink](https://github.com/Frederikam/Lavalink)**


## Install
```
npm install lavalink.js
```

## Implementation

Start by creating the `PlayerManager` and passing a list of nodes and optional list of regions
```js
const { PlayerManager } = require('lavalink.js');

let nodes = [
	{ host: 'localhost', port: 8080, region: 'eu', password: 'youshallnotpass' }
];

let regions = {
	eu: ['eu', 'amsterdam', 'frankfurt', 'russia', 'hongkong', 'singapore', 'sydney'],
	us: ['us', 'brazil'],
};


const voiceConnections = new PlayerManager(client, nodes, {
	numShards: shardCount, // number of shards
	userId: userid, // the user id of the bot
	regions: regions,
	defaultRegion: 'eu',
});
```

To resolve a track, use the Lavalink rest api
```js
const superagent = require('superagent');

async function resolveTracks(node, search) {
	try {
		var result = await superagent.get(`http://${node.host}:2333/loadtracks?identifier=${search}`)
			.set('Authorization', node.password)
			.set('Accept', 'application/json');
	} catch (err) {
		throw err;
	}

	if (!result) {
		throw 'Unable play that video.';
	}

	return result.body; // array of tracks resolved from lavalink
}

resolveTracks(node, 'ytsearch:the 30 second video').then(tracks => {
	if (!tracks) {
		// no tracks to play
	}
	// do something with the tracks
})
```

To join and leave voice channels, use the Lavalink client rather than using eris.
```js
// to get or join a channel
function getPlayer(channel) {
	if (!channel || !channel.guild) {
		return Promise.reject('Not a guild channel.');
	}

	let player = voiceConnections.get(channel.guild.id);
	if (player) {
		return Promise.resolve(player);
	}

	let options = {};
	if (channel.guild.region) {
		options.region = channel.guild.region;
	}

	return voiceConnections.join(channel.guild.id, channel.id, options);
}

// play example
getPlayer(channel).then(player => {
	player.play(track); // track is the base64 track we get from Lavalink

	player.on('disconnect', (err) => {
		if (err) {
			// log error
		}
		// do something
	});

	player.on('error', err => {
		// log error and handle it
	});

	player.on('stuck', msg => {
		// track stuck event
	})

	player.once('end', data => {
		// REPLACED reason is emitted when playing without stopping, I ignore these to prevent skip loops
		if (data.reason && data.reason === 'REPLACED') {
			return;
		}

		// start playing the next song
	});
});

// stop example
getPlayer(channel).then(player => {
	player.stop();
	if (leave) {
		// disconnect and leave the channel
		player.leave();
	}
})
```