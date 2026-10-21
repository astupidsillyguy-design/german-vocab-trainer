/**
 * F-067 保存词表：整体替换待测库。
 * 内容指纹相同的旧词条保留原来的 ID 与创建时间（测验进度、同步与去重都依赖稳定的 ID）。
 */
import { fingerprintOf, type Fingerprint } from '../fingerprint';
import { newEntryId, type EntryId } from '../id';
import type { Library } from '../library';
import type { Entry, EntryContent, VerbForm } from '../model';

export interface ReplaceContext {
  readonly now?: Date;
  readonly newId?: () => EntryId;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameVerbForm(a: VerbForm | null, b: VerbForm | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.base === b.base;
}

export function sameContent(a: EntryContent, b: EntryContent): boolean {
  return (
    a.chapter === b.chapter &&
    a.lesson === b.lesson &&
    a.prompt === b.prompt &&
    sameList(a.answers, b.answers) &&
    sameVerbForm(a.verbForm, b.verbForm) &&
    sameList(a.linkedForms, b.linkedForms)
  );
}

/** 新内容与当前待测库完全一致（含顺序）时不必保存，也不必拍快照 */
export function isSamePool(pool: readonly Entry[], contents: readonly EntryContent[]): boolean {
  return (
    pool.length === contents.length &&
    pool.every((entry, index) => {
      const content = contents[index];
      return content !== undefined && sameContent(entry, content);
    })
  );
}

export function replacePool(
  library: Library,
  contents: readonly EntryContent[],
  { now = new Date(), newId = newEntryId }: ReplaceContext = {},
): Library {
  const reusable = new Map<Fingerprint, Entry[]>();
  for (const entry of library.pool) {
    const fingerprint = fingerprintOf(entry);
    const list = reusable.get(fingerprint);
    if (list === undefined) reusable.set(fingerprint, [entry]);
    else list.push(entry);
  }
  const createdAt = now.toISOString();
  const pool = contents.map((content): Entry => {
    const previous = reusable.get(fingerprintOf(content))?.shift();
    if (previous === undefined) return { id: newId(), ...content, createdAt, archivedAt: null };
    return sameContent(previous, content) ? previous : { ...previous, ...content };
  });
  return { ...library, pool };
}
