import {
  newId,
  parseSnapshotSummary,
  snapshotsToPrune,
  sortSnapshots,
  summarizeSnapshot,
  type SnapshotSummary,
} from '../domain';
import { DB_NAME, DB_VERSION, LIBRARY_KEY, STORE } from './constants';
import { StorageError } from './errors';
import { openDatabase, requestResult, runTransaction } from './idb';
import {
  isRawRecord,
  rawLibraryOf,
  readLibrary,
  type QuarantineDraft,
  type QuarantineRecord,
} from './records';
import type {
  LibraryRepository,
  LoadResult,
  SaveRequest,
  SnapshotRead,
  StorageKind,
} from './repository';

export function upgradeDatabase(database: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    database.createObjectStore(STORE.library);
    database.createObjectStore(STORE.snapshots, { keyPath: 'id' });
    database.createObjectStore(STORE.snapshotData, { keyPath: 'id' });
    database.createObjectStore(STORE.quarantine, { keyPath: 'id' });
    database.createObjectStore(STORE.state);
  }
}

export interface IndexedDbRepositoryOptions {
  readonly factory?: IDBFactory;
  readonly name?: string;
  readonly clock?: () => Date;
  readonly newId?: () => string;
  readonly onVersionChange?: () => void;
}

function defaultFactory(): IDBFactory {
  // 类型声明认为 indexedDB 总是存在；部分环境（例如禁用存储的 WebView）中它是 undefined
  const factory = (globalThis as Partial<Pick<typeof globalThis, 'indexedDB'>>).indexedDB;
  if (factory === undefined) throw new StorageError('unavailable');
  return factory;
}

export class IndexedDbRepository implements LibraryRepository {
  readonly kind: StorageKind = 'indexeddb';
  readonly #database: IDBDatabase;
  readonly #clock: () => Date;
  readonly #newId: () => string;

  private constructor(database: IDBDatabase, clock: () => Date, createId: () => string) {
    this.#database = database;
    this.#clock = clock;
    this.#newId = createId;
  }

  static async open({
    factory,
    name = DB_NAME,
    clock = () => new Date(),
    newId: createId = newId,
    onVersionChange,
  }: IndexedDbRepositoryOptions = {}): Promise<IndexedDbRepository> {
    const database = await openDatabase({
      factory: factory ?? defaultFactory(),
      name,
      version: DB_VERSION,
      upgrade: upgradeDatabase,
      ...(onVersionChange === undefined ? {} : { onVersionChange }),
    });
    return new IndexedDbRepository(database, clock, createId);
  }

  /** 在新事务中执行 body；连接已关闭（例如收到 versionchange）时返回 unavailable 错误 */
  #run<T>(
    stores: readonly string[],
    mode: IDBTransactionMode,
    body: (transaction: IDBTransaction) => Promise<T> | T,
  ): Promise<T> {
    let transaction: IDBTransaction;
    try {
      transaction = this.#database.transaction(stores, mode);
    } catch (error) {
      return Promise.reject(new StorageError('unavailable', { cause: error }));
    }
    return runTransaction(transaction, body);
  }

  #quarantine(store: IDBObjectStore, drafts: readonly QuarantineDraft[]): void {
    const foundAt = this.#clock().toISOString();
    for (const draft of drafts) {
      const record: QuarantineRecord = { ...draft, id: this.#newId(), foundAt };
      store.put(record);
    }
  }

  /**
   * 读取、校验并在同一事务中隔离坏数据：坏数据先原样复制到隔离区，再写回清理后的集合。
   * 两步要么都成功、要么都不发生，因此任何时候原始数据都至少存在一份。
   */
  load(): Promise<LoadResult> {
    return this.#run([STORE.library, STORE.quarantine], 'readwrite', async (transaction) => {
      const library = transaction.objectStore(STORE.library);
      const [pool, archive, order] = await Promise.all([
        requestResult<unknown>(library.get(LIBRARY_KEY.pool)),
        requestResult<unknown>(library.get(LIBRARY_KEY.archive)),
        requestResult<unknown>(library.get(LIBRARY_KEY.order)),
      ]);
      const read = readLibrary({ pool, archive, order });
      if (read.rejected.length > 0) {
        this.#quarantine(transaction.objectStore(STORE.quarantine), read.rejected);
        if (read.dirty.pool) library.put(read.library.pool, LIBRARY_KEY.pool);
        if (read.dirty.archive) library.put(read.library.archive, LIBRARY_KEY.archive);
        if (read.dirty.order) library.put(read.library.order, LIBRARY_KEY.order);
      }
      return { library: read.library, quarantined: read.rejected.length };
    });
  }

  save({ library, changes, snapshots, quarantine = [] }: SaveRequest): Promise<void> {
    const stores: string[] = [STORE.library, STORE.snapshots, STORE.snapshotData];
    if (quarantine.length > 0) stores.push(STORE.quarantine);
    return this.#run(stores, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(STORE.library);
      if (changes.pool) store.put(library.pool, LIBRARY_KEY.pool);
      if (changes.archive) store.put(library.archive, LIBRARY_KEY.archive);
      if (changes.order) store.put(library.order, LIBRARY_KEY.order);
      if (quarantine.length > 0) {
        this.#quarantine(transaction.objectStore(STORE.quarantine), quarantine);
      }
      if (snapshots.length === 0) return;

      const summaries = transaction.objectStore(STORE.snapshots);
      const data = transaction.objectStore(STORE.snapshotData);
      for (const snapshot of snapshots) {
        summaries.put(summarizeSnapshot(snapshot));
        data.put({ id: snapshot.id, library: snapshot.library });
      }
      // 同一事务能读到自己刚写入的记录
      const existing = await requestResult(summaries.getAll());
      for (const id of snapshotsToPrune(validSummaries(existing))) {
        summaries.delete(id);
        data.delete(id);
      }
    });
  }

  listSnapshots(): Promise<readonly SnapshotSummary[]> {
    return this.#run([STORE.snapshots], 'readonly', async (transaction) =>
      sortSnapshots(
        validSummaries(await requestResult(transaction.objectStore(STORE.snapshots).getAll())),
      ),
    );
  }

  readSnapshot(id: string): Promise<SnapshotRead | null> {
    const stores = [STORE.snapshotData, STORE.quarantine];
    return this.#run(stores, 'readwrite', async (transaction) => {
      const raw = rawLibraryOf(
        await requestResult(transaction.objectStore(STORE.snapshotData).get(id)),
      );
      if (raw === null) return null;
      const read = readLibrary(raw, 'snapshot');
      // 快照里的坏数据同样隔离；快照本身保持原样
      this.#quarantine(transaction.objectStore(STORE.quarantine), read.rejected);
      return { library: read.library, quarantined: read.rejected.length };
    });
  }

  countQuarantine(): Promise<number> {
    return this.#run([STORE.quarantine], 'readonly', (transaction) =>
      requestResult(transaction.objectStore(STORE.quarantine).count()),
    );
  }

  listQuarantine(): Promise<readonly QuarantineRecord[]> {
    return this.#run([STORE.quarantine], 'readonly', async (transaction) =>
      (await requestResult(transaction.objectStore(STORE.quarantine).getAll())).filter(
        isQuarantineRecord,
      ),
    );
  }

  clearQuarantine(): Promise<void> {
    return this.#run([STORE.quarantine], 'readwrite', (transaction) => {
      transaction.objectStore(STORE.quarantine).clear();
    });
  }

  readState(key: string): Promise<unknown> {
    return this.#run([STORE.state], 'readonly', (transaction) =>
      requestResult<unknown>(transaction.objectStore(STORE.state).get(key)),
    );
  }

  writeState(key: string, value: unknown): Promise<void> {
    return this.#run([STORE.state], 'readwrite', (transaction) => {
      const store = transaction.objectStore(STORE.state);
      if (value === null) store.delete(key);
      else store.put(value, key);
    });
  }

  close(): void {
    this.#database.close();
  }
}

function validSummaries(records: readonly unknown[]): SnapshotSummary[] {
  return records.flatMap((record) => {
    const summary = parseSnapshotSummary(record);
    return summary === null ? [] : [summary];
  });
}

/** 隔离记录由本应用写入；只检查外层结构，raw 本身可以是任何值 */
function isQuarantineRecord(record: unknown): record is QuarantineRecord {
  return (
    isRawRecord(record) &&
    typeof record.id === 'string' &&
    typeof record.source === 'string' &&
    typeof record.foundAt === 'string' &&
    Array.isArray(record.issues)
  );
}
