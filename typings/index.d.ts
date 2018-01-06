declare module 'lavalink.js' {
  import { EventEmitter } from 'events';
  import { Client as DiscordClient } from 'discord.js';
  export const version: string;

  export class PlayerManager extends Map<string, Player> {
    public constructor(client: DiscordClient, nodes: object[], options: object);
    public baseObject: Player;
    public client: DiscordClient;
    public nodes: Map<string, Lavalink>;
    public pendingGuilds: object;
    public options: object;
    public failoverQueue: Function[];
    public failoverRate: number;
    public failoverLimit: number;
    private defaultRegions: object;
    public regions: object;

    public createNode(options: LavalinkOptions): void;
    public removeNode(host: string): void;
    private checkFailoverQueue(): void;
    private queueFailover(fn: Function): void;
    private processQueue(fn: Function): void;
    private onDisconnect(node: Lavalink, msg: any): void;
    private onReady(): void;
    private onRaw(packet: object): void;
    public switchNode(player: Player, leave: boolean): void;
    private onMessage(node: Lavalink, message: object): any;
    public join(guildId: string, channelId: string, options?: object, player?: Player): Promise<Player>;
    public leave(guildId: string): void;
    private findIdealNode(region: string): Promise<string>;
    private voiceServerUpdate(data: object): void;
    private getRegionFromData(endpoint: string): string;
  }

  export class Player extends EventEmitter {
    public constructor(id: string, data: PlayerOptions);
    public id: string;
    public client: DiscordClient;
    public manager?: PlayerManager;
    public node: Lavalink;
    public hostname: string;
    public guildId: string;
    public channelId: string;
    public options?: object;
    public ready: boolean;
    public playing: boolean;
    public state: object;
    public track?: string;
    public receivedEvents: object[];
    public sendQueue: object[];
    public timestamp: number;

    private checkEventQueue(): void;
    private queueEvent(data: object): void;
    private sendEvent(data: object): void;
    public connect(data: PlayerConnectData): void;
    public disconnect(msg: string): Promise<void>;
    public play(track: string, options: object): void;
    public stop(): void;
    private stateUpdate(state: object): void;
    public setPause(pause: boolean): void;
    public seek(position: number): void;
    public setVolume(volume: number): void;
    private onTrackEnd(message: object): void;
    private onTrackException(message: object): void;
    private onTrackStuck(message: object): void;
    public switchChannel(channelId: string, reactive?: boolean): void;
    public getTimestamp(): number;
    private updateVoiceState(channelId: string, selfMute: boolean, selfDeaf: boolean): void;
  }

  export class Lavalink extends EventEmitter {
    public constructor(options: LavalinkOptions);
    public host: string;
    public port?: number;
    public address: string;
    public region?: string;
    public userId: string;
    public numShards: number;
    public password?: string;
    public connected: boolean;
    public draining: boolean;
    public retries: number;
    public reconnectTimeout?: number;
    public stats: LavalinkStats;
    public disconnectHandler: any;

    private connect(): void;
    private reconnect(): void;
    private destroy(): void;
    private ready(): void;
    private disconnected(): void;
    private retryInterval(): number;
    public send(data: object): void;
    private onMessage(message: object): void;
  }

  export type PlayerOptions = {
    hostname: string;
    guildId: string;
    channelId: string;
    client: DiscordClient;
    node: Lavalink;
    manager: PlayerManager;
    options?: object;
  };

  export type PlayerConnectData = {
    guildId: string;
    sessionId: string;
    event: object;
  };

  export type LavalinkOptions = {
    host: string;
    port: string;
    region: string;
    numShards: number;
    userId: string;
    password: string;
    timeout?: number;
  };

  export type LavalinkStats = {
    players: number;
    playingPlayers: number;
  };
}
