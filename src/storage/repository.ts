/**
 * 词库仓库接口。正式环境使用 IndexedDB；浏览器禁用存储时退回内存实现（数据只保留到关闭页面）。
 */
import type { Library, LibraryChanges, Snapshot, SnapshotSummary } from '../domain';
import type { QuarantineDraft, QuarantineRecord } from './records';

export type StorageKind = 'indexeddb' | 'memory';

export interface LoadResult {
  readonly library: Library;
  /** 本次加载新发现并隔离的记录数 */
  readonly quarantined: number;
}

export interface SaveRequest {
  readonly library: Library;
  /** 只写入发生变化的部分 */
  readonly changes: LibraryChanges;
  /** 与词库在同一事务中写入的快照（修改前的状态）；写入后自动删除超出上限的旧快照 */
  readonly snapshots: readonly Snapshot[];
  /** 与词库在同一事务中放进隔离区的原始数据（例如导入时无法转换的词条） */
  readonly quarantine?: readonly QuarantineDraft[];
}

export interface SnapshotRead {
  readonly library: Library;
  readonly quarantined: number;
}

export interface LibraryRepository {
  readonly kind: StorageKind;
  load(): Promise<LoadResult>;
  save(request: SaveRequest): Promise<void>;
  /** 从新到旧 */
  listSnapshots(): Promise<readonly SnapshotSummary[]>;
  readSnapshot(id: string): Promise<SnapshotRead | null>;
  countQuarantine(): Promise<number>;
  listQuarantine(): Promise<readonly QuarantineRecord[]>;
  clearQuarantine(): Promise<void>;
  /** 读取其他应用状态（例如测验进度）；不存在时返回 undefined。值未经校验，由调用方解析 */
  readState(key: string): Promise<unknown>;
  /** 写入其他应用状态；value 为 null 时删除该键 */
  writeState(key: string, value: unknown): Promise<void>;
  close(): void;
}
