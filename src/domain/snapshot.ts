/**
 * 快照：整体替换待测库、归档单元、删除归档课时或章节、接收同步覆盖、导入数据之前，
 * 自动保存整个词库，最多保留 SNAPSHOT_LIMIT 份。
 * 恢复快照前也会先保存当前状态，因此“恢复”本身同样可以撤销。
 */
import { newId } from './id';
import { countLibrary, type Library, type LibraryCounts } from './library';

export const SNAPSHOT_LIMIT = 20;

export const SNAPSHOT_REASONS = [
  'replace-pool',
  'archive',
  'delete',
  'sync',
  'import',
  'restore',
  /** 原版接收同步覆盖前保存的备份，迁移旧数据时一并保留 */
  'legacy-backup',
] as const;
export type SnapshotReason = (typeof SNAPSHOT_REASONS)[number];

export interface SnapshotSummary {
  readonly id: string;
  /** ISO 8601 */
  readonly createdAt: string;
  readonly reason: SnapshotReason;
  readonly counts: LibraryCounts;
}

export interface Snapshot extends SnapshotSummary {
  readonly library: Library;
}

export interface SnapshotContext {
  readonly id?: string;
  readonly now?: Date;
}

export function createSnapshot(
  library: Library,
  reason: SnapshotReason,
  { id = newId(), now = new Date() }: SnapshotContext = {},
): Snapshot {
  return { id, createdAt: now.toISOString(), reason, counts: countLibrary(library), library };
}

export function summarizeSnapshot({
  id,
  createdAt,
  reason,
  counts,
}: SnapshotSummary): SnapshotSummary {
  return { id, createdAt, reason, counts };
}

/** 从新到旧；同一毫秒内按 id 排序保证结果稳定 */
export function sortSnapshots<T extends SnapshotSummary>(snapshots: readonly T[]): T[] {
  return [...snapshots].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}

/** 超出上限、需要删除的快照（最旧的那些） */
export function snapshotsToPrune(
  snapshots: readonly SnapshotSummary[],
  limit: number = SNAPSHOT_LIMIT,
): string[] {
  return sortSnapshots(snapshots)
    .slice(limit)
    .map(({ id }) => id);
}
