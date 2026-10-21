import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSnapshot,
  EMPTY_LIBRARY,
  SNAPSHOT_LIMIT,
  type Library,
  type LibraryChanges,
} from '../domain';
import { makeEntry, TEST_NOW } from '../test/entries';
import { DB_NAME, DB_VERSION, LIBRARY_KEY, STORE } from './constants';
import { StorageError } from './errors';
import { openDatabase, requestResult, runTransaction } from './idb';
import { IndexedDbRepository, upgradeDatabase } from './IndexedDbRepository';

const ALL_CHANGED: LibraryChanges = { pool: true, archive: true, order: true };

let opened: IndexedDbRepository[] = [];

afterEach(() => {
  for (const repository of opened) repository.close();
  opened = [];
});

/** 生成合法 UUID 的确定性序列（快照 id 必须是 UUID） */
function uuidSequence(): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `aaaaaaaa-0000-4000-8000-${String(count).padStart(12, '0')}`;
  };
}

async function openRepository(factory: IDBFactory, onVersionChange?: () => void) {
  const repository = await IndexedDbRepository.open({
    factory,
    clock: () => TEST_NOW,
    newId: uuidSequence(),
    ...(onVersionChange === undefined ? {} : { onVersionChange }),
  });
  opened.push(repository);
  return repository;
}

/** 绕过仓库直接读写数据库，模拟旧版本或被外部修改的数据 */
async function withDatabase<T>(
  factory: IDBFactory,
  stores: readonly string[],
  body: (transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const database = await openDatabase({
    factory,
    name: DB_NAME,
    version: DB_VERSION,
    upgrade: upgradeDatabase,
  });
  try {
    return await runTransaction(database.transaction(stores, 'readwrite'), body);
  } finally {
    database.close();
  }
}

function seedLibrary(
  factory: IDBFactory,
  values: Partial<Record<keyof typeof LIBRARY_KEY, unknown>>,
) {
  return withDatabase(factory, [STORE.library], (transaction) => {
    const store = transaction.objectStore(STORE.library);
    for (const [key, value] of Object.entries(values)) store.put(value, key);
  });
}

function rawValue(factory: IDBFactory, store: string, key: string) {
  return withDatabase(factory, [store], (transaction) =>
    requestResult<unknown>(transaction.objectStore(store).get(key)),
  );
}

function countRecords(factory: IDBFactory, store: string) {
  return withDatabase(factory, [store], (transaction) =>
    requestResult(transaction.objectStore(store).count()),
  );
}

const sampleLibrary = (): Library => {
  const archived = makeEntry({ chapter: 'B1', archivedAt: TEST_NOW.toISOString() });
  return {
    pool: [makeEntry(), makeEntry({ prompt: '桌子', answers: ['der Tisch'] })],
    archive: [archived],
    order: [{ chapter: 'B1', lessons: ['第30讲'] }],
  };
};

describe('IndexedDbRepository', () => {
  it('新数据库加载为空词库', async () => {
    const repository = await openRepository(new IDBFactory());
    expect(await repository.load()).toEqual({ library: EMPTY_LIBRARY, quarantined: 0 });
    expect(await repository.listSnapshots()).toEqual([]);
    expect(await repository.countQuarantine()).toBe(0);
  });

  it('保存后重新打开能完整读回', async () => {
    const factory = new IDBFactory();
    const library = sampleLibrary();
    const first = await openRepository(factory);
    await first.save({ library, changes: ALL_CHANGED, snapshots: [] });
    first.close();
    const second = await openRepository(factory);
    expect((await second.load()).library).toEqual(library);
  });

  it('只写入发生变化的部分', async () => {
    const factory = new IDBFactory();
    const repository = await openRepository(factory);
    const library = sampleLibrary();
    await repository.save({ library, changes: ALL_CHANGED, snapshots: [] });
    await repository.save({
      library: { ...EMPTY_LIBRARY, pool: [] },
      changes: { pool: true, archive: false, order: false },
      snapshots: [],
    });
    const loaded = (await repository.load()).library;
    expect(loaded.pool).toEqual([]);
    expect(loaded.archive).toEqual(library.archive);
  });

  it('坏数据被隔离且原样保留，好数据照常加载；第二次加载不会重复隔离', async () => {
    const factory = new IDBFactory();
    const good = makeEntry();
    const bad = { id: 'broken', prompt: 42 };
    await seedLibrary(factory, { pool: [good, bad], order: 'not-an-order' });
    const repository = await openRepository(factory);

    const result = await repository.load();
    expect(result).toEqual({ library: { ...EMPTY_LIBRARY, pool: [good] }, quarantined: 2 });
    const records = await repository.listQuarantine();
    expect(records.map(({ source, raw }) => ({ source, raw }))).toEqual([
      { source: 'pool', raw: bad },
      { source: 'order', raw: 'not-an-order' },
    ]);
    expect(records[0]?.foundAt).toBe(TEST_NOW.toISOString());

    // 存储中的集合已清理
    expect(await rawValue(factory, STORE.library, LIBRARY_KEY.pool)).toEqual([good]);
    expect(await repository.load()).toEqual({
      library: { ...EMPTY_LIBRARY, pool: [good] },
      quarantined: 0,
    });
    expect(await repository.countQuarantine()).toBe(2);

    await repository.clearQuarantine();
    expect(await repository.countQuarantine()).toBe(0);
  });

  it('快照与词库同一事务写入，超出上限时连同数据一起删除最旧的', async () => {
    const factory = new IDBFactory();
    const repository = await openRepository(factory);
    const createId = uuidSequence();
    const extra = 2;
    for (let index = 0; index < SNAPSHOT_LIMIT + extra; index += 1) {
      const snapshot = createSnapshot(sampleLibrary(), 'sync', {
        id: createId(),
        now: new Date(TEST_NOW.getTime() + index),
      });
      await repository.save({
        library: EMPTY_LIBRARY,
        changes: ALL_CHANGED,
        snapshots: [snapshot],
      });
    }
    const summaries = await repository.listSnapshots();
    expect(summaries).toHaveLength(SNAPSHOT_LIMIT);
    expect(summaries[0]?.id).toBe(
      `aaaaaaaa-0000-4000-8000-${String(SNAPSHOT_LIMIT + extra).padStart(12, '0')}`,
    );
    expect(summaries[0]?.counts).toEqual({ pool: 2, archive: 1 });
    expect(await countRecords(factory, STORE.snapshotData)).toBe(SNAPSHOT_LIMIT);
    expect(await repository.readSnapshot('aaaaaaaa-0000-4000-8000-000000000001')).toBeNull();
  });

  it('隔离数据与词库同一事务写入（导入时无法转换的部分）', async () => {
    const factory = new IDBFactory();
    const repository = await openRepository(factory);
    const library = sampleLibrary();
    const raw = { prompt: 42 };
    await repository.save({
      library,
      changes: ALL_CHANGED,
      snapshots: [],
      quarantine: [{ source: 'legacy', issues: ['pool.0.prompt: invalid_type'], raw }],
    });
    expect((await repository.load()).library).toEqual(library);
    expect(await repository.listQuarantine()).toEqual([
      {
        id: expect.any(String) as string,
        source: 'legacy',
        issues: ['pool.0.prompt: invalid_type'],
        raw,
        foundAt: TEST_NOW.toISOString(),
      },
    ]);
  });

  it('读取快照；快照中的坏数据被隔离，快照本身保持原样', async () => {
    const factory = new IDBFactory();
    const repository = await openRepository(factory);
    const id = 'bbbbbbbb-0000-4000-8000-000000000001';
    const good = makeEntry();
    await withDatabase(factory, [STORE.snapshotData], (transaction) => {
      transaction
        .objectStore(STORE.snapshotData)
        .put({ id, library: { pool: [good, null], archive: [], order: [] } });
    });
    const read = await repository.readSnapshot(id);
    expect(read).toEqual({ library: { ...EMPTY_LIBRARY, pool: [good] }, quarantined: 1 });
    expect((await repository.listQuarantine())[0]?.source).toBe('snapshot');
    expect(await repository.readSnapshot('missing')).toBeNull();
  });

  it('摘要损坏的快照不会出现在列表中', async () => {
    const factory = new IDBFactory();
    const repository = await openRepository(factory);
    await withDatabase(factory, [STORE.snapshots], (transaction) => {
      transaction.objectStore(STORE.snapshots).put({ id: 'x', reason: 'nope' });
    });
    expect(await repository.listSnapshots()).toEqual([]);
  });

  it('空间不足：整个写入回滚，并报告 quota 错误', async () => {
    const factory = new IDBFactory();
    const repository = await openRepository(factory);
    const library = sampleLibrary();
    await repository.save({ library, changes: ALL_CHANGED, snapshots: [] });

    // 在替身中以原来的 this 调用原方法
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalPut = IDBObjectStore.prototype.put;
    let calls = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      calls += 1;
      if (calls === 2) throw new DOMException('空间不足', 'QuotaExceededError');
      return originalPut.apply(this, args);
    });
    const error = await repository
      .save({ library: EMPTY_LIBRARY, changes: ALL_CHANGED, snapshots: [] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageError);
    expect(error instanceof StorageError && error.kind).toBe('quota');
    vi.restoreAllMocks();

    // 第一条 put 已执行，但事务被中止，数据保持原样
    expect((await repository.load()).library).toEqual(library);
  });

  it('本地数据库来自更新的版本：报告 version 错误', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION + 1);
      request.addEventListener('success', () => {
        request.result.close();
        resolve();
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('open failed'));
      });
    });
    const error = await IndexedDbRepository.open({ factory }).catch((caught: unknown) => caught);
    expect(error instanceof StorageError && error.kind).toBe('version');
  });

  it('其他标签页升级数据库时关闭连接并通知；之后的操作报告 unavailable', async () => {
    const factory = new IDBFactory();
    const onVersionChange = vi.fn();
    const repository = await openRepository(factory, onVersionChange);
    await new Promise<void>((resolve) => {
      const request = factory.open(DB_NAME, DB_VERSION + 1);
      request.addEventListener('success', () => {
        request.result.close();
        resolve();
      });
    });
    expect(onVersionChange).toHaveBeenCalledTimes(1);
    const error = await repository.load().catch((caught: unknown) => caught);
    expect(error instanceof StorageError && error.kind).toBe('unavailable');
  });

  it('应用状态：写入、读回（结构化克隆）与删除', async () => {
    const repository = await openRepository(new IDBFactory());
    expect(await repository.readState('quiz')).toBeUndefined();
    const value = { round: 2, order: ['a', 'b'] };
    await repository.writeState('quiz', value);
    const read = await repository.readState('quiz');
    expect(read).toEqual(value);
    expect(read).not.toBe(value);
    await repository.writeState('quiz', null);
    expect(await repository.readState('quiz')).toBeUndefined();
  });

  it('环境不提供 IndexedDB 时报告 unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const error = await IndexedDbRepository.open().catch((caught: unknown) => caught);
    expect(error instanceof StorageError && error.kind).toBe('unavailable');
    vi.unstubAllGlobals();
  });
});
