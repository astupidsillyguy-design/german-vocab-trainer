import { describe, expect, it, vi } from 'vitest';
import { UpdateChannel } from './updateChannel';

describe('UpdateChannel', () => {
  it('没有新版本时快照为 null', () => {
    expect(new UpdateChannel().getSnapshot()).toBeNull();
  });

  it('提供新版本后通知订阅者，快照是让它接管的函数', () => {
    const channel = new UpdateChannel();
    const listener = vi.fn();
    channel.subscribe(listener);
    const apply = vi.fn();

    channel.offer(apply);

    expect(listener).toHaveBeenCalledTimes(1);
    channel.getSnapshot()?.();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('取消订阅后不再通知', () => {
    const channel = new UpdateChannel();
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    unsubscribe();
    channel.offer(vi.fn());
    expect(listener).not.toHaveBeenCalled();
  });
});
