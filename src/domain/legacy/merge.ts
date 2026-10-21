/**
 * 把导入的词库并入当前词库：同一集合中内容指纹相同的词（同章节、同课时、题面与标准答案相同）只保留现有的一份。
 * 排序表以当前的为准，新出现的章节与课时按导入数据中的顺序排在后面。
 */
import { fingerprintOf } from '../fingerprint';
import { normalizeLibrary, type Library, type LibraryCounts } from '../library';
import { LIMITS } from '../limits';
import type { Entry } from '../model';

export type MergeResult =
  | {
      readonly ok: true;
      readonly library: Library;
      readonly added: LibraryCounts;
      /** 因为已经存在而跳过的词数 */
      readonly duplicates: number;
    }
  /** 合并后超出单个集合的词数上限 */
  | { readonly ok: false; readonly error: 'too-many' };

interface Appended {
  readonly entries: readonly Entry[];
  readonly added: number;
}

function appendNew(current: readonly Entry[], incoming: readonly Entry[]): Appended {
  const existing = new Set(current.map(fingerprintOf));
  const additions = incoming.filter((entry) => !existing.has(fingerprintOf(entry)));
  return {
    entries: additions.length === 0 ? current : [...current, ...additions],
    added: additions.length,
  };
}

export function mergeLibraries(current: Library, incoming: Library): MergeResult {
  const pool = appendNew(current.pool, incoming.pool);
  const archive = appendNew(current.archive, incoming.archive);
  if (
    pool.entries.length > LIMITS.entriesPerCollection ||
    archive.entries.length > LIMITS.entriesPerCollection
  ) {
    return { ok: false, error: 'too-many' };
  }
  const added = pool.added + archive.added;
  return {
    ok: true,
    library: normalizeLibrary({
      pool: pool.entries,
      archive: archive.entries,
      order: [...current.order, ...incoming.order],
    }),
    added: { pool: pool.added, archive: archive.added },
    duplicates: incoming.pool.length + incoming.archive.length - added,
  };
}
