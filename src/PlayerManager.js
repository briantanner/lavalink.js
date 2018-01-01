/**
 * Created by NoobLance & Jacz on 01.01.2018.
 * DISCLAIMER: Direct port from eris-lavalink
 */
const Lavalink = require('./Lavalink');
const Player = require('./Player');

/**
 * Player Manager
 * @extends Map
 * @prop {Player} baseObject The player class used to create new players
 * @prop {Object} client The discord.js client
 * @prop {Object} defaultRegions The default region config
 * @prop {Object} regions The region config being used
 */
class PlayerManager extends Map {

  /**
   * PlayerManager constructor
   * @param {Client} client Discord.js client
   * @param {Map<string, Lavalink>} nodes The Lavalink nodes to connect to
   * @param {Object} [options] Setup options
   * @param {string} [options.defaultRegion] The default region
   * @param {Number} [options.failoverRate=250] Failover rate in ms
   * @param {Number} [options.failoverLimit=1] Number of connections to failover per rate limit
   * @param {Object} [options.player] Optional Player class to replace the default Player
   * @param {Number} [options.reconnectThreshold=2000] The amount of time to skip ahead in a song when reconnecting in ms
   * @param {Object} [options.regions] Region mapping object
   */
  constructor(client, nodes, options) {
    super();

    this.baseObject = options.player || Player;
    this.client = client;
    this.nodes = new Map();
    this.pendingGuilds = {};
    this.options = options || {};
    this.failoverQueue = [];
    this.failoverRate = options.failoverRate || 250;
    this.failoverLimit = options.failoverLimit || 1;

    this.defaultRegions = {
      asia: ['hongkong', 'singapore', 'sydney'],
      eu: ['eu', 'amsterdam', 'frankfurt', 'russia'],
      us: ['us', 'brazil']
    };

    this.regions = options.regions || this.defaultRegions;

    for (const node of nodes) {
      this.createNode(Object.assign({}, node, options));
    }

    this.onReadyListener = this.onReady.bind(this);
    this.client.on('ready', this.onReadyListener);
    this.client.on('raw', this.onRaw.bind(this));
  }

  /**
   * Create a Lavalink node
   * @param {Object} options Lavalink node options
   * @param {string} options.host The hostname to connect to
   * @param {string} options.port The port to connect with
   * @param {string} options.region The region of the node
   * @param {Number} options.numShards The number of shards the bot is running
   * @param {string} options.userId The user id of the bot
   * @param {string} options.password The password for the Lavalink node
   */
  createNode(options) {
    const node = new Lavalink({
      host: options.host,
      port: options.port,
      region: options.region,
      numShards: options.numShards,
      userId: options.userId,
      password: options.password
    });

    node.on('error', this.onError.bind(this, node));
    node.on('disconnect', this.onDisconnect.bind(this, node));
    node.on('message', this.onMessage.bind(this, node));

    this.nodes.set(options.host, node);
  }

  /**
   * Remove a Lavalink node
   * @param {string} host The hostname of the node
   */
  removeNode(host) {
    if (!host) return;
    const node = this.nodes.get(host);
    if (!node) return;
    node.destroy();
    this.nodes.delete(host);
    this.onDisconnect(node);
  }

  /**
   * Check the failover queue
   * @private
   */
  checkFailoverQueue() {
    if (this.failoverQueue.length) {
      const fns = this.failoverQueue.splice(0, this.failoverLimit);
      for (const fn of fns) {
        this.processQueue(fn);
      }
    }
  }

  /**
   * Queue a failover
   * @param {Function} fn The failover function to queue
   * @returns {void}
   * @private
   */
  queueFailover(fn) {
    if (this.failoverQueue.length) {
      this.failoverQueue.push(fn);
    } else {
      return this.processQueue(fn);
    }
  }

  /**
   * Process the failover queue
   * @param {Function} fn The failover function to call
   * @private
   */
  processQueue(fn) {
    fn();
    setTimeout(() => this.checkFailoverQueue(), this.failoverRate);
  }

  /**
   * Called when an error is received from a Lavalink node
   * @param {Lavalink} node The Lavalink node
   * @param {string|Error} err The error received
   * @private
   */
  onError(node, err) {
    this.client.emit('error', err);
  }

  /**
   * Called when a node disconnects
   * @param {Lavalink} node The Lavalink node
   * @param {*} msg The disconnect message if sent
   * @private
   */
  onDisconnect(node, msg) { // eslint-disable-line
    const players = [...this.values()].filter(player => player.node.host === node.host);
    for (const player of players) {
      this.queueFailover(this.switchNode.bind(this, player, true));
    }
  }

  /**
   * Called when the shard readies
   * @private
   */
  onReady() {
    for (const player of this.values()) {
      this.queueFailover(this.switchNode.bind(this, player));
    }
  }

  onRaw(packet) {
    switch (packet.t) {
    case 'VOICE_SERVER_UPDATE':
      packet.d.session_id = this.client.ws.connection.sessionID;
      this.voiceServerUpdate(packet.d).catch(() => null);
      break;
    case 'VOICE_STATE_UPDATE':
      if (packet.d.id && packet.d.id === this.client.user.id) {
        const player = this.get(packet.d.guild_id);
        if (player && player.channelId !== packet.d.channel_id) {
          player.switchChannel(packet.d.channel_id, true);
        }
      }
    }
  }

  /**
   * Switch the voice node of a player
   * @param {Player} player The Player instance
   * @param {boolean} leave Whether to leave the channel or not on our side
   */
  switchNode(player, leave) {
    const { guildId, channelId, track } = player;
    const position = (player.state.position || 0) + (this.options.reconnectThreshold || 2000);

    const listeners = player.listeners('end');
    const endListeners = [];

    if (listeners && listeners.length) {
      for (const listener of listeners) {
        endListeners.push(listener);
        player.removeListener('end', listener);
      }
    }

    player.once('end', () => {
      for (const listener of endListeners) {
        player.on('end', listener);
      }
    });

    this.delete(guildId);

    player.playing = false;

    if (leave) {
      player.updateVoiceState(null);
    } else {
      player.node.send({ op: 'disconnect', guildId: guildId });
    }

    process.nextTick(() => {
      this.join(guildId, channelId, null, player).then(player => { // eslint-disable-line
        player.play(track, { startTime: position });
        player.emit('reconnect');
        this.set(guildId, player);
      })
        .catch(err => {
          player.disconnect(err);
        });
    });
  }

  /**
   * Called when a message is received from the voice node
   * @param {Lavalink} node The Lavalink node
   * @param {Object} message The message received
   * @returns {*}
   * @private
   */
  onMessage(node, message) {
    if (!message.op) return;

    switch (message.op) {
    case 'validationReq': {
      const payload = {
        op: 'validationRes',
        guildId: message.guildId
      };

      let guildValid = false;
      let channelValid = false;

      if (message.guildId && message.guildId.length) {
        guildValid = this.client.guilds.has(message.guildId);
      } else {
        guildValid = true;
      }

      if (message.channelId && message.channelId.length) {
        const voiceChannel = this.client.channels.get(message.channelId);
        if (voiceChannel) {
          payload.channelId = voiceChannel.id;
          channelValid = true;
        }
      } else {
        channelValid = true;
      }

      payload.valid = guildValid && channelValid;

      return node.send(payload);
    }
    case 'isConnectedReq': {
      const payload = {
        op: 'isConnectedRes',
        shardId: parseInt(message.shardId),
        connected: false
      };

      if (this.client.status === 0) {
        payload.connected = true;
      }

      return node.send(payload);
    }
    case 'sendWS': {
      const payload = JSON.parse(message.message);

      this.client.ws.send(payload);

      if (payload.op === 4 && !payload.d.channel_id) {
        this.delete(payload.d.guild_id);
      }
    }
    case 'playerUpdate': {
      const player = this.get(message.guildId);
      if (!player) return;

      return player.stateUpdate(message.state);
    }
    case 'event': {
      const player = this.get(message.guildId);
      if (!player) return;

      switch (message.type) {
      case 'TrackEndEvent': return player.onTrackEnd(message);
      case 'TrackExceptionEvent': return player.onTrackException(message);
      case 'TrackStuckEvent': return player.onTrackStuck(message);
      default: return player.emit('warn', `Unexpected event type: ${message.type}`);
      }
    }
    }
  }

  /**
   * Join a voice channel
   * @param {string} guildId The guild ID
   * @param {string} channelId The channel ID
   * @param {Object} options Join options
   * @param {Player} [player] Optionally pass an existing player
   * @returns {Promise<Player>}
   */
  async join(guildId, channelId, options, player) {
    options = options || {};
    player = player || this.get(guildId);
    return new Promise(async (res, rej) => {
      if (player && player.channelId !== channelId) {
        player.switchChannel(channelId);
        return res(player);
      }

      const region = this.getRegionFromData(options.region || 'us');
      const node = await this.findIdealNode(region);

      if (!node) {
        return rej('No available voice nodes.');
      }

      this.pendingGuilds[guildId] = {
        channelId: channelId,
        options: options || {},
        player: player || null,
        node: node,
        res: res,
        rej: rej,
        timeout: setTimeout(() => {
          node.send({ op: 'disconnect', guildId: guildId });
          delete this.pendingGuilds[guildId];
          rej(new Error('Voice connection timeout'));
        }, 10000)
      };

      node.send({
        op: 'connect',
        guildId: guildId,
        channelId: channelId
      });
    });
  }

  /**
   * Leave a voice channel
   * @param {string} guildId The guild ID
   */
  async leave(guildId) {
    const player = this.get(guildId);
    if (!player) {
      return;
    }
    player.disconnect();
    this.delete(player);
  }

  /**
   * Find the ideal voice node based on load and region
   * @param {string} region Guild region
   * @returns {void}
   * @private
   */
  async findIdealNode(region) {
    let nodes = [...this.nodes.values()].filter(node => !node.draining && node.ws && node.connected);

    if (region) {
      const regionalNodes = nodes.filter(node => node.region === region);
      if (regionalNodes && regionalNodes.length) {
        nodes = regionalNodes;
      }
    }

    nodes = nodes.sort((a, b) => {
      const aload = a.stats.cpu ? (a.stats.cpu.systemLoad / a.stats.cpu.cores) * 100 : 0,
        bload = b.stats.cpu ? (b.stats.cpu.systemLoad / b.stats.cpu.cores) * 100 : 0;
      return aload - bload;
    });
    return nodes[0];
  }

  /**
  * Called by eris when a voice server update is received
  * @param {Object} data The voice server update from eris
  * @private
  */
  async voiceServerUpdate(data) {
    if (this.pendingGuilds[data.guild_id] && this.pendingGuilds[data.guild_id].timeout) {
      clearTimeout(this.pendingGuilds[data.guild_id].timeout);
      this.pendingGuilds[data.guild_id].timeout = null;
    }

    let player = this.get(data.guild_id);
    if (!player) {
      if (!this.pendingGuilds[data.guild_id]) {
        return;
      }

      player = this.pendingGuilds[data.guild_id].player;

      if (player) {
        player.sessionId = data.sessionId;
        player.hostname = this.pendingGuilds[data.guild_id].hostname;
        player.node = this.pendingGuilds[data.guild_id].node;
        player.event = data;
        this.set(data.guild_id, player);
      }

      player = player || new this.baseObject(data.guild_id, { // eslint-disable-line
        client: this.client,
        guildId: data.guild_id,
        sessionId: data.session_id,
        channelId: this.pendingGuilds[data.guild_id].channelId,
        hostname: this.pendingGuilds[data.guild_id].hostname,
        node: this.pendingGuilds[data.guild_id].node,
        options: this.pendingGuilds[data.guild_id].options,
        event: data,
        manager: this
      });

      this.set(data.guild_id, player);

      player.connect({
        sessionId: data.session_id,
        guildId: data.guild_id,
        channelId: this.pendingGuilds[data.guild_id].channelId,
        event: {
          endpoint: data.endpoint,
          guild_id: data.guild_id,
          token: data.token
        }
      });
    }

    const disconnectHandler = () => {
      player = this.get(data.guild_id);
      if (!this.pendingGuilds[data.guild_id]) {
        if (player) {
          player.removeListener('ready', readyHandler);
        }
        return;
      }
      player.removeListener('ready', readyHandler);
      this.pendingGuilds[data.guild_id].rej(new Error('Disconnected'));
      delete this.pendingGuilds[data.guild_id];
    };

    const readyHandler = () => {
      player = this.get(data.guild_id);
      if (!this.pendingGuilds[data.guild_id]) {
        if (player) {
          player.removeListener('disconnect', disconnectHandler);
        }
        return;
      }
      player.removeListener('disconnect', disconnectHandler);
      this.pendingGuilds[data.guild_id].res(player);
      delete this.pendingGuilds[data.guild_id];
    };

    player.once('ready', readyHandler).once('disconnect', disconnectHandler);
  }

  /**
   * Get ideal region from data
   * @param {string} endpoint Endpoint or region
   * @returns {string}
   * @private
   */
  getRegionFromData(endpoint) {
    if (!endpoint) return this.options.defaultRegion || 'us';

    endpoint = endpoint.replace('vip-', '');

    for (const key in this.regions) {
      const nodes = [...this.nodes.values()].filter(n => n.region === key);
      if (!nodes || !nodes.length) continue;
      if (!nodes.find(n => n.connected && !n.draining)) continue;
      for (const region of this.regions[key]) {
        if (endpoint.startsWith(region)) {
          return key;
        }
      }
    }

    return this.options.defaultRegion || 'us';
  }

}

module.exports = PlayerManager;
