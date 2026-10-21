import { describe, expect, it, vi } from 'vitest';
import { EMPTY_LIBRARY } from '../domain';
import { LibraryStore, type LibraryEvent } from './LibraryStore';
import { MemoryRepository } from './MemoryRepository';

function quarantiningStore(): LibraryStore {
  const repository = new MemoryRepository();
  vi.spyOn(repository, 'load').mockResolvedValue({ library: EMPTY_LIBRARY, quarantined: 1 });
  return new LibraryStore({ openRepository: () => Promise.resolve(repository) });
}

describe('LibraryStore：先预加载、后订阅通知', () => {
  it('保留预加载时的隔离告警，只向第一个订阅者交付一次', async () => {
    const store = quarantiningStore();
    await store.load();
    const events: LibraryEvent[] = [];
    const unsubscribe = store.onEvent((event) => events.push(event));
    expect(events).toEqual([{ type: 'quarantined', count: 1 }]);
    unsubscribe();
    const remounted = vi.fn();
    store.onEvent(remounted);
    await store.load();
    expect(remounted).not.toHaveBeenCalled();
    store.dispose();
  });

  it('存储不可用的常驻告警也不会因提前加载而丢失', async () => {
    const store = new LibraryStore({
      openRepository: () => Promise.reject(new DOMException('denied', 'SecurityError')),
    });
    await store.load();
    const events: LibraryEvent[] = [];
    store.onEvent((event) => events.push(event));
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('storage-unavailable');
    expect(store.getState().storage).toBe('memory');
    store.dispose();
  });

  it('已经订阅时立即交付，不向后来订阅者重复播报', async () => {
    const store = quarantiningStore();
    const first = vi.fn();
    store.onEvent(first);
    await store.load();
    expect(first).toHaveBeenCalledExactlyOnceWith({ type: 'quarantined', count: 1 });
    const second = vi.fn();
    store.onEvent(second);
    expect(second).not.toHaveBeenCalled();
    store.dispose();
  });
});
