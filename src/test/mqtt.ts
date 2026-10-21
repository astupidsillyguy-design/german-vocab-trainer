/**
 * 假的 WebSocket：记录发出的 MQTT 报文，并模拟服务器的回复。
 */
import type { MqttSocket, MqttSocketFactory } from '../sync';

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

/** 固定报头的首字节：报文类型在高 4 位 */
const CONNACK_HEADER = 0x20;
const SUBACK_HEADER = 0x90;
const PINGRESP_HEADER = 0xd0;
const TYPE_SHIFT = 4;
const CONNACK_LENGTH = 2;
const SUBACK_LENGTH = 3;
const NOT_AUTHORIZED = 5;
const BYTE_SHIFT = 8;
const BYTE_MASK = 0xff;
/** 报文标识在固定报头（2 字节）之后 */
const PACKET_ID_OFFSET = 2;

/** 服务器回复：接受连接 */
export const CONNACK_OK = Uint8Array.of(CONNACK_HEADER, CONNACK_LENGTH, 0, 0);
/** 服务器回复：拒绝连接（未授权） */
export const CONNACK_REFUSED = Uint8Array.of(CONNACK_HEADER, CONNACK_LENGTH, 0, NOT_AUTHORIZED);
export const PINGRESP = Uint8Array.of(PINGRESP_HEADER, 0);

export function suback(packetId: number, returnCode = 0): Uint8Array {
  return Uint8Array.of(
    SUBACK_HEADER,
    SUBACK_LENGTH,
    packetId >> BYTE_SHIFT,
    packetId & BYTE_MASK,
    returnCode,
  );
}

/** 报文类型（固定报头的高 4 位） */
export function packetType(bytes: Uint8Array): number {
  return (bytes[0] ?? 0) >> TYPE_SHIFT;
}

/** SUBSCRIBE 报文的报文标识（短报文的剩余长度只占 1 字节） */
export function packetIdOf(bytes: Uint8Array): number {
  return ((bytes[PACKET_ID_OFFSET] ?? 0) << BYTE_SHIFT) | (bytes[PACKET_ID_OFFSET + 1] ?? 0);
}

export class FakeSocket implements MqttSocket {
  binaryType: BinaryType = 'blob';
  readyState = CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly sent: Uint8Array[] = [];
  closed = false;

  readonly url: string;
  readonly protocols: readonly string[];

  constructor(url: string, protocols: readonly string[]) {
    this.url = url;
    this.protocols = protocols;
  }

  send(data: Uint8Array<ArrayBuffer>): void {
    this.sent.push(data.slice());
  }

  close(): void {
    this.closed = true;
    this.readyState = CLOSED;
  }

  /** 服务器接受了 WebSocket 连接 */
  open(): void {
    this.readyState = OPEN;
    this.onopen?.(new Event('open'));
  }

  /** 服务器发来字节 */
  receive(bytes: Uint8Array): void {
    this.onmessage?.(new MessageEvent('message', { data: bytes.slice().buffer }));
  }

  receiveText(text: string): void {
    this.onmessage?.(new MessageEvent('message', { data: text }));
  }

  /** 连接意外断开 */
  drop(): void {
    this.readyState = CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  /** 发出的某类报文 */
  sentOfType(type: number): Uint8Array[] {
    return this.sent.filter((bytes) => packetType(bytes) === type);
  }
}

/** 记录每次创建的假套接字 */
export function fakeSockets(): {
  readonly sockets: FakeSocket[];
  readonly factory: MqttSocketFactory;
} {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    factory: (url, protocols) => {
      const socket = new FakeSocket(url, protocols);
      sockets.push(socket);
      return socket;
    },
  };
}
