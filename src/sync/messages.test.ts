import { describe, expect, it } from 'vitest';
import { SIGNAL_LIMITS } from './constants';
import { parseChannelMessage, parseSignal } from './messages';

const json = (value: unknown): string => JSON.stringify(value);

describe('信令消息', () => {
  it('解析合法的各类消息', () => {
    expect(
      parseSignal(
        json({
          kind: 'join',
          from: 'a1',
          to: null,
          protocol: 3,
          role: 'send',
          device: 'iPhone · Safari',
        }),
      ),
    ).toEqual({
      kind: 'join',
      from: 'a1',
      to: null,
      protocol: 3,
      role: 'send',
      device: 'iPhone · Safari',
    });
    expect(parseSignal(json({ kind: 'offer', from: 'a1', to: 'b2', sdp: 'v=0' }))?.kind).toBe(
      'offer',
    );
    expect(
      parseSignal(
        json({
          kind: 'candidate',
          from: 'a1',
          to: 'b2',
          candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        }),
      )?.kind,
    ).toBe('candidate');
    expect(parseSignal(json({ kind: 'reject', from: 'a1', to: 'b2', reason: 'busy' }))).not.toBe(
      null,
    );
  });

  it('只保留白名单中的字段', () => {
    const message = parseSignal(
      '{"kind":"leave","from":"a1","to":null,"__proto__":{"polluted":true},"extra":"<b>"}',
    );
    expect(message).toEqual({ kind: 'leave', from: 'a1', to: null });
    expect(Object.getPrototypeOf(message)).toBe(Object.prototype);
  });

  it('丢弃不认识的类型与非法取值', () => {
    expect(parseSignal(json({ kind: 'eval', from: 'a1', to: null }))).toBeNull();
    expect(parseSignal(json({ kind: 'leave', from: 'a1' }))).toBeNull();
    expect(parseSignal(json({ kind: 'leave', from: 'a/1', to: null }))).toBeNull();
    expect(
      parseSignal(json({ kind: 'reject', from: 'a1', to: 'b2', reason: 'whatever' })),
    ).toBeNull();
    expect(
      parseSignal(
        json({ kind: 'join', from: 'a1', to: null, protocol: 3, role: 'admin', device: null }),
      ),
    ).toBeNull();
  });

  it('设备描述只允许文字与少量标点（它会显示在对方界面上）', () => {
    const join = (device: unknown) =>
      parseSignal(json({ kind: 'join', from: 'a1', to: null, protocol: 3, role: 'send', device }));
    expect(join('Mac · Chrome')).not.toBeNull();
    expect(join(null)).not.toBeNull();
    expect(join('<img src=x onerror=alert(1)>')).toBeNull();
    expect(join('x'.repeat(SIGNAL_LIMITS.deviceChars + 1))).toBeNull();
  });

  it('先检查长度，再解析 JSON', () => {
    expect(parseSignal('{not json')).toBeNull();
    expect(parseSignal(' '.repeat(SIGNAL_LIMITS.messageChars + 1))).toBeNull();
    expect(
      parseSignal(
        json({ kind: 'offer', from: 'a1', to: 'b2', sdp: 'x'.repeat(SIGNAL_LIMITS.sdpChars + 1) }),
      ),
    ).toBeNull();
  });
});

describe('数据通道消息', () => {
  const push = {
    kind: 'push',
    id: 't1',
    mode: 'full',
    entries: 2,
    bytes: 100,
    chunks: 1,
    checksum: '0123456789abcdef',
  };

  it('解析推送头与控制消息', () => {
    expect(parseChannelMessage(json(push))).toEqual(push);
    expect(parseChannelMessage(json({ kind: 'cancel', id: 't1' }))?.kind).toBe('cancel');
    expect(parseChannelMessage(json({ kind: 'result', id: 't1', result: 'applied' }))?.kind).toBe(
      'result',
    );
    expect(parseChannelMessage(json({ kind: 'bye' }))?.kind).toBe('bye');
  });

  it('拒绝超出上限或格式错误的推送头', () => {
    expect(parseChannelMessage(json({ ...push, bytes: 0 }))).toBeNull();
    expect(parseChannelMessage(json({ ...push, bytes: 2 ** 40 }))).toBeNull();
    expect(parseChannelMessage(json({ ...push, mode: 'everything' }))).toBeNull();
    expect(parseChannelMessage(json({ ...push, checksum: 'XYZ' }))).toBeNull();
    expect(parseChannelMessage(json({ ...push, entries: 1.5 }))).toBeNull();
    expect(parseChannelMessage(json({ kind: 'result', id: 't1', result: 'ok' }))).toBeNull();
  });
});
