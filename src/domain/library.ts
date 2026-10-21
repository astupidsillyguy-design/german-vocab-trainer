/**
 * 整个词库：待测库（pool）、归档库（archive）与归档排序表。
 * 所有修改都返回新对象（不可变更新），持久化层据此按引用判断哪一部分需要写入。
 */
import type { Entry } from './model';
import { EMPTY_ORDER, reconcileOrder, type ArchiveOrder } from './order';

export const COLLECTIONS = ['pool', 'archive'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export interface Library {
  /** 待测库：顺序即词表中的顺序 */
  readonly pool: readonly Entry[];
  /** 归档库：通关后归档的词 */
  readonly archive: readonly Entry[];
  readonly order: ArchiveOrder;
}

export const EMPTY_LIBRARY: Library = { pool: [], archive: [], order: EMPTY_ORDER };

/** 每次修改后调用：保证排序表与归档数据一致（无变化时返回原对象） */
export function normalizeLibrary(library: Library): Library {
  const order = reconcileOrder(library.order, library.archive);
  return order === library.order ? library : { ...library, order };
}

export interface LibraryCounts {
  readonly pool: number;
  readonly archive: number;
}

export function countLibrary(library: Library): LibraryCounts {
  return { pool: library.pool.length, archive: library.archive.length };
}

export interface LibraryChanges {
  readonly pool: boolean;
  readonly archive: boolean;
  readonly order: boolean;
}

export function changesBetween(previous: Library, next: Library): LibraryChanges {
  return {
    pool: previous.pool !== next.pool,
    archive: previous.archive !== next.archive,
    order: previous.order !== next.order,
  };
}

export function hasChanges(changes: LibraryChanges): boolean {
  return changes.pool || changes.archive || changes.order;
}
