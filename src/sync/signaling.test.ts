import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONNACK_OK, fakeSockets, packetIdOf, suback } from '../test/mqtt';
import { settle } from '../test/sync';
import { encodePublish } from './mqtt/packets';
import {
  broadcastSignaling,
  mqttSignaling,
  type SignalingConnection,
  type SignalingEvents,
} from './signaling';

const SUBSCRIBE = 8;
const PUBLISH = 3;
const NAMESPACE = 'test/sync';

const connections: SignalingConnection[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
});

function events() {
  return {
    onMessage: vi.fn<SignalingEvents['onMessage']>(),
    onDrop: vi.fn<SignalingEvents['onDrop']>(),
  };
}

async function mqtt() {
  const { sockets, factory } = fakeSockets();
  const handlers = events();
  const connecting = mqttSignaling({
    url: 'wss://broker.test/mqtt',
    namespace: NAMESPACE,
    createSocket: factory,
  }).connect(handlers);
  const socket = sockets[0];
  if (socket === undefined) throw new Error('应当创建套接字');
  socket.open();
  socket.receive(CONNACK_OK);
  const connection = await connecting;
  connections.push(connection);
  return { socket, connection, ...handlers };
}

describe('MQTT 信令', () => {
  it('房间对应命名空间下的主题', async () => {
    const { socket, connection } = await mqtt();
    const joined = connection.join('123456');
    const [subscribe] = socket.sentOfType(SUBSCRIBE);
    if (subscribe === undefined) throw new Error('应当发送 SUBSCRIBE');
    expect(new TextDecoder().decode(subscribe)).toContain(`${NAMESPACE}/123456`);
    socket.receive(suback(packetIdOf(subscribe)));
    await expect(joined).resolves.toBeUndefined();

    connection.send('123456', '{"kind":"leave"}');
    expect(socket.sentOfType(PUBLISH)).toEqual([
      encodePublish(`${NAMESPACE}/123456`, new TextEncoder().encode('{"kind":"leave"}')),
    ]);
  });

  it('只转发本命名空间、合法 UTF-8 的消息', async () => {
    const { socket, onMessage } = await mqtt();
    socket.receive(encodePublish(`${NAMESPACE}/123456`, new TextEncoder().encode('hi')));
    socket.receive(encodePublish('other/123456', new TextEncoder().encode('spam')));
    socket.receive(encodePublish(`${NAMESPACE}/123456`, Uint8Array.of(0xff, 0xfe)));
    expect(onMessage.mock.calls).toEqual([['123456', 'hi']]);
  });

  it('连接意外断开时通知', async () => {
    const { socket, onDrop } = await mqtt();
    socket.drop();
    expect(onDrop).toHaveBeenCalledOnce();
  });
});

describe('BroadcastChannel 信令', () => {
  async function pair() {
    const adapter = broadcastSignaling(`test:${crypto.randomUUID()}`);
    const first = events();
    const second = events();
    const a = await adapter.connect(first);
    const b = await adapter.connect(second);
    connections.push(a, b);
    return { a, b, first, second };
  }

  it('同一房间内的其他连接收到消息，发送者自己收不到', async () => {
    const { a, b, first, second } = await pair();
    await a.join('111111');
    await b.join('111111');
    b.send('111111', 'hello');
    await vi.waitFor(() => {
      expect(first.onMessage).toHaveBeenCalledWith('111111', 'hello');
    });
    await settle();
    expect(second.onMessage).not.toHaveBeenCalled();
  });

  it('未加入房间也能发送；离开房间后不再接收', async () => {
    const { a, b, first } = await pair();
    await a.join('222222');
    b.send('222222', 'one');
    await vi.waitFor(() => {
      expect(first.onMessage).toHaveBeenCalledTimes(1);
    });
    a.leave('222222');
    b.send('222222', 'two');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(first.onMessage).toHaveBeenCalledTimes(1);
  });

  it('不同房间互不干扰', async () => {
    const { a, b, first } = await pair();
    await a.join('333333');
    await b.join('444444');
    b.send('444444', 'elsewhere');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(first.onMessage).not.toHaveBeenCalled();
  });
});
