/**
 * 词库状态容器（与框架无关；React 通过 useSyncExternalStore 订阅）。
 *
 * - 乐观更新：修改立即生效，界面无需等待磁盘；
 * - 串行写入：同一时刻只有一个写事务，期间的多次修改合并为一次写入（只写发生变化的部分）；
 * - 写入失败（F-007）：内存中的修改保留，状态标记为 failed 并发出事件；
 *   之后的任何修改或 retry() 都会把“上次成功写入之后”的全部变化一并重写，不会只写一半；
 * - 存储不可用：退回内存仓库，并发出事件让界面提示“更改不会被保存”。
 */
import {
  EMPTY_LIBRARY,
  SNAPSHOT_LIMIT,
  changesBetween,
  createSnapshot,
  hasChanges,
  newId,
  normalizeLibrary,
  summarizeSnapshot,
  type Library,
  type Snapshot,
  type SnapshotReason,
  type SnapshotSummary,
} from '../domain';
import type { ChangeChannel } from './channel';
import { toStorageError, type StorageError } from './errors';
import { MemoryRepository } from './MemoryRepository';
import type { QuarantineDraft, QuarantineRecord } from './records';
import type { LibraryRepository, StorageKind } from './repository';

export type PersistenceStatus = 'saved' | 'saving' | 'failed';

export interface LibraryState {
  readonly status: 'loading' | 'ready';
  readonly library: Library;
  readonly storage: StorageKind;
  readonly persistence: PersistenceStatus;
  readonly lastError: StorageError | null;
  /** 从新到旧 */
  readonly snapshots: readonly SnapshotSummary[];
  readonly quarantineCount: number;
}

export type LibraryEvent =
  | { readonly type: 'save-failed'; readonly error: StorageError }
  | { readonly type: 'save-recovered' }
  | { readonly type: 'storage-unavailable'; readonly error: StorageError }
  | { readonly type: 'quarantined'; readonly count: number };

export interface UpdateOptions {
  /** 修改前先保存快照 */
  readonly snapshot?: SnapshotReason;
  /** 一并保存的其他快照（例如原版数据中接收同步前的备份） */
  readonly history?: readonly Snapshot[];
  /** 一并放进隔离区的原始数据（例如导入时无法转换的词条）；与词库在同一次写入中保存 */
  readonly quarantine?: readonly QuarantineDraft[];
}

export interface RestoreOptions {
  /** 恢复前先把当前状态保存为快照（默认是）；撤销刚才的恢复时不必再保存一份 */
  readonly saveCurrent?: boolean;
}

export interface UpdateResult {
  /** 是否已写入存储 */
  readonly saved: boolean;
  /** 本次保存的快照（可用于撤销） */
  readonly snapshotId: string | null;
}

export interface LibraryStoreOptions {
  readonly openRepository: () => Promise<LibraryRepository>;
  readonly channel?: ChangeChannel | null;
  readonly clock?: () => Date;
  readonly newId?: () => string;
  /** 第一次写入成功后调用（例如申请持久化存储，避免浏览器在空间紧张时清除数据） */
  readonly onFirstSave?: () => void;
}

const INITIAL_STATE: LibraryState = {
  status: 'loading',
  library: EMPTY_LIBRARY,
  storage: 'indexeddb',
  persistence: 'saved',
  lastError: null,
  snapshots: [],
  quarantineCount: 0,
};

interface LoadedData {
  readonly library: Library;
  readonly quarantined: number;
  readonly snapshots: readonly SnapshotSummary[];
  readonly quarantineCount: number;
}

async function loadFrom(repository: LibraryRepository): Promise<LoadedData> {
  const { library, quarantined } = await repository.load();
  const [snapshots, quarantineCount] = await Promise.all([
    repository.listSnapshots(),
    repository.countQuarantine(),
  ]);
  return { library, quarantined, snapshots, quarantineCount };
}

export class LibraryStore {
  readonly #options: LibraryStoreOptions;
  readonly #clock: () => Date;
  readonly #newId: () => string;
  readonly #listeners = new Set<() => void>();
  readonly #eventListeners = new Set<(event: LibraryEvent) => void>();
  /** 启动可早于界面订阅；只保留启动告警，交给第一个订阅者消费一次。 */
  readonly #startupEvents: LibraryEvent[] = [];
  #state: LibraryState = INITIAL_STATE;
  #repository: LibraryRepository | null = null;
  /** 最近一次成功写入（或加载）的词库，用于计算需要写入的变化 */
  #persisted: Library = EMPTY_LIBRARY;
  #pendingSnapshots: readonly Snapshot[] = [];
  #pendingQuarantine: readonly QuarantineDraft[] = [];
  #writeRequested = false;
  #writing: Promise<boolean> | null = null;
  #loading: Promise<void> | null = null;
  #hasSaved = false;
  #unsubscribeChannel: (() => void) | null = null;
  /** 应用状态：每个键等待写入的最新值，以及正在进行的写入 */
  readonly #statePending = new Map<string, unknown>();
  readonly #stateWriting = new Map<string, Promise<boolean>>();

  constructor(options: LibraryStoreOptions) {
    this.#options = options;
    this.#clock = options.clock ?? (() => new Date());
    this.#newId = options.newId ?? newId;
  }

  getState = (): LibraryState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  onEvent(listener: (event: LibraryEvent) => void): () => void {
    this.#eventListeners.add(listener);
    for (const event of this.#startupEvents.splice(0)) listener(event);
    return () => {
      this.#eventListeners.delete(listener);
    };
  }

  /** 可重复调用，只加载一次 */
  load(): Promise<void> {
    this.#loading ??= this.#load();
    return this.#loading;
  }

  async #load(): Promise<void> {
    let repository: LibraryRepository | null = null;
    let data: LoadedData;
    try {
      repository = await this.#options.openRepository();
      data = await loadFrom(repository);
    } catch (error) {
      repository?.close();
      repository = new MemoryRepository();
      data = await loadFrom(repository);
      this.#emitStartup({
        type: 'storage-unavailable',
        error: toStorageError(error, 'unavailable'),
      });
    }
    this.#repository = repository;
    this.#persisted = data.library;
    this.#setState({
      status: 'ready',
      library: data.library,
      storage: repository.kind,
      snapshots: data.snapshots,
      quarantineCount: data.quarantineCount,
    });
    if (data.quarantined > 0) this.#emitStartup({ type: 'quarantined', count: data.quarantined });
    this.#unsubscribeChannel = this.#options.channel?.subscribe(this.#onExternalChange) ?? null;
  }

  /**
   * 修改词库。recipe 必须返回新对象（不可变更新）；返回原对象表示没有变化。
   * 返回的 Promise 在写入结束后完成（失败时 saved 为 false，修改仍保留在内存中）。
   */
  update(
    recipe: (library: Library) => Library,
    options: UpdateOptions = {},
  ): Promise<UpdateResult> {
    if (this.#state.status !== 'ready') {
      return Promise.reject(new Error('词库尚未加载完成'));
    }
    const { history = [], quarantine = [] } = options;
    const previous = this.#state.library;
    const next = normalizeLibrary(recipe(previous));
    if (next === previous && history.length === 0 && quarantine.length === 0) {
      return Promise.resolve({ saved: this.#state.persistence !== 'failed', snapshotId: null });
    }
    let snapshotId: string | null = null;
    const added: Snapshot[] = [...history];
    if (options.snapshot !== undefined && next !== previous) {
      const snapshot = createSnapshot(previous, options.snapshot, {
        id: this.#newId(),
        now: this.#clock(),
      });
      snapshotId = snapshot.id;
      added.push(snapshot);
    }
    this.#pendingSnapshots = [...this.#pendingSnapshots, ...added];
    this.#pendingQuarantine = [...this.#pendingQuarantine, ...quarantine];
    this.#setState({
      library: next,
      // 新快照在前：本次修改前的快照最新，附带的历史快照排在它后面
      snapshots: [...added.toReversed().map(summarizeSnapshot), ...this.#state.snapshots].slice(
        0,
        SNAPSHOT_LIMIT,
      ),
      quarantineCount: this.#state.quarantineCount + quarantine.length,
    });
    return this.#flush().then((saved) => ({ saved, snapshotId }));
  }

  /** 重新尝试写入失败的修改 */
  retry(): Promise<boolean> {
    return this.#flush();
  }

  /** 恢复快照：默认当前状态先保存为快照，因此恢复本身也能撤销。快照不存在时返回 null */
  async restoreSnapshot(
    id: string,
    { saveCurrent = true }: RestoreOptions = {},
  ): Promise<UpdateResult | null> {
    const repository = this.#requireRepository();
    // 写入失败时快照可能还只在内存中
    const pending = this.#pendingSnapshots.find((snapshot) => snapshot.id === id);
    const read =
      pending === undefined
        ? await repository.readSnapshot(id)
        : { library: pending.library, quarantined: 0 };
    if (read === null) return null;
    if (read.quarantined > 0) {
      this.#setState({ quarantineCount: this.#state.quarantineCount + read.quarantined });
      this.#emit({ type: 'quarantined', count: read.quarantined });
    }
    return this.update(() => read.library, saveCurrent ? { snapshot: 'restore' } : {});
  }

  listQuarantine(): Promise<readonly QuarantineRecord[]> {
    return this.#requireRepository().listQuarantine();
  }

  async clearQuarantine(): Promise<void> {
    await this.#requireRepository().clearQuarantine();
    this.#setState({ quarantineCount: 0 });
  }

  /** 读取其他应用状态（例如测验进度）；会等待词库加载完成。读取失败时视为不存在 */
  async readState(key: string): Promise<unknown> {
    await this.load();
    try {
      return await this.#requireRepository().readState(key);
    } catch {
      return undefined;
    }
  }

  /**
   * 写入其他应用状态（value 为 null 时删除）。同一个键的写入串行进行，
   * 等待期间的多次写入只保留最后一次。返回是否写入成功；失败不影响词库，也不发出通知。
   */
  writeState(key: string, value: unknown): Promise<boolean> {
    if (this.#repository === null) return Promise.resolve(false);
    this.#statePending.set(key, value);
    let writing = this.#stateWriting.get(key);
    if (writing === undefined) {
      writing = this.#drainState(key);
      this.#stateWriting.set(key, writing);
    }
    return writing;
  }

  dispose(): void {
    this.#unsubscribeChannel?.();
    this.#unsubscribeChannel = null;
    this.#options.channel?.close();
    this.#repository?.close();
    this.#listeners.clear();
    this.#eventListeners.clear();
  }

  #requireRepository(): LibraryRepository {
    if (this.#repository === null) throw new Error('词库尚未加载完成');
    return this.#repository;
  }

  async #drainState(key: string): Promise<boolean> {
    const repository = this.#requireRepository();
    let saved = true;
    while (this.#statePending.has(key)) {
      const value = this.#statePending.get(key);
      this.#statePending.delete(key);
      try {
        await repository.writeState(key, value);
        saved = true;
      } catch {
        saved = false;
      }
    }
    // 与上面最后一次检查之间没有 await：之后的写入一定会开始新的一轮
    this.#stateWriting.delete(key);
    return saved;
  }

  #flush(): Promise<boolean> {
    this.#writeRequested = true;
    this.#writing ??= this.#drain().finally(() => {
      this.#writing = null;
    });
    return this.#writing;
  }

  async #drain(): Promise<boolean> {
    const repository = this.#requireRepository();
    const wasFailed = this.#state.persistence === 'failed';
    while (this.#writeRequested) {
      this.#writeRequested = false;
      const library = this.#state.library;
      const snapshots = this.#pendingSnapshots;
      const quarantine = this.#pendingQuarantine;
      const changes = changesBetween(this.#persisted, library);
      if (!hasChanges(changes) && snapshots.length === 0 && quarantine.length === 0) continue;
      this.#setState({ persistence: 'saving' });
      try {
        await repository.save({ library, changes, snapshots, quarantine });
      } catch (error) {
        const storageError = toStorageError(error);
        this.#setState({ persistence: 'failed', lastError: storageError });
        this.#emit({ type: 'save-failed', error: storageError });
        return false;
      }
      this.#persisted = library;
      // 写入期间可能又有新快照或隔离数据加入，只移除已写入的那些
      this.#pendingSnapshots = this.#pendingSnapshots.slice(snapshots.length);
      this.#pendingQuarantine = this.#pendingQuarantine.slice(quarantine.length);
    }
    if (this.#state.persistence !== 'saved')
      this.#setState({ persistence: 'saved', lastError: null });
    if (wasFailed) this.#emit({ type: 'save-recovered' });
    if (!this.#hasSaved) {
      this.#hasSaved = true;
      this.#options.onFirstSave?.();
    }
    this.#options.channel?.post();
    return true;
  }

  /** 其他标签页修改了词库：本页没有未保存的修改时重新读取 */
  #onExternalChange = (): void => {
    if (!this.#isClean()) return;
    void this.#reload();
  };

  #isClean(): boolean {
    return (
      this.#writing === null &&
      this.#pendingSnapshots.length === 0 &&
      this.#pendingQuarantine.length === 0 &&
      this.#persisted === this.#state.library
    );
  }

  async #reload(): Promise<void> {
    const repository = this.#requireRepository();
    try {
      const data = await loadFrom(repository);
      if (!this.#isClean()) return;
      this.#persisted = data.library;
      this.#setState({
        library: data.library,
        snapshots: data.snapshots,
        quarantineCount: data.quarantineCount,
      });
      if (data.quarantined > 0) this.#emit({ type: 'quarantined', count: data.quarantined });
    } catch {
      // 读取失败时保留当前内容；下一次写入会覆盖为本页的状态
    }
  }

  #setState(patch: Partial<LibraryState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }

  #emitStartup(event: LibraryEvent): void {
    if (this.#eventListeners.size === 0) this.#startupEvents.push(event);
    else this.#emit(event);
  }

  #emit(event: LibraryEvent): void {
    for (const listener of this.#eventListeners) listener(event);
  }
}
