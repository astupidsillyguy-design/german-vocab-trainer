/**
 * 同步测试用的内存信令与内存直连：不需要网络、MQTT 服务器或 WebRTC。
 * 所有投递都经过微任务，与真实环境一样是异步的；用 settle() 等待它们全部完成。
 */
import type {
  IceCandidateData,
  PeerFactory,
  PeerLink,
  PeerLinkEvents,
  SignalingAdapter,
  SignalingConnection,
  SignalingEvents,
} from '../sync';
import type { SyncEnvironmentFactory } from '../features/sync';

const SETTLE_ROUNDS = 200;

/** 等待所有排队的微任务（多轮 Promise 链）完成 */
export async function settle(): Promise<void> {
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) await Promise.resolve();
}

class MemoryConnection implements SignalingConnection {
  readonly rooms = new Set<string>();
  isClosed = false;
  readonly #network: MemorySignaling;
  readonly events: SignalingEvents;

  constructor(network: MemorySignaling, events: SignalingEvents) {
    this.#network = network;
    this.events = events;
  }

  join(room: string): Promise<void> {
    if (this.isClosed) return Promise.reject(new Error('closed'));
    this.rooms.add(room);
    return Promise.resolve();
  }

  leave(room: string): void {
    this.rooms.delete(room);
  }

  send(room: string, text: string): void {
    if (!this.isClosed) this.#network.deliver(room, text, this);
  }

  close(): void {
    this.isClosed = true;
    this.rooms.clear();
  }
}

export class MemorySignaling implements SignalingAdapter {
  readonly connections: MemoryConnection[] = [];
  /** 经过的所有消息（解析后的 JSON），便于断言 */
  readonly log: { readonly room: string; readonly message: unknown }[] = [];
  /** 为 true 时 connect() 失败（服务器不可用） */
  unavailable = false;
  /** 为 true 时 connect() 永远不完成（超时） */
  hanging = false;

  connect(events: SignalingEvents): Promise<SignalingConnection> {
    if (this.unavailable) return Promise.reject(new Error('unavailable'));
    if (this.hanging) return new Promise<never>(() => undefined);
    const connection = new MemoryConnection(this, events);
    this.connections.push(connection);
    return Promise.resolve(connection);
  }

  get openConnections(): number {
    return this.connections.filter((connection) => !connection.isClosed).length;
  }

  deliver(room: string, text: string, from: MemoryConnection | null): void {
    this.log.push({ room, message: JSON.parse(text) as unknown });
    for (const connection of this.connections) {
      if (connection === from || connection.isClosed || !connection.rooms.has(room)) continue;
      queueMicrotask(() => {
        if (!connection.isClosed && connection.rooms.has(room)) {
          connection.events.onMessage(room, text);
        }
      });
    }
  }

  /** 以其他设备的身份向房间发消息 */
  inject(room: string, text: string): void {
    for (const connection of this.connections) {
      if (connection.isClosed || !connection.rooms.has(room)) continue;
      queueMicrotask(() => {
        connection.events.onMessage(room, text);
      });
    }
  }

  /** 所有连接意外断开 */
  dropAll(): void {
    for (const connection of this.connections) {
      if (connection.isClosed) continue;
      connection.close();
      connection.events.onDrop();
    }
  }
}

const MEMORY_CANDIDATE: IceCandidateData = {
  candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host',
  sdpMid: '0',
  sdpMLineIndex: 0,
};

export class MemoryPeer implements PeerLink {
  readonly #network: MemoryPeers;
  readonly events: PeerLinkEvents;
  remote: MemoryPeer | null = null;
  isOpen = false;
  isClosed = false;
  readonly bufferedAmount = 0;
  readonly candidates: IceCandidateData[] = [];

  constructor(network: MemoryPeers, events: PeerLinkEvents) {
    this.#network = network;
    this.events = events;
  }

  createOffer(): Promise<string> {
    const sdp = this.#network.register(this);
    queueMicrotask(() => {
      this.events.onCandidate(MEMORY_CANDIDATE);
    });
    return Promise.resolve(sdp);
  }

  acceptOffer(sdp: string): Promise<string> {
    const offerer = this.#network.offerer(sdp);
    if (offerer === undefined) return Promise.reject(new Error('unknown offer'));
    this.remote = offerer;
    offerer.remote = this;
    return Promise.resolve(`answer:${sdp}`);
  }

  acceptAnswer(): Promise<void> {
    const remote = this.remote;
    if (remote === null) return Promise.reject(new Error('no remote'));
    if (!this.#network.blocked) {
      queueMicrotask(() => {
        this.isOpen = true;
        remote.isOpen = true;
        this.events.onOpen();
        remote.events.onOpen();
      });
    }
    return Promise.resolve();
  }

  addCandidate(candidate: IceCandidateData): Promise<void> {
    this.candidates.push(candidate);
    return Promise.resolve();
  }

  send(data: string | Uint8Array<ArrayBuffer>): void {
    const remote = this.remote;
    if (!this.isOpen || this.isClosed || remote === null) return;
    const copy = typeof data === 'string' ? data : data.slice().buffer;
    queueMicrotask(() => {
      if (!remote.isClosed) remote.events.onMessage(copy);
    });
  }

  drain(): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    const remote = this.remote;
    if (remote !== null && this.isOpen) {
      queueMicrotask(() => {
        remote.finish('closed');
      });
    }
  }

  /** 网络中断：两端都收到 failed */
  fail(): void {
    this.finish('failed');
    this.remote?.finish('failed');
  }

  finish(reason: 'failed' | 'closed'): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.events.onClose(reason);
  }
}

export class MemoryPeers {
  readonly links: MemoryPeer[] = [];
  readonly #offers = new Map<string, MemoryPeer>();
  /** 为 true 时直连无法建立（例如两台设备的网络不通） */
  blocked = false;

  readonly factory: PeerFactory = (events) => {
    const peer = new MemoryPeer(this, events);
    this.links.push(peer);
    return peer;
  };

  register(peer: MemoryPeer): string {
    const sdp = `offer:${String(this.#offers.size + 1)}`;
    this.#offers.set(sdp, peer);
    return sdp;
  }

  offerer(sdp: string): MemoryPeer | undefined {
    return this.#offers.get(sdp);
  }
}

/** 一对内存信令与内存直连，以及使用它们的同步面板环境 */
export interface MemorySyncNetwork {
  readonly signaling: MemorySignaling;
  readonly peers: MemoryPeers;
  readonly environment: SyncEnvironmentFactory;
}

export function createMemorySyncNetwork(
  device: string | null = 'Test · Browser',
): MemorySyncNetwork {
  const signaling = new MemorySignaling();
  const peers = new MemoryPeers();
  return {
    signaling,
    peers,
    environment: () => ({ signaling, peers: peers.factory, device }),
  };
}
