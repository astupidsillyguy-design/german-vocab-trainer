import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONNACK_OK,
  CONNACK_REFUSED,
  PINGRESP,
  fakeSockets,
  packetIdOf,
  suback,
} from '../../test/mqtt';
import { MqttClient, MqttError } from './MqttClient';
import { encodePublish } from './packets';

const TYPE = {
  connect: 1,
  publish: 3,
  puback: 4,
  subscribe: 8,
  unsubscribe: 10,
  pingreq: 12,
  disconnect: 14,
};
const KEEP_ALIVE_SECONDS = 30;
const TIMEOUT_MS = 1000;

afterEach(() => {
  vi.useRealTimers();
});

function start() {
  const { sockets, factory } = fakeSockets();
  const onMessage = vi.fn<(topic: string, payload: Uint8Array) => void>();
  const onClose = vi.fn<() => void>();
  const connecting = MqttClient.connect(
    {
      url: 'wss://broker.test/mqtt',
      clientId: 'client-1',
      timeoutMs: TIMEOUT_MS,
      keepAliveSeconds: KEEP_ALIVE_SECONDS,
      maxPacketBytes: 1024,
      createSocket: factory,
    },
    { onMessage, onClose },
  );
  const socket = sockets[0];
  if (socket === undefined) throw new Error('应当创建套接字');
  return { socket, connecting, onMessage, onClose };
}

async function connected() {
  const context = start();
  context.socket.open();
  context.socket.receive(CONNACK_OK);
  const client = await context.connecting;
  return { ...context, client };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof MqttError ? error.kind : 'unknown';
  }
  return 'none';
}

describe('MQTT 客户端：连接', () => {
  it('打开 WebSocket（子协议 mqtt）后发送 CONNECT，收到接受的 CONNACK 后完成', async () => {
    const { socket, client } = await connected();
    expect(socket.url).toBe('wss://broker.test/mqtt');
    expect(socket.protocols).toEqual(['mqtt']);
    expect(socket.binaryType).toBe('arraybuffer');
    expect(socket.sentOfType(TYPE.connect)).toHaveLength(1);
    expect(client.isOpen).toBe(true);
  });

  it('服务器拒绝连接', async () => {
    const { socket, connecting } = start();
    socket.open();
    socket.receive(CONNACK_REFUSED);
    expect(await failure(connecting)).toBe('refused');
    expect(socket.closed).toBe(true);
  });

  it('超时未连上', async () => {
    vi.useFakeTimers();
    const { socket, connecting } = start();
    const result = failure(connecting);
    socket.open();
    vi.advanceTimersByTime(TIMEOUT_MS);
    expect(await result).toBe('timeout');
    expect(socket.closed).toBe(true);
  });

  it('连上之前套接字关闭或收到非二进制数据', async () => {
    const dropped = start();
    dropped.socket.drop();
    expect(await failure(dropped.connecting)).toBe('closed');

    const garbled = start();
    garbled.socket.open();
    garbled.socket.receiveText('hello');
    expect(await failure(garbled.connecting)).toBe('protocol');
  });
});

describe('MQTT 客户端：订阅与消息', () => {
  it('订阅在 SUBACK 后完成；服务器拒绝订阅时失败', async () => {
    const { socket, client } = await connected();
    const subscribed = client.subscribe('room/1');
    const [first] = socket.sentOfType(TYPE.subscribe);
    if (first === undefined) throw new Error('应当发送 SUBSCRIBE');
    socket.receive(suback(packetIdOf(first)));
    await expect(subscribed).resolves.toBeUndefined();

    const refused = client.subscribe('room/2');
    const second = socket.sentOfType(TYPE.subscribe)[1];
    if (second === undefined) throw new Error('应当发送 SUBSCRIBE');
    expect(packetIdOf(second)).not.toBe(packetIdOf(first));
    socket.receive(suback(packetIdOf(second), 0x80));
    expect(await failure(refused)).toBe('subscribe');
  });

  it('发布与接收消息；QoS 1 的消息会被确认', async () => {
    const { socket, client, onMessage } = await connected();
    client.publish('room/1', Uint8Array.of(1, 2));
    expect(socket.sentOfType(TYPE.publish)).toEqual([encodePublish('room/1', Uint8Array.of(1, 2))]);

    socket.receive(encodePublish('room/1', Uint8Array.of(3)));
    expect(onMessage).toHaveBeenCalledWith('room/1', Uint8Array.of(3));

    socket.receive(Uint8Array.of(0x32, 6, 0, 1, 0x74, 0, 7, 9));
    expect(onMessage).toHaveBeenLastCalledWith('t', Uint8Array.of(9));
    expect(socket.sentOfType(TYPE.puback)).toEqual([Uint8Array.of(0x40, 2, 0, 7)]);
  });

  it('一条 WebSocket 消息中可以有多个报文', async () => {
    const { socket, onMessage } = await connected();
    const first = encodePublish('a', Uint8Array.of(1));
    const second = encodePublish('b', Uint8Array.of(2));
    const both = new Uint8Array(first.length + second.length);
    both.set(first);
    both.set(second, first.length);
    socket.receive(both);
    expect(onMessage.mock.calls.map(([topic]) => topic)).toEqual(['a', 'b']);
  });

  it('退订', async () => {
    const { socket, client } = await connected();
    client.unsubscribe('room/1');
    expect(socket.sentOfType(TYPE.unsubscribe)).toHaveLength(1);
  });
});

describe('MQTT 客户端：心跳与断开', () => {
  it('按心跳周期发送 PINGREQ；没有回应时视为断开', async () => {
    vi.useFakeTimers();
    const context = start();
    context.socket.open();
    context.socket.receive(CONNACK_OK);
    await context.connecting;
    const { socket, onClose } = context;

    vi.advanceTimersByTime(KEEP_ALIVE_SECONDS * 1000);
    expect(socket.sentOfType(TYPE.pingreq)).toHaveLength(1);
    socket.receive(PINGRESP);
    vi.advanceTimersByTime(KEEP_ALIVE_SECONDS * 1000);
    expect(socket.sentOfType(TYPE.pingreq)).toHaveLength(2);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(KEEP_ALIVE_SECONDS * 1000);
    expect(onClose).toHaveBeenCalledOnce();
    expect(socket.closed).toBe(true);
  });

  it('连接意外断开时通知一次，等待中的订阅失败', async () => {
    const { socket, client, onClose } = await connected();
    const pending = client.subscribe('room/1');
    socket.drop();
    expect(await failure(pending)).toBe('closed');
    expect(onClose).toHaveBeenCalledOnce();
    expect(client.isOpen).toBe(false);
  });

  it('收到格式错误的报文时断开', async () => {
    const { socket, onClose } = await connected();
    socket.receive(Uint8Array.of(0x20, 1, 0));
    expect(onClose).toHaveBeenCalledOnce();
    expect(socket.closed).toBe(true);
  });

  it('主动关闭时发送 DISCONNECT，不触发断开通知；之后的操作无效', async () => {
    const { socket, client, onClose } = await connected();
    client.close();
    client.close();
    expect(socket.sentOfType(TYPE.disconnect)).toHaveLength(1);
    expect(socket.closed).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(await failure(client.subscribe('room/1'))).toBe('closed');
    client.publish('room/1', Uint8Array.of(1));
    expect(socket.sentOfType(TYPE.publish)).toHaveLength(0);
  });
});
