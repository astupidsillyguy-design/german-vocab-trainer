import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createSnapshot, EMPTY_LIBRARY, type Library } from '../domain';
import { makeEntry, TEST_NOW } from '../test/entries';
import { ControlledRepository } from '../test/repositories';
import type { ChangeChannel } from './channel';
import { DB_NAME, DB_VERSION, LIBRARY_KEY, STORE } from './constants';
import { StorageError } from './errors';
import { openDatabase, runTransaction } from './idb';
import { IndexedDbRepository, upgradeDatabase } from './IndexedDbRepository';
import { LibraryStore, type LibraryEvent, type LibraryStoreOptions } from './LibraryStore';
import { MemoryRepository } from './MemoryRepository';
import type { QuarantineDraft } from './records';

interface FakeChannel extends ChangeChannel {
  readonly post: ReturnType<typeof vi.fn<() => void>>;
  readonly close: ReturnType<typeof vi.fn<() => void>>;
  notify(): void;
}

function fakeChannel(): FakeChannel {
  const listeners = new Set<() => void>();
  return {
    post: vi.fn<() => void>(),
    close: vi.fn<() => void>(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify: () => {
      for (const listener of listeners) listener();
    },
  };
}

function uuidSequence(): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `cccccccc-0000-4000-8000-${String(count).padStart(12, '0')}`;
  };
}

interface Setup {
  readonly store: LibraryStore;
  readonly repository: ControlledRepository;
  readonly events: LibraryEvent[];
}

async function setup(
  options: Partial<LibraryStoreOptions> = {},
  repository = new ControlledRepository(),
): Promise<Setup> {
  const store = new LibraryStore({
    openRepository: () => Promise.resolve(repository),
    clock: () => TEST_NOW,
    newId: uuidSequence(),
    ...options,
  });
  const events: LibraryEvent[] = [];
  store.onEvent((event) => events.push(event));
  await store.load();
  return { store, repository, events };
}

const addToPool =
  (prompt: string) =>
  (library: Library): Library => ({
    ...library,
    pool: [...library.pool, makeEntry({ prompt })],
  });

const prompts = (library: Library): string[] => library.pool.map(({ prompt }) => prompt);

const LEGACY_REJECTED: QuarantineDraft = {
  source: 'legacy',
  issues: ['pool.0.prompt: invalid_type'],
  raw: { prompt: 42 },
};

describe('LibraryStore：加载', () => {
  it('加载前为 loading，加载后为 ready；重复调用只加载一次', async () => {
    const openRepository = vi.fn(() => Promise.resolve(new MemoryRepository()));
    const store = new LibraryStore({ openRepository });
    expect(store.getState().status).toBe('loading');
    await Promise.all([store.load(), store.load()]);
    expect(openRepository).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ status: 'ready', storage: 'memory' });
  });

  it('加载完成前修改会被拒绝', async () => {
    const store = new LibraryStore({
      openRepository: () => Promise.resolve(new MemoryRepository()),
    });
    await expect(store.update(addToPool('x'))).rejects.toThrow();
  });

  it('存储不可用时退回内存并发出事件，修改照常可用', async () => {
    const { store, events } = await setup({
      openRepository: () => Promise.reject(new DOMException('denied', 'SecurityError')),
    });
    expect(store.getState().storage).toBe('memory');
    expect(events).toEqual([
      { type: 'storage-unavailable', error: expect.any(StorageError) as StorageError },
    ]);
    expect(await store.update(addToPool('柜子'))).toEqual({ saved: true, snapshotId: null });
  });

  it('加载时发现坏数据：发出事件并记录数量，可以列出与清除', async () => {
    const factory = new IDBFactory();
    const database = await openDatabase({
      factory,
      name: DB_NAME,
      version: DB_VERSION,
      upgrade: upgradeDatabase,
    });
    await runTransaction(database.transaction([STORE.library], 'readwrite'), (transaction) => {
      transaction.objectStore(STORE.library).put([makeEntry(), { broken: true }], LIBRARY_KEY.pool);
    });
    database.close();

    const store = new LibraryStore({ openRepository: () => IndexedDbRepository.open({ factory }) });
    const events: LibraryEvent[] = [];
    store.onEvent((event) => events.push(event));
    await store.load();
    expect(events).toEqual([{ type: 'quarantined', count: 1 }]);
    expect(store.getState()).toMatchObject({ storage: 'indexeddb', quarantineCount: 1 });
    expect(store.getState().library.pool).toHaveLength(1);
    expect((await store.listQuarantine())[0]?.raw).toEqual({ broken: true });
    await store.clearQuarantine();
    expect(store.getState().quarantineCount).toBe(0);
    store.dispose();
  });
});

describe('LibraryStore：修改与写入', () => {
  it('乐观更新：状态立即变化，写入完成后标记为已保存', async () => {
    const { store, repository } = await setup();
    const listener = vi.fn();
    store.subscribe(listener);
    repository.hold();
    const pending = store.update(addToPool('柜子'));
    expect(prompts(store.getState().library)).toEqual(['柜子']);
    expect(store.getState().persistence).toBe('saving');
    repository.release();
    expect(await pending).toEqual({ saved: true, snapshotId: null });
    expect(store.getState().persistence).toBe('saved');
    expect(listener).toHaveBeenCalled();
  });

  it('写入期间的多次修改合并为一次写入', async () => {
    const { store, repository } = await setup();
    repository.hold();
    const first = store.update(addToPool('a'));
    const second = store.update(addToPool('b'));
    const third = store.update(addToPool('c'));
    repository.release();
    await Promise.all([first, second, third]);
    expect(repository.saves).toHaveLength(2);
    expect(prompts(repository.saves[1]?.library ?? EMPTY_LIBRARY)).toEqual(['a', 'b', 'c']);
    expect(prompts((await repository.load()).library)).toEqual(['a', 'b', 'c']);
  });

  it('只写入发生变化的部分；没有变化时不写入', async () => {
    const { store, repository } = await setup();
    await store.update(addToPool('a'));
    expect(repository.saves[0]?.changes).toEqual({ pool: true, archive: false, order: false });
    expect(await store.update((library) => library)).toEqual({ saved: true, snapshotId: null });
    expect(repository.saves).toHaveLength(1);
  });

  it('归档变化时自动整理排序表并一并写入', async () => {
    const { store, repository } = await setup();
    await store.update((library) => ({ ...library, archive: [makeEntry({ chapter: 'B1' })] }));
    expect(store.getState().library.order).toEqual([{ chapter: 'B1', lessons: ['第30讲'] }]);
    expect(repository.saves[0]?.changes).toEqual({ pool: false, archive: true, order: true });
  });

  it('第一次写入成功后调用 onFirstSave，只调用一次；每次成功写入都通知其他标签页', async () => {
    const onFirstSave = vi.fn();
    const channel = fakeChannel();
    const { store } = await setup({ onFirstSave, channel });
    await store.update(addToPool('a'));
    await store.update(addToPool('b'));
    expect(onFirstSave).toHaveBeenCalledTimes(1);
    expect(channel.post).toHaveBeenCalledTimes(2);
  });
});

describe('LibraryStore：写入失败（F-007）', () => {
  it('失败时保留内存中的修改并发出事件；重试成功后恢复', async () => {
    const channel = fakeChannel();
    const { store, repository, events } = await setup({ channel });
    repository.failure = new StorageError('quota');
    expect(await store.update(addToPool('a'))).toEqual({ saved: false, snapshotId: null });
    expect(prompts(store.getState().library)).toEqual(['a']);
    expect(store.getState()).toMatchObject({ persistence: 'failed' });
    expect(store.getState().lastError?.kind).toBe('quota');
    expect(events).toEqual([{ type: 'save-failed', error: repository.failure }]);
    expect(channel.post).not.toHaveBeenCalled();

    repository.failure = null;
    expect(await store.retry()).toBe(true);
    expect(store.getState()).toMatchObject({ persistence: 'saved', lastError: null });
    expect(events.at(-1)).toEqual({ type: 'save-recovered' });
    expect(prompts((await repository.load()).library)).toEqual(['a']);
  });

  it('失败后的下一次修改会把上次成功之后的全部变化一并写入', async () => {
    const { store, repository } = await setup();
    repository.failure = new StorageError('unknown');
    await store.update(addToPool('a'));
    repository.failure = null;
    await store.update((library) => ({ ...library, archive: [makeEntry({ prompt: 'b' })] }));
    expect(repository.saves.at(-1)?.changes).toEqual({ pool: true, archive: true, order: true });
    const saved = (await repository.load()).library;
    expect(prompts(saved)).toEqual(['a']);
    expect(saved.archive).toHaveLength(1);
  });

  it('非存储错误也会被归类', async () => {
    const { store, repository } = await setup();
    repository.failure = new StorageError('unknown', { cause: new Error('boom') });
    await store.update(addToPool('a'));
    expect(store.getState().lastError).toBeInstanceOf(StorageError);
  });
});

describe('LibraryStore：快照', () => {
  it('修改前保存快照，与修改一起写入', async () => {
    const { store, repository } = await setup();
    await store.update(addToPool('旧词'));
    const result = await store.update(
      (library) => ({ ...library, pool: [makeEntry({ prompt: '新词' })] }),
      { snapshot: 'replace-pool' },
    );
    expect(result.snapshotId).not.toBeNull();
    const [summary] = store.getState().snapshots;
    expect(summary).toEqual({
      id: result.snapshotId,
      createdAt: TEST_NOW.toISOString(),
      reason: 'replace-pool',
      counts: { pool: 1, archive: 0 },
    });
    expect(prompts(repository.saves.at(-1)?.snapshots[0]?.library ?? EMPTY_LIBRARY)).toEqual([
      '旧词',
    ]);
    expect(await repository.listSnapshots()).toEqual([summary]);
  });

  it('恢复快照，并能撤销恢复', async () => {
    const { store } = await setup();
    await store.update(addToPool('旧词'));
    const replaced = await store.update(
      (library) => ({ ...library, pool: [makeEntry({ prompt: '新词' })] }),
      { snapshot: 'replace-pool' },
    );
    const restored = await store.restoreSnapshot(replaced.snapshotId ?? '');
    expect(prompts(store.getState().library)).toEqual(['旧词']);
    expect(store.getState().snapshots[0]?.reason).toBe('restore');

    await store.restoreSnapshot(restored?.snapshotId ?? '', { saveCurrent: false });
    expect(prompts(store.getState().library)).toEqual(['新词']);
    // 撤销时不再额外保存快照
    expect(store.getState().snapshots.map(({ reason }) => reason)).toEqual([
      'restore',
      'replace-pool',
    ]);
  });

  it('写入失败时快照仍在内存中，可以恢复，并在重试时一并写入', async () => {
    const { store, repository } = await setup();
    await store.update(addToPool('旧词'));
    repository.failure = new StorageError('quota');
    const replaced = await store.update((library) => ({ ...library, pool: [] }), {
      snapshot: 'replace-pool',
    });
    await store.restoreSnapshot(replaced.snapshotId ?? '');
    expect(prompts(store.getState().library)).toEqual(['旧词']);
    repository.failure = null;
    await store.retry();
    expect((await repository.listSnapshots()).map(({ reason }) => reason)).toEqual([
      'replace-pool',
      'restore',
    ]);
  });

  it('附带的历史快照与隔离数据与修改一起写入；历史快照排在本次快照之后', async () => {
    const { store, repository } = await setup();
    await store.update(addToPool('旧词'));
    const backup = createSnapshot(EMPTY_LIBRARY, 'legacy-backup', {
      id: 'dddddddd-0000-4000-8000-000000000001',
      now: TEST_NOW,
    });
    const result = await store.update(addToPool('新词'), {
      snapshot: 'import',
      history: [backup],
      quarantine: [LEGACY_REJECTED],
    });
    expect(store.getState().snapshots.map(({ reason }) => reason)).toEqual([
      'import',
      'legacy-backup',
    ]);
    expect(store.getState().quarantineCount).toBe(1);
    expect(repository.saves.at(-1)?.snapshots.map(({ id }) => id)).toEqual([
      backup.id,
      result.snapshotId,
    ]);
    expect(repository.saves.at(-1)?.quarantine).toEqual([LEGACY_REJECTED]);
    expect((await repository.listQuarantine()).map(({ raw }) => raw)).toEqual([
      LEGACY_REJECTED.raw,
    ]);
  });

  it('词库没有变化时，附带的隔离数据也会写入', async () => {
    const { store, repository } = await setup();
    await store.update((library) => library, { quarantine: [LEGACY_REJECTED] });
    expect(repository.saves).toHaveLength(1);
    expect(await repository.countQuarantine()).toBe(1);
  });

  it('写入失败时隔离数据留在内存中，重试时写入且只写一次', async () => {
    const { store, repository } = await setup();
    repository.failure = new StorageError('quota');
    await store.update(addToPool('新词'), { quarantine: [LEGACY_REJECTED] });
    expect(store.getState().quarantineCount).toBe(1);
    repository.failure = null;
    await store.retry();
    await store.update(addToPool('又一个'));
    expect(await repository.countQuarantine()).toBe(1);
    expect(repository.saves.at(-1)?.quarantine).toEqual([]);
  });

  it('快照不存在时返回 null', async () => {
    const { store } = await setup();
    expect(await store.restoreSnapshot('missing')).toBeNull();
  });
});

describe('LibraryStore：多标签页', () => {
  it('没有未保存的修改时，其他标签页的修改会被重新读取', async () => {
    const shared = new ControlledRepository();
    const channel = fakeChannel();
    const { store } = await setup({ channel }, shared);
    const other = await setup({}, shared);
    await other.store.update(addToPool('别处'));
    channel.notify();
    await vi.waitFor(() => {
      expect(prompts(store.getState().library)).toEqual(['别处']);
    });
  });

  it('有未保存的修改时忽略外部通知，避免丢失本页修改', async () => {
    const shared = new ControlledRepository();
    const channel = fakeChannel();
    const { store } = await setup({ channel }, shared);
    shared.failure = new StorageError('quota');
    await store.update(addToPool('本页'));
    shared.failure = null;
    const other = await setup({}, shared);
    await other.store.update(addToPool('别处'));
    channel.notify();
    await Promise.resolve();
    expect(prompts(store.getState().library)).toEqual(['本页']);
  });

  it('dispose 取消订阅并关闭通道', async () => {
    const channel = fakeChannel();
    const { store } = await setup({ channel });
    store.dispose();
    expect(channel.close).toHaveBeenCalledTimes(1);
  });
});

describe('LibraryStore：应用状态', () => {
  it('readState 等待加载完成；不存在时返回 undefined', async () => {
    const repository = new ControlledRepository();
    const store = new LibraryStore({ openRepository: () => Promise.resolve(repository) });
    expect(await store.readState('quiz')).toBeUndefined();
    expect(store.getState().status).toBe('ready');
  });

  it('加载完成前的写入被忽略', async () => {
    const store = new LibraryStore({
      openRepository: () => Promise.resolve(new MemoryRepository()),
    });
    expect(await store.writeState('quiz', 1)).toBe(false);
  });

  it('同一个键串行写入：等待期间的多次写入只保留最后一次', async () => {
    const { store, repository } = await setup();
    repository.hold();
    const first = store.writeState('quiz', 1);
    const second = store.writeState('quiz', 2);
    const third = store.writeState('quiz', 3);
    expect(second).toBe(first);
    repository.release();
    expect(await Promise.all([first, second, third])).toEqual([true, true, true]);
    expect(repository.stateWrites).toEqual([
      ['quiz', 1],
      ['quiz', 3],
    ]);
    expect(await store.readState('quiz')).toBe(3);

    // 上一轮结束后的写入开始新的一轮
    await store.writeState('quiz', null);
    expect(await store.readState('quiz')).toBeUndefined();
  });

  it('写入失败返回 false，不影响词库的保存状态，也不发出通知', async () => {
    const { store, repository, events } = await setup();
    repository.failure = new StorageError('quota');
    expect(await store.writeState('quiz', 1)).toBe(false);
    expect(store.getState().persistence).toBe('saved');
    expect(events).toEqual([]);
  });
});
