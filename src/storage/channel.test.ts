import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChangeChannel, type ChangeChannel } from './channel';

const NAME = 'gvt:test-channel';
let channels: ChangeChannel[] = [];

afterEach(() => {
  for (const channel of channels) channel.close();
  channels = [];
});

function open(origin: string): ChangeChannel {
  const channel = createChangeChannel(NAME, origin);
  if (channel === null) throw new Error('测试环境缺少 BroadcastChannel');
  channels.push(channel);
  return channel;
}

describe('createChangeChannel', () => {
  it('通知其他标签页，不通知自己', async () => {
    const sender = open('a');
    const receiver = open('b');
    const onSender = vi.fn();
    const onReceiver = vi.fn();
    sender.subscribe(onSender);
    receiver.subscribe(onReceiver);
    sender.post();
    await vi.waitFor(() => {
      expect(onReceiver).toHaveBeenCalledTimes(1);
    });
    expect(onSender).not.toHaveBeenCalled();
  });

  it('忽略格式不符的消息；取消订阅后不再通知', async () => {
    const receiver = open('b');
    const listener = vi.fn();
    const unsubscribe = receiver.subscribe(listener);
    const raw = new BroadcastChannel(NAME);
    raw.postMessage('library-changed');
    raw.postMessage({ type: 'other', origin: 'x' });
    unsubscribe();
    open('c').post();
    await new Promise((resolve) => setTimeout(resolve, 20));
    raw.close();
    expect(listener).not.toHaveBeenCalled();
  });

  it('环境不支持 BroadcastChannel 时返回 null', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(createChangeChannel(NAME)).toBeNull();
    vi.unstubAllGlobals();
  });
});
