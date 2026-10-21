import {
  EMPTY_LIBRARY,
  newId,
  normalizeLibrary,
  snapshotsToPrune,
  sortSnapshots,
  summarizeSnapshot,
  type Library,
  type Snapshot,
  type SnapshotSummary,
} from '../domain';
import type { QuarantineRecord } from './records';
import type {
  LibraryRepository,
  LoadResult,
  SaveRequest,
  SnapshotRead,
  StorageKind,
} from './repository';

/**
 * 内存仓库：浏览器禁用存储时的退路（数据只保留到关闭页面），也用于测试。
 * 读写都做结构化克隆，与 IndexedDB 一样不会共享对象引用；
 * 初始数据与 IndexedDB 读取路径一样先规范化，保证 load 的契约一致。
 */
export class MemoryRepository implements LibraryRepository {
  readonly kind: StorageKind = 'memory';
  #library: Library;
  readonly #snapshots = new Map<string, Snapshot>();
  #quarantine: readonly QuarantineRecord[] = [];
  readonly #state = new Map<string, unknown>();

  /** quarantine：预置的隔离记录（测试用） */
  constructor(initial: Library = EMPTY_LIBRARY, quarantine: readonly QuarantineRecord[] = []) {
    this.#library = structuredClone(normalizeLibrary(initial));
    this.#quarantine = structuredClone(quarantine);
  }

  load(): Promise<LoadResult> {
    return Promise.resolve({ library: structuredClone(this.#library), quarantined: 0 });
  }

  save({ library, changes, snapshots, quarantine = [] }: SaveRequest): Promise<void> {
    const current = this.#library;
    this.#library = {
      pool: changes.pool ? structuredClone(library.pool) : current.pool,
      archive: changes.archive ? structuredClone(library.archive) : current.archive,
      order: changes.order ? structuredClone(library.order) : current.order,
    };
    for (const snapshot of snapshots) this.#snapshots.set(snapshot.id, structuredClone(snapshot));
    for (const id of snapshotsToPrune([...this.#snapshots.values()])) this.#snapshots.delete(id);
    if (quarantine.length > 0) {
      const foundAt = new Date().toISOString();
      const records = quarantine.map((draft) => ({
        ...structuredClone(draft),
        id: newId(),
        foundAt,
      }));
      this.#quarantine = [...this.#quarantine, ...records];
    }
    return Promise.resolve();
  }

  listSnapshots(): Promise<readonly SnapshotSummary[]> {
    return Promise.resolve(sortSnapshots([...this.#snapshots.values()].map(summarizeSnapshot)));
  }

  readSnapshot(id: string): Promise<SnapshotRead | null> {
    const snapshot = this.#snapshots.get(id);
    return Promise.resolve(
      snapshot === undefined
        ? null
        : { library: structuredClone(snapshot.library), quarantined: 0 },
    );
  }

  countQuarantine(): Promise<number> {
    return Promise.resolve(this.#quarantine.length);
  }

  listQuarantine(): Promise<readonly QuarantineRecord[]> {
    return Promise.resolve(structuredClone(this.#quarantine));
  }

  clearQuarantine(): Promise<void> {
    this.#quarantine = [];
    return Promise.resolve();
  }

  readState(key: string): Promise<unknown> {
    return Promise.resolve(structuredClone(this.#state.get(key)));
  }

  writeState(key: string, value: unknown): Promise<void> {
    if (value === null) this.#state.delete(key);
    else this.#state.set(key, structuredClone(value));
    return Promise.resolve();
  }

  close(): void {
    // 无需释放资源
  }
}
