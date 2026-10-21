import { describe, expect, it } from 'vitest';
import {
  MqttPacketReader,
  MqttProtocolError,
  encodeConnect,
  encodeDisconnect,
  encodePingreq,
  encodePuback,
  encodePublish,
  encodeSubscribe,
  encodeUnsubscribe,
} from './packets';

const MAX_PACKET_BYTES = 1024;
const text = (value: string): number[] => [...new TextEncoder().encode(value)];

describe('MQTT 报文编码', () => {
  it('CONNECT：协议名、级别 4、清除会话、心跳与客户端标识', () => {
    expect([...encodeConnect({ clientId: 'ab', keepAliveSeconds: 30 })]).toEqual([
      0x10,
      14,
      0,
      4,
      ...text('MQTT'),
      4,
      0b10,
      0,
      30,
      0,
      2,
      ...text('ab'),
    ]);
  });

  it('PUBLISH（QoS 0）：主题与载荷', () => {
    expect([...encodePublish('t/1', Uint8Array.of(7, 8))]).toEqual([
      0x30,
      7,
      0,
      3,
      ...text('t/1'),
      7,
      8,
    ]);
  });

  it('SUBSCRIBE / UNSUBSCRIBE 的固定报头标志位为 0010', () => {
    expect([...encodeSubscribe(0x0102, 'x')]).toEqual([0x82, 6, 1, 2, 0, 1, ...text('x'), 0]);
    expect([...encodeUnsubscribe(5, 'x')]).toEqual([0xa2, 5, 0, 5, 0, 1, ...text('x')]);
  });

  it('无载荷的控制报文', () => {
    expect([...encodePingreq()]).toEqual([0xc0, 0]);
    expect([...encodeDisconnect()]).toEqual([0xe0, 0]);
    expect([...encodePuback(0x1234)]).toEqual([0x40, 2, 0x12, 0x34]);
  });

  it('剩余长度超过 127 字节时使用多字节编码', () => {
    const packet = encodePublish('t', new Uint8Array(200));
    // 主题 2 + 1 字节，载荷 200 字节：剩余长度 203 = 0b1_1001011 → [0xcb, 0x01]
    expect([...packet.subarray(0, 3)]).toEqual([0x30, 0xcb, 0x01]);
    expect(packet.length).toBe(3 + 203);
  });

  it('主题过长时拒绝编码', () => {
    expect(() => encodePublish('x'.repeat(70_000), new Uint8Array(0))).toThrow(RangeError);
  });
});

describe('MQTT 报文解码', () => {
  it('解析 CONNACK、SUBACK、UNSUBACK、PINGRESP', () => {
    const reader = new MqttPacketReader(MAX_PACKET_BYTES);
    expect(reader.push(Uint8Array.of(0x20, 2, 1, 0))).toEqual([
      { type: 'connack', sessionPresent: true, returnCode: 0 },
    ]);
    expect(reader.push(Uint8Array.of(0x90, 4, 0, 9, 0, 0x80))).toEqual([
      { type: 'suback', packetId: 9, returnCodes: [0, 0x80] },
    ]);
    expect(reader.push(Uint8Array.of(0xb0, 2, 0, 9, 0xd0, 0))).toEqual([
      { type: 'unsuback', packetId: 9 },
      { type: 'pingresp' },
    ]);
  });

  it('解析 QoS 0 与 QoS 1 的 PUBLISH', () => {
    const reader = new MqttPacketReader(MAX_PACKET_BYTES);
    expect(reader.push(encodePublish('t/1', Uint8Array.of(1, 2, 3)))).toEqual([
      { type: 'publish', topic: 't/1', payload: Uint8Array.of(1, 2, 3), packetId: null },
    ]);
    const qos1 = Uint8Array.of(0x32, 6, 0, 1, ...text('t'), 0, 42, 9);
    expect(reader.push(qos1)).toEqual([
      { type: 'publish', topic: 't', payload: Uint8Array.of(9), packetId: 42 },
    ]);
  });

  it('报文可能跨越多条 WebSocket 消息', () => {
    const reader = new MqttPacketReader(MAX_PACKET_BYTES);
    const packet = encodePublish('topic', new Uint8Array(300).fill(5));
    expect(reader.push(packet.subarray(0, 1))).toEqual([]);
    expect(reader.push(packet.subarray(1, 2))).toEqual([]);
    expect(reader.push(packet.subarray(2, 100))).toEqual([]);
    const [decoded] = reader.push(packet.subarray(100));
    expect(decoded).toMatchObject({ type: 'publish', topic: 'topic' });
    expect(decoded?.type === 'publish' ? decoded.payload.length : 0).toBe(300);
  });

  it('不需要处理的报文类型原样标记', () => {
    const reader = new MqttPacketReader(MAX_PACKET_BYTES);
    expect(reader.push(Uint8Array.of(0x40, 2, 0, 1))).toEqual([{ type: 'other', code: 4 }]);
  });

  it('格式错误或超过上限的报文视为协议错误', () => {
    const fails = (bytes: Uint8Array) => () => new MqttPacketReader(MAX_PACKET_BYTES).push(bytes);
    expect(fails(Uint8Array.of(0x20, 1, 0))).toThrow(MqttProtocolError);
    expect(fails(Uint8Array.of(0x30, 0xff, 0xff, 0xff, 0xff, 0x01))).toThrow(MqttProtocolError);
    expect(fails(Uint8Array.of(0x30, 0x80, 0x10))).toThrow('报文过大');
    expect(fails(Uint8Array.of(0x30, 3, 0, 5, 1))).toThrow('主题长度越界');
    expect(fails(Uint8Array.of(0x30, 3, 0, 1, 0xff))).toThrow('UTF-8');
    expect(fails(Uint8Array.of(0x90, 1, 0))).toThrow('报文过短');
  });
});
