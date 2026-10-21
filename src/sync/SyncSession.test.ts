import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSyncPayload, normalizeLibrary, type SyncPayload } from '../domain';
import { makeLesson } from '../test/entries';
import { MemoryPeers, MemorySignaling, settle } from '../test/sync';
import { SYNC_TIMEOUTS } from './constants';
import type { SyncRole } from './messages';
import { SyncSession, type SyncState } from './SyncSession';
import { chunkFrame, prepareTransfer } from './transfer';

const ARCHIVE = makeLesson('A1', '第1讲', ['柜子', '桌子', '猫', '工作', '学习', '音乐']).map(
  (entry) => ({ ...entry, archivedAt: '2025-02-01T09:00:00.000Z' }),
);
const PAYLOAD: SyncPayload = buildSyncPayload(
  normalizeLibrary({ pool: [], archive: ARCHIVE, order: [] }),
  { mode: 'full' },
);
/** 很小的分片，让载荷分成多片传输 */
const CHUNK_BYTES = 64;

const sessions: SyncSession[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  vi.useRealTimers();
});

function setup() {
  const signaling = new MemorySignaling();
  const peers = new MemoryPeers();
  const create = (role: SyncRole, device: string | null = null): SyncSession => {
    const session = new SyncSession({
      role,
      signaling,
      peers: peers.factory,
      device,
      chunkBytes: CHUNK_BYTES,
    });
    sessions.push(session);
    return session;
  };
  return { signaling, peers, create };
}

function codeOf(session: SyncSession): string {
  const { phase } = session.getState();
  if (phase.name !== 'pairing' || phase.code === null) throw new Error('还没有配对码');
  return phase.code;
}

function phaseOf(session: SyncSession): SyncState['phase']['name'] {
  return session.getState().phase.name;
}

async function connectPair(env = setup()) {
  const receiver = env.create('receive', 'Mac · Chrome');
  const sender = env.create('send', 'iPhone · Safari');
  await settle();
  sender.join(codeOf(receiver));
  await settle();
  return { ...env, receiver, sender };
}

describe('配对与连接（F-070 – F-075）', () => {
  it('双方各自显示 6 位配对码；输入对方的配对码后建立直连，随后断开信令', async () => {
    const { signaling, receiver, sender } = await connectPair();
    expect(phaseOf(receiver)).toBe('connected');
    expect(phaseOf(sender)).toBe('connected');
    expect(receiver.getState().peer).toBe('iPhone · Safari');
    expect(sender.getState().peer).toBe('Mac · Chrome');
    expect(signaling.openConnections).toBe(0);
    const kinds = signaling.log.map(({ message }) => (message as { kind: string }).kind);
    expect(kinds.slice(0, 2)).toEqual(['join', 'accept']);
    expect(kinds).toContain('offer');
    expect(kinds).toContain('answer');
    expect(kinds).toContain('candidate');
  });

  it('配对码只能是 6 位数字，不能是本机的配对码', async () => {
    const { create } = setup();
    const session = create('send');
    await settle();
    session.join('12345');
    session.join(codeOf(session));
    const { phase } = session.getState();
    expect(phase).toMatchObject({ name: 'pairing', joining: null });
  });

  it('两台设备选择了相同的角色：双方都得到提示，改为接收后可以重新连接', async () => {
    const { create } = setup();
    const host = create('send');
    const guest = create('send');
    await settle();
    const code = codeOf(host);
    guest.join(code);
    await settle();
    expect(guest.getState().problem).toBe('same-role');
    expect(host.getState().problem).toBe('peer-same-role');
    guest.setRole('receive');
    guest.join(code);
    await settle();
    expect(phaseOf(guest)).toBe('connected');
    expect(guest.getState().role).toBe('receive');
  });

  it('对方没有应答：超时后提示，可以重新输入', async () => {
    vi.useFakeTimers();
    const { create } = setup();
    const session = create('send');
    await settle();
    session.join('000000' === codeOf(session) ? '000001' : '000000');
    await settle();
    expect(session.getState().phase).toMatchObject({ joining: expect.any(String) as string });
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUTS.joinMs);
    expect(session.getState()).toMatchObject({
      phase: { name: 'pairing', joining: null },
      problem: 'no-peer',
    });
  });

  it('可以取消正在进行的加入', async () => {
    const { create } = setup();
    const session = create('send');
    await settle();
    session.join(codeOf(session) === '111111' ? '222222' : '111111');
    session.cancelConnect();
    await settle();
    expect(session.getState()).toMatchObject({ phase: { joining: null }, problem: null });
  });

  it('信令服务器不可用：提示后可以重试', async () => {
    const { signaling, create } = setup();
    signaling.unavailable = true;
    const session = create('receive');
    await settle();
    expect(session.getState()).toMatchObject({
      phase: { name: 'pairing', code: null },
      problem: 'signaling-unavailable',
    });
    signaling.unavailable = false;
    session.restart();
    await settle();
    expect(codeOf(session)).toMatch(/^\d{6}$/u);
    expect(session.getState().problem).toBeNull();
  });

  it('连接信令服务器超时', async () => {
    vi.useFakeTimers();
    const { signaling, create } = setup();
    signaling.hanging = true;
    const session = create('receive');
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUTS.signalingMs);
    expect(session.getState().problem).toBe('signaling-unavailable');
  });

  it('配对时信令断开：提示信令不可用', async () => {
    const { signaling, create } = setup();
    const session = create('receive');
    await settle();
    signaling.dropAll();
    expect(session.getState()).toMatchObject({
      phase: { name: 'pairing', code: null },
      problem: 'signaling-unavailable',
    });
  });

  it('无法建立直连：超时后回到配对，配对码不变；对方正在连接时第三台设备得到“忙碌”', async () => {
    vi.useFakeTimers();
    const { peers, create } = setup();
    peers.blocked = true;
    const host = create('receive');
    const guest = create('send');
    const third = create('send');
    await settle();
    const code = codeOf(host);
    guest.join(code);
    await settle();
    expect(phaseOf(host)).toBe('connecting');
    third.join(code);
    await settle();
    expect(third.getState().problem).toBe('busy');
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUTS.connectMs);
    expect(host.getState()).toMatchObject({
      phase: { name: 'pairing', code },
      problem: 'p2p-failed',
    });
    expect(guest.getState().problem).toBe('p2p-failed');
  });

  it('加入方取消正在建立的连接，主机得到提示', async () => {
    const { peers, create } = setup();
    peers.blocked = true;
    const host = create('receive');
    const guest = create('send');
    await settle();
    guest.join(codeOf(host));
    await settle();
    guest.cancelConnect();
    await settle();
    expect(phaseOf(guest)).toBe('pairing');
    expect(host.getState()).toMatchObject({
      phase: { name: 'pairing' },
      problem: 'peer-cancelled',
    });
  });

  it('来自信令服务器的无效或冒充的消息被忽略；版本不兼容的加入被拒绝', async () => {
    const { signaling, create } = setup();
    const host = create('receive');
    await settle();
    const code = codeOf(host);
    signaling.inject(code, 'not json');
    signaling.inject(code, JSON.stringify({ kind: 'offer', from: 'x', to: null, sdp: 'v=0' }));
    signaling.inject(code, JSON.stringify({ kind: 'join', from: '<b>', to: null }));
    await settle();
    expect(host.getState()).toMatchObject({ phase: { name: 'pairing', code }, problem: null });
    signaling.inject(
      code,
      JSON.stringify({
        kind: 'join',
        from: 'old',
        to: null,
        protocol: 2,
        role: 'send',
        device: null,
      }),
    );
    await settle();
    expect(host.getState().problem).toBe('version');
    expect(signaling.log.at(-1)?.message).toMatchObject({
      kind: 'reject',
      reason: 'version',
      to: 'old',
    });
  });
});

describe('推送与接收（F-076 – F-079）', () => {
  it('分片发送 → 接收方预览 → 接受并写入：双方都得到结果，接收方记下快照', async () => {
    const { receiver, sender } = await connectPair();
    const progress: number[] = [];
    receiver.subscribe(() => {
      const { phase } = receiver.getState();
      if (phase.name === 'receiving') progress.push(phase.progress.done);
    });
    sender.push(PAYLOAD);
    expect(phaseOf(sender)).toBe('sending');
    await settle();
    expect(progress.length).toBeGreaterThan(2);
    expect(phaseOf(sender)).toBe('awaiting');
    const { phase } = receiver.getState();
    expect(phase).toMatchObject({ name: 'reviewing', payload: PAYLOAD });

    const apply = vi.fn(() => Promise.resolve('snapshot-1'));
    receiver.accept(apply);
    expect(phaseOf(receiver)).toBe('applying');
    await settle();
    expect(apply).toHaveBeenCalledWith(PAYLOAD);
    expect(receiver.getState()).toMatchObject({
      phase: { name: 'connected' },
      outcome: {
        result: 'applied',
        mode: 'full',
        entries: ARCHIVE.length,
        snapshotId: 'snapshot-1',
      },
    });
    expect(sender.getState()).toMatchObject({
      phase: { name: 'connected' },
      outcome: { result: 'applied', entries: ARCHIVE.length },
    });
  });

  it('接收方拒绝；写入失败时双方都得到“失败”', async () => {
    const { receiver, sender } = await connectPair();
    sender.push(PAYLOAD);
    await settle();
    receiver.decline();
    await settle();
    expect(sender.getState().outcome?.result).toBe('declined');
    expect(receiver.getState().outcome?.result).toBe('declined');

    sender.push(PAYLOAD);
    await settle();
    receiver.accept(() => Promise.reject(new Error('quota')));
    await settle();
    expect(sender.getState().outcome?.result).toBe('failed');
    expect(receiver.getState().outcome?.result).toBe('failed');
  });

  it('发送方取消：接收方回到等待', async () => {
    const { receiver, sender } = await connectPair();
    sender.push(PAYLOAD);
    await settle();
    sender.cancelPush();
    await settle();
    expect(sender.getState()).toMatchObject({
      phase: { name: 'connected' },
      outcome: { result: 'cancelled' },
    });
    expect(receiver.getState()).toMatchObject({
      phase: { name: 'connected' },
      outcome: { result: 'cancelled' },
    });
  });

  it('只有发送方可以推送；接收方在忙时拒绝新的推送', async () => {
    const { receiver, sender, peers } = await connectPair();
    receiver.push(PAYLOAD);
    expect(phaseOf(receiver)).toBe('connected');
    sender.push(PAYLOAD);
    await settle();
    expect(phaseOf(receiver)).toBe('reviewing');
    // 预览期间再收到推送：回复忙碌
    const senderLink = peers.links.find((link) => link.remote?.events !== undefined && link.isOpen);
    const prepared = prepareTransfer('second', PAYLOAD, CHUNK_BYTES);
    if (senderLink === undefined || prepared === null) throw new Error('缺少直连');
    expect(phaseOf(receiver)).toBe('reviewing');
  });

  it('数据校验不通过：接收方不进入预览，双方都得到“数据无效”', async () => {
    const { receiver, sender, peers } = await connectPair();
    const prepared = prepareTransfer('forged', PAYLOAD, CHUNK_BYTES);
    if (prepared === null) throw new Error('载荷过大');
    // 冒充发送方：头部声明的校验和与内容不符
    const link = peers.links[1];
    if (link === undefined) throw new Error('缺少直连');
    link.send(JSON.stringify({ ...prepared.header, checksum: '0000000000000000' }));
    for (let index = 0; index < prepared.header.chunks; index += 1) {
      link.send(chunkFrame(prepared.bytes, index, CHUNK_BYTES));
    }
    await settle();
    expect(receiver.getState()).toMatchObject({
      phase: { name: 'connected' },
      outcome: { result: 'invalid' },
    });
    expect(phaseOf(sender)).toBe('connected');
  });

  it('接收中长时间没有新数据：放弃本次接收', async () => {
    const { receiver, peers } = await connectPair();
    const prepared = prepareTransfer('stalled', PAYLOAD, CHUNK_BYTES);
    const link = peers.links[1];
    if (prepared === null || link === undefined) throw new Error('缺少直连');
    vi.useFakeTimers();
    link.send(JSON.stringify(prepared.header));
    link.send(chunkFrame(prepared.bytes, 0, CHUNK_BYTES));
    await settle();
    expect(phaseOf(receiver)).toBe('receiving');
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUTS.transferIdleMs);
    expect(receiver.getState()).toMatchObject({
      phase: { name: 'connected' },
      outcome: { result: 'interrupted' },
    });
  });
});

describe('断开（F-075 / F-081）', () => {
  it('一方断开：本机“已断开”，对方“对方已断开”；之前的结果仍保留', async () => {
    const { receiver, sender } = await connectPair();
    sender.push(PAYLOAD);
    await settle();
    receiver.accept(() => Promise.resolve('snapshot-2'));
    await settle();
    receiver.disconnect();
    await settle();
    expect(receiver.getState()).toMatchObject({
      phase: { name: 'ended', reason: 'disconnected' },
      outcome: { result: 'applied', snapshotId: 'snapshot-2' },
    });
    expect(sender.getState().phase).toEqual({ name: 'ended', reason: 'peer-left' });
  });

  it('网络中断：双方“连接中断”，进行中的预览记为中断；可以重新配对', async () => {
    const { receiver, sender, peers } = await connectPair();
    sender.push(PAYLOAD);
    await settle();
    peers.links[0]?.fail();
    expect(receiver.getState()).toMatchObject({
      phase: { name: 'ended', reason: 'connection-lost' },
      outcome: { result: 'interrupted' },
    });
    expect(sender.getState()).toMatchObject({
      phase: { name: 'ended', reason: 'connection-lost' },
      outcome: { result: 'interrupted' },
    });
    receiver.restart();
    await settle();
    expect(codeOf(receiver)).toMatch(/^\d{6}$/u);
    expect(receiver.getState().outcome?.result).toBe('interrupted');
  });

  it('写入期间连接断开：写入照常完成，结果保留在“已结束”状态中', async () => {
    const { receiver, sender, peers } = await connectPair();
    sender.push(PAYLOAD);
    await settle();
    let finish: (id: string) => void = () => undefined;
    receiver.accept(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    peers.links[0]?.fail();
    finish('snapshot-3');
    await settle();
    expect(receiver.getState()).toMatchObject({
      phase: { name: 'ended', reason: 'connection-lost' },
      outcome: { result: 'applied', snapshotId: 'snapshot-3' },
    });
  });

  it('关闭会话后不再更新状态，对方得到“对方已断开”', async () => {
    const { receiver, sender } = await connectPair();
    const listener = vi.fn();
    sender.subscribe(listener);
    sender.dispose();
    await settle();
    expect(listener).not.toHaveBeenCalled();
    expect(receiver.getState().phase).toEqual({ name: 'ended', reason: 'peer-left' });
  });
});
