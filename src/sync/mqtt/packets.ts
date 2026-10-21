/**
 * MQTT 3.1.1 报文的编码与解码，只实现信令需要的子集：连接、QoS 0 发布、订阅、退订、心跳。
 * 规范：https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html
 */

const PACKET_TYPES = {
  connect: 1,
  connack: 2,
  publish: 3,
  puback: 4,
  subscribe: 8,
  suback: 9,
  unsubscribe: 10,
  unsuback: 11,
  pingreq: 12,
  pingresp: 13,
  disconnect: 14,
} as const;

const TYPE_SHIFT = 4;
const FLAGS_MASK = 0x0f;
/** SUBSCRIBE / UNSUBSCRIBE 的固定报头标志位规定为 0010 */
const REQUEST_FLAGS = 0b0010;
const PROTOCOL_NAME = 'MQTT';
const PROTOCOL_LEVEL = 4;
const CLEAN_SESSION = 0b0000_0010;
const QOS_SHIFT = 1;
const QOS_MASK = 0b11;
const QOS_AT_MOST_ONCE = 0;
const VARINT_CONTINUE = 0x80;
const VARINT_VALUE_MASK = 0x7f;
const VARINT_SHIFT = 7;
const VARINT_MAX_BYTES = 4;
const BYTE_SHIFT = 8;
const BYTE_MASK = 0xff;
const UINT16_BYTES = 2;
const UINT16_MAX = 0xffff;
const CONNACK_LENGTH = 2;
const SESSION_PRESENT = 0b1;

/** SUBACK 中表示订阅失败的返回码 */
export const SUBACK_FAILURE = 0x80;
/** CONNACK 中表示接受连接的返回码 */
export const CONNACK_ACCEPTED = 0;

export class MqttProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MqttProtocolError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

type Bytes = Uint8Array<ArrayBuffer>;

function concat(parts: readonly Uint8Array[]): Bytes {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function uint16(value: number): Bytes {
  return Uint8Array.of((value >> BYTE_SHIFT) & BYTE_MASK, value & BYTE_MASK);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset + UINT16_BYTES > bytes.length) throw new MqttProtocolError('报文过短');
  return ((bytes[offset] ?? 0) << BYTE_SHIFT) | (bytes[offset + 1] ?? 0);
}

/** 带 2 字节长度前缀的 UTF-8 字符串 */
function utf8String(text: string): Bytes {
  const body = encoder.encode(text);
  if (body.length > UINT16_MAX) throw new RangeError('MQTT 字符串过长');
  return concat([uint16(body.length), body]);
}

/** 剩余长度：每字节 7 位，最高位表示后面还有字节 */
function encodeLength(length: number): number[] {
  const bytes: number[] = [];
  let value = length;
  do {
    let byte = value & VARINT_VALUE_MASK;
    value >>>= VARINT_SHIFT;
    if (value > 0) byte |= VARINT_CONTINUE;
    bytes.push(byte);
  } while (value > 0);
  return bytes;
}

function packet(type: number, flags: number, parts: readonly Uint8Array[]): Bytes {
  const body = concat(parts);
  return concat([Uint8Array.of((type << TYPE_SHIFT) | flags, ...encodeLength(body.length)), body]);
}

export interface ConnectOptions {
  readonly clientId: string;
  readonly keepAliveSeconds: number;
}

export function encodeConnect({ clientId, keepAliveSeconds }: ConnectOptions): Bytes {
  return packet(PACKET_TYPES.connect, 0, [
    utf8String(PROTOCOL_NAME),
    Uint8Array.of(PROTOCOL_LEVEL, CLEAN_SESSION),
    uint16(keepAliveSeconds),
    utf8String(clientId),
  ]);
}

export function encodePublish(topic: string, payload: Uint8Array): Bytes {
  return packet(PACKET_TYPES.publish, 0, [utf8String(topic), payload]);
}

export function encodePuback(packetId: number): Bytes {
  return packet(PACKET_TYPES.puback, 0, [uint16(packetId)]);
}

export function encodeSubscribe(packetId: number, topic: string): Bytes {
  return packet(PACKET_TYPES.subscribe, REQUEST_FLAGS, [
    uint16(packetId),
    utf8String(topic),
    Uint8Array.of(QOS_AT_MOST_ONCE),
  ]);
}

export function encodeUnsubscribe(packetId: number, topic: string): Bytes {
  return packet(PACKET_TYPES.unsubscribe, REQUEST_FLAGS, [uint16(packetId), utf8String(topic)]);
}

export function encodePingreq(): Bytes {
  return packet(PACKET_TYPES.pingreq, 0, []);
}

export function encodeDisconnect(): Bytes {
  return packet(PACKET_TYPES.disconnect, 0, []);
}

export type MqttPacket =
  | { readonly type: 'connack'; readonly sessionPresent: boolean; readonly returnCode: number }
  | {
      readonly type: 'publish';
      readonly topic: string;
      readonly payload: Uint8Array;
      /** QoS 1 / 2 的报文需要确认；QoS 0 为 null */
      readonly packetId: number | null;
    }
  | { readonly type: 'suback'; readonly packetId: number; readonly returnCodes: readonly number[] }
  | { readonly type: 'unsuback'; readonly packetId: number }
  | { readonly type: 'pingresp' }
  /** 客户端不需要处理的其他报文 */
  | { readonly type: 'other'; readonly code: number };

function decodePublish(flags: number, body: Uint8Array): MqttPacket {
  const topicLength = readUint16(body, 0);
  const topicEnd = UINT16_BYTES + topicLength;
  if (topicEnd > body.length) throw new MqttProtocolError('主题长度越界');
  let topic: string;
  try {
    topic = decoder.decode(body.subarray(UINT16_BYTES, topicEnd));
  } catch {
    throw new MqttProtocolError('主题不是合法的 UTF-8');
  }
  const qos = (flags >> QOS_SHIFT) & QOS_MASK;
  const packetId = qos === QOS_AT_MOST_ONCE ? null : readUint16(body, topicEnd);
  const payloadStart = packetId === null ? topicEnd : topicEnd + UINT16_BYTES;
  return { type: 'publish', topic, payload: body.slice(payloadStart), packetId };
}

function decodeBody(type: number, flags: number, body: Uint8Array): MqttPacket {
  switch (type) {
    case PACKET_TYPES.connack:
      if (body.length !== CONNACK_LENGTH) throw new MqttProtocolError('CONNACK 长度错误');
      return {
        type: 'connack',
        sessionPresent: ((body[0] ?? 0) & SESSION_PRESENT) !== 0,
        returnCode: body[1] ?? 0,
      };
    case PACKET_TYPES.publish:
      return decodePublish(flags, body);
    case PACKET_TYPES.suback:
      return {
        type: 'suback',
        packetId: readUint16(body, 0),
        returnCodes: [...body.subarray(UINT16_BYTES)],
      };
    case PACKET_TYPES.unsuback:
      return { type: 'unsuback', packetId: readUint16(body, 0) };
    case PACKET_TYPES.pingresp:
      return { type: 'pingresp' };
    default:
      return { type: 'other', code: type };
  }
}

interface FixedHeader {
  readonly type: number;
  readonly flags: number;
  readonly bodyStart: number;
  readonly bodyLength: number;
}

/** 读取固定报头；字节还不够时返回 null */
function readHeader(buffer: Uint8Array): FixedHeader | null {
  const first = buffer[0];
  if (first === undefined) return null;
  let length = 0;
  for (let index = 0; index < VARINT_MAX_BYTES; index += 1) {
    const byte = buffer[1 + index];
    if (byte === undefined) return null;
    length += (byte & VARINT_VALUE_MASK) * 2 ** (VARINT_SHIFT * index);
    if ((byte & VARINT_CONTINUE) === 0) {
      return {
        type: first >> TYPE_SHIFT,
        flags: first & FLAGS_MASK,
        bodyStart: index + 2,
        bodyLength: length,
      };
    }
  }
  throw new MqttProtocolError('剩余长度超过 4 字节');
}

/**
 * 按字节流拆分报文：一条 WebSocket 消息可能包含多个报文，也可能只有半个。
 * 超过上限的报文直接视为协议错误，不会为它分配内存。
 */
export class MqttPacketReader {
  readonly #maxPacketBytes: number;
  #buffer: Uint8Array = new Uint8Array(0);

  constructor(maxPacketBytes: number) {
    this.#maxPacketBytes = maxPacketBytes;
  }

  /** 追加收到的字节，返回其中所有完整的报文；格式错误时抛出 MqttProtocolError */
  push(chunk: Uint8Array): MqttPacket[] {
    this.#buffer = this.#buffer.length === 0 ? chunk : concat([this.#buffer, chunk]);
    const packets: MqttPacket[] = [];
    for (;;) {
      const header = readHeader(this.#buffer);
      if (header === null) break;
      if (header.bodyLength > this.#maxPacketBytes) throw new MqttProtocolError('报文过大');
      const end = header.bodyStart + header.bodyLength;
      if (this.#buffer.length < end) break;
      packets.push(
        decodeBody(header.type, header.flags, this.#buffer.subarray(header.bodyStart, end)),
      );
      this.#buffer = this.#buffer.slice(end);
    }
    return packets;
  }
}
