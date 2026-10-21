/**
 * 精简的 MQTT over WebSocket 客户端（只用于信令）：连接、QoS 0 发布、订阅、退订与心跳。
 * 与具体 WebSocket 实现解耦，测试时可以注入假的套接字。
 */
import {
  CONNACK_ACCEPTED,
  MqttPacketReader,
  SUBACK_FAILURE,
  encodeConnect,
  encodeDisconnect,
  encodePingreq,
  encodePuback,
  encodePublish,
  encodeSubscribe,
  encodeUnsubscribe,
  type MqttPacket,
} from './packets';

/** MQTT over WebSocket 规定的子协议名 */
const MQTT_SUBPROTOCOL = 'mqtt';
const SOCKET_OPEN = 1;
const MS_PER_SECOND = 1000;
const MAX_PACKET_ID = 0xffff;

/** 客户端用到的 WebSocket 子集 */
export interface MqttSocket {
  binaryType: BinaryType;
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: Uint8Array<ArrayBuffer>): void;
  close(): void;
}

export type MqttSocketFactory = (url: string, protocols: string[]) => MqttSocket;

export type MqttErrorKind = 'timeout' | 'refused' | 'closed' | 'protocol' | 'subscribe';

export class MqttError extends Error {
  readonly kind: MqttErrorKind;

  constructor(kind: MqttErrorKind) {
    super(`MQTT ${kind}`);
    this.name = 'MqttError';
    this.kind = kind;
  }
}

export interface MqttClientOptions {
  readonly url: string;
  readonly clientId: string;
  /** 从打开套接字到服务器接受连接的最长时间 */
  readonly timeoutMs: number;
  readonly keepAliveSeconds: number;
  readonly maxPacketBytes: number;
  readonly createSocket?: MqttSocketFactory;
}

export interface MqttClientEvents {
  readonly onMessage: (topic: string, payload: Uint8Array) => void;
  /** 连接意外断开（主动 close() 不触发） */
  readonly onClose: () => void;
}

interface Pending {
  readonly resolve: () => void;
  readonly reject: (error: MqttError) => void;
}

const openWebSocket: MqttSocketFactory = (url, protocols) => new WebSocket(url, protocols);

export class MqttClient {
  readonly #socket: MqttSocket;
  readonly #events: MqttClientEvents;
  readonly #reader: MqttPacketReader;
  readonly #keepAliveMs: number;
  readonly #subscriptions = new Map<number, Pending>();
  #state: 'connecting' | 'open' | 'closed' = 'connecting';
  #connecting: Pending | null = null;
  #nextPacketId = 1;
  #keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  #awaitingPong = false;

  private constructor(socket: MqttSocket, events: MqttClientEvents, options: MqttClientOptions) {
    this.#socket = socket;
    this.#events = events;
    this.#reader = new MqttPacketReader(options.maxPacketBytes);
    this.#keepAliveMs = options.keepAliveSeconds * MS_PER_SECOND;
  }

  /** 连接成功（服务器回复 CONNACK 并接受）后完成；超时、被拒绝或断开时失败 */
  static async connect(options: MqttClientOptions, events: MqttClientEvents): Promise<MqttClient> {
    const socket = (options.createSocket ?? openWebSocket)(options.url, [MQTT_SUBPROTOCOL]);
    const client = new MqttClient(socket, events, options);
    await client.#open(options);
    return client;
  }

  get isOpen(): boolean {
    return this.#state === 'open';
  }

  subscribe(topic: string): Promise<void> {
    if (this.#state !== 'open') return Promise.reject(new MqttError('closed'));
    const packetId = this.#takePacketId();
    return new Promise((resolve, reject) => {
      this.#subscriptions.set(packetId, { resolve, reject });
      this.#send(encodeSubscribe(packetId, topic));
    });
  }

  unsubscribe(topic: string): void {
    if (this.#state === 'open') this.#send(encodeUnsubscribe(this.#takePacketId(), topic));
  }

  publish(topic: string, payload: Uint8Array): void {
    if (this.#state === 'open') this.#send(encodePublish(topic, payload));
  }

  close(): void {
    if (this.#state === 'closed') return;
    if (this.#state === 'open') this.#send(encodeDisconnect());
    this.#shutdown(new MqttError('closed'));
  }

  #open(options: MqttClientOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#fail(new MqttError('timeout'));
      }, options.timeoutMs);
      this.#connecting = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      const socket = this.#socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        this.#send(
          encodeConnect({ clientId: options.clientId, keepAliveSeconds: options.keepAliveSeconds }),
        );
      };
      socket.onmessage = (event) => {
        this.#receive(event.data);
      };
      socket.onclose = () => {
        this.#fail(new MqttError('closed'));
      };
      socket.onerror = () => {
        this.#fail(new MqttError('closed'));
      };
    });
  }

  #receive(data: unknown): void {
    if (!(data instanceof ArrayBuffer)) {
      this.#fail(new MqttError('protocol'));
      return;
    }
    let packets: MqttPacket[];
    try {
      packets = this.#reader.push(new Uint8Array(data));
    } catch {
      this.#fail(new MqttError('protocol'));
      return;
    }
    for (const packet of packets) {
      if (this.#state === 'closed') return;
      this.#handle(packet);
    }
  }

  #handle(packet: MqttPacket): void {
    switch (packet.type) {
      case 'connack':
        if (this.#state !== 'connecting') {
          this.#fail(new MqttError('protocol'));
        } else if (packet.returnCode !== CONNACK_ACCEPTED) {
          this.#fail(new MqttError('refused'));
        } else {
          this.#state = 'open';
          this.#startKeepAlive();
          this.#connecting?.resolve();
          this.#connecting = null;
        }
        return;
      case 'publish':
        if (this.#state !== 'open') return;
        if (packet.packetId !== null) this.#send(encodePuback(packet.packetId));
        this.#events.onMessage(packet.topic, packet.payload);
        return;
      case 'suback': {
        const pending = this.#subscriptions.get(packet.packetId);
        this.#subscriptions.delete(packet.packetId);
        if (packet.returnCodes.includes(SUBACK_FAILURE))
          pending?.reject(new MqttError('subscribe'));
        else pending?.resolve();
        return;
      }
      case 'pingresp':
        this.#awaitingPong = false;
        return;
      case 'unsuback':
      case 'other':
        return;
    }
  }

  /** 每个心跳周期发一次 PINGREQ；上一次还没有回应就认为连接已失效 */
  #startKeepAlive(): void {
    this.#keepAliveTimer = setInterval(() => {
      if (this.#awaitingPong) {
        this.#fail(new MqttError('timeout'));
        return;
      }
      this.#awaitingPong = true;
      this.#send(encodePingreq());
    }, this.#keepAliveMs);
  }

  #takePacketId(): number {
    const id = this.#nextPacketId;
    this.#nextPacketId = id >= MAX_PACKET_ID ? 1 : id + 1;
    return id;
  }

  #send(bytes: Uint8Array<ArrayBuffer>): void {
    if (this.#socket.readyState === SOCKET_OPEN) this.#socket.send(bytes);
  }

  /** 意外失败：已经连上时通知调用方 */
  #fail(error: MqttError): void {
    if (this.#state === 'closed') return;
    const wasOpen = this.#state === 'open';
    this.#shutdown(error);
    if (wasOpen) this.#events.onClose();
  }

  #shutdown(error: MqttError): void {
    this.#state = 'closed';
    if (this.#keepAliveTimer !== null) clearInterval(this.#keepAliveTimer);
    this.#keepAliveTimer = null;
    this.#connecting?.reject(error);
    this.#connecting = null;
    for (const pending of this.#subscriptions.values()) pending.reject(error);
    this.#subscriptions.clear();
    const socket = this.#socket;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
  }
}
