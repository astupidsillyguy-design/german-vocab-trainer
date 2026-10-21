import { describe, expect, it, vi } from 'vitest';
import {
  TOAST_MAX_VISIBLE,
  TOAST_TIMEOUT_MS,
  TOAST_TIMEOUT_WITH_ACTION_MS,
  ToastQueue,
} from './toastQueue';

describe('ToastQueue', () => {
  it('show 返回唯一 id，并按默认值补全字段', () => {
    const queue = new ToastQueue();
    const first = queue.show({ title: 'A' });
    const second = queue.show({ title: 'B', action: { label: '撤销', onAction: vi.fn() } });
    expect(first).not.toBe(second);
    const [a, b] = queue.getSnapshot();
    expect(a).toMatchObject({ title: 'A', tone: 'neutral', timeoutMs: TOAST_TIMEOUT_MS });
    expect(b?.timeoutMs).toBe(TOAST_TIMEOUT_WITH_ACTION_MS);
  });

  it('timeoutMs: null 表示不自动关闭', () => {
    const queue = new ToastQueue();
    queue.show({ title: 'A', timeoutMs: null });
    expect(queue.getSnapshot()[0]?.timeoutMs).toBeNull();
  });

  it('超过上限时先进先出排队', () => {
    const queue = new ToastQueue();
    const ids = Array.from({ length: TOAST_MAX_VISIBLE + 2 }, (_, index) =>
      queue.show({ title: String(index) }),
    );
    expect(queue.getSnapshot().map((toast) => toast.title)).toEqual(['0', '1', '2']);
    expect(queue.pendingCount).toBe(2);

    queue.dismiss(ids[0] ?? '');
    expect(queue.getSnapshot().map((toast) => toast.title)).toEqual(['1', '2', '3']);
  });

  it('快照在两次变更之间引用稳定', () => {
    const queue = new ToastQueue();
    queue.show({ title: 'A' });
    expect(queue.getSnapshot()).toBe(queue.getSnapshot());
  });

  it('订阅者在变更时收到通知，取消订阅后不再收到', () => {
    const queue = new ToastQueue();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);
    const id = queue.show({ title: 'A' });
    queue.dismiss(id);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    queue.show({ title: 'B' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('关闭不存在的 id 或清空空队列不会通知', () => {
    const queue = new ToastQueue();
    const listener = vi.fn();
    queue.subscribe(listener);
    queue.dismiss('missing');
    queue.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it('clear 清空全部', () => {
    const queue = new ToastQueue({ maxVisible: 1 });
    queue.show({ title: 'A' });
    queue.show({ title: 'B' });
    queue.clear();
    expect(queue.getSnapshot()).toEqual([]);
    expect(queue.pendingCount).toBe(0);
  });
});
