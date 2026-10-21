/**
 * 读取持久化数据：逐条校验，能识别的进入词库，无法识别的原样放进隔离区（F-001“损坏时保留原始数据”）。
 * 一条坏数据只影响它自己，不会让整个词库无法加载。
 */
import {
  EMPTY_ORDER,
  LIMITS,
  archiveOrderSchema,
  entrySchema,
  normalizeLibrary,
  type ArchiveOrder,
  type Entry,
  type Library,
} from '../domain';
import { formatIssue, isRecord, parse, type Issue } from '../shared/schema';

/** legacy：迁移原版数据时无法转换的部分（F-005） */
export const QUARANTINE_SOURCES = ['pool', 'archive', 'order', 'snapshot', 'legacy'] as const;
export type QuarantineSource = (typeof QUARANTINE_SOURCES)[number];

export interface QuarantineDraft {
  readonly source: QuarantineSource;
  /** 校验错误，如 `answers: too_short` */
  readonly issues: readonly string[];
  /** 原始数据，原样保存 */
  readonly raw: unknown;
}

export interface QuarantineRecord extends QuarantineDraft {
  readonly id: string;
  /** ISO 8601 */
  readonly foundAt: string;
}

const DUPLICATE_ID_ISSUE = 'id: duplicate';

const describe = (issues: readonly Issue[]): string[] => issues.map(formatIssue);

export interface CollectionRead {
  readonly entries: readonly Entry[];
  readonly rejected: readonly QuarantineDraft[];
}

export function readCollection(raw: unknown, source: QuarantineSource): CollectionRead {
  if (raw === undefined) return { entries: [], rejected: [] };
  if (!Array.isArray(raw) || raw.length > LIMITS.entriesPerCollection) {
    return { entries: [], rejected: [{ source, issues: ['type'], raw }] };
  }
  const list: readonly unknown[] = raw;
  const entries: Entry[] = [];
  const rejected: QuarantineDraft[] = [];
  const ids = new Set<string>();
  for (const item of list) {
    const result = parse(entrySchema, item);
    if (!result.ok) {
      rejected.push({ source, issues: describe(result.issues), raw: item });
    } else if (ids.has(result.value.id)) {
      rejected.push({ source, issues: [DUPLICATE_ID_ISSUE], raw: item });
    } else {
      ids.add(result.value.id);
      entries.push(result.value);
    }
  }
  return { entries, rejected };
}

export interface OrderRead {
  readonly order: ArchiveOrder;
  readonly rejected: readonly QuarantineDraft[];
}

export function readOrder(raw: unknown, source: QuarantineSource): OrderRead {
  if (raw === undefined) return { order: EMPTY_ORDER, rejected: [] };
  const result = parse(archiveOrderSchema, raw);
  return result.ok
    ? { order: result.value, rejected: [] }
    : { order: EMPTY_ORDER, rejected: [{ source, issues: describe(result.issues), raw }] };
}

export interface RawLibrary {
  readonly pool: unknown;
  readonly archive: unknown;
  readonly order: unknown;
}

export interface LibraryRead {
  readonly library: Library;
  readonly rejected: readonly QuarantineDraft[];
  /** 哪些部分含有被隔离的数据（需要写回清理后的版本） */
  readonly dirty: { readonly pool: boolean; readonly archive: boolean; readonly order: boolean };
}

/** sourceOverride：读取快照时所有问题都记为来自 snapshot */
export function readLibrary(raw: RawLibrary, sourceOverride?: QuarantineSource): LibraryRead {
  const pool = readCollection(raw.pool, sourceOverride ?? 'pool');
  const archive = readCollection(raw.archive, sourceOverride ?? 'archive');
  const order = readOrder(raw.order, sourceOverride ?? 'order');
  return {
    library: normalizeLibrary({ pool: pool.entries, archive: archive.entries, order: order.order }),
    rejected: [...pool.rejected, ...archive.rejected, ...order.rejected],
    dirty: {
      pool: pool.rejected.length > 0,
      archive: archive.rejected.length > 0,
      order: order.rejected.length > 0,
    },
  };
}

export const isRawRecord = isRecord;

/** 快照数据记录：{ id, library: { pool, archive, order } } */
export function rawLibraryOf(record: unknown): RawLibrary | null {
  if (!isRawRecord(record)) return null;
  const library = record.library;
  if (!isRawRecord(library)) return null;
  return { pool: library.pool, archive: library.archive, order: library.order };
}
