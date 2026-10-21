/**
 * 归档（F-036）：通关单元的词从待测库移到归档库，并记下归档时间。
 * 归档库的浏览：统计（F-042）、搜索（F-043）、按章节 / 课时取词（F-048、F-055）。
 */
import { answerKey } from './answer';
import { fingerprintOf, type FingerprintSource } from './fingerprint';
import type { EntryId } from './id';
import type { Library } from './library';
import type { Entry, EntryContent } from './model';
import type { Grouped } from './order';
import type { QuizSection } from './quiz';

export interface ArchiveResult {
  readonly library: Library;
  /** 从待测库移出的词数 */
  readonly archived: number;
}

/**
 * 把待测库中给定 id 的词按原顺序移到归档库末尾。
 * - 只处理仍在待测库中的词（测验途中已删除或已归档的词忽略）；
 * - 归档库中已有同一个词（内容指纹相同）时不再重复添加，只从待测库移除；
 * - 词条保留章节与课时原名（与待测库、归档库其他地方一致），归档排序表由 normalizeLibrary 补齐；
 * - 没有可归档的词时返回原对象。
 */
export function archiveEntries(library: Library, ids: Iterable<EntryId>, now: Date): ArchiveResult {
  const targets = new Set(ids);
  const moving = library.pool.filter((entry) => targets.has(entry.id));
  if (moving.length === 0) return { library, archived: 0 };

  const archivedAt = now.toISOString();
  const knownIds = new Set(library.archive.map((entry) => entry.id));
  const knownFingerprints = new Set(library.archive.map(fingerprintOf));
  const added: Entry[] = [];
  for (const entry of moving) {
    const fingerprint = fingerprintOf(entry);
    if (knownIds.has(entry.id) || knownFingerprints.has(fingerprint)) continue;
    knownIds.add(entry.id);
    knownFingerprints.add(fingerprint);
    added.push({ ...entry, archivedAt });
  }
  return {
    library: {
      ...library,
      pool: library.pool.filter((entry) => !targets.has(entry.id)),
      archive: added.length === 0 ? library.archive : [...library.archive, ...added],
    },
    archived: moving.length,
  };
}

export interface UnitArchiveStatus {
  /** 仍在待测库中、可以归档的词 */
  readonly pending: readonly EntryId[];
  /** 已不在待测库、但归档库中有同一个词（内容指纹相同）的词数 */
  readonly archived: number;
}

/** 一组词（例如本次测验的题目）当前的归档状态 */
export function unitArchiveStatus(
  library: Library,
  entries: readonly (FingerprintSource & { readonly id: EntryId })[],
): UnitArchiveStatus {
  const inPool = new Set(library.pool.map((entry) => entry.id));
  const pending: EntryId[] = [];
  const rest: FingerprintSource[] = [];
  for (const entry of entries) {
    if (inPool.has(entry.id)) pending.push(entry.id);
    else rest.push(entry);
  }
  if (rest.length === 0) return { pending, archived: 0 };
  const archivedFingerprints = new Set(library.archive.map(fingerprintOf));
  const archived = rest.filter((entry) => archivedFingerprints.has(fingerprintOf(entry))).length;
  return { pending, archived };
}

export interface ArchiveStats {
  readonly entries: number;
  readonly chapters: number;
}

/** F-042 统计：词数与章节数 */
export function archiveStats(entries: readonly Grouped[]): ArchiveStats {
  return { entries: entries.length, chapters: new Set(entries.map(({ chapter }) => chapter)).size };
}

/** ASCII 单元分隔符：关键词不会跨字段匹配（例如答案末尾与释义开头拼在一起） */
const FIELD_SEPARATOR = '\u001f';
const searchTextCache = new WeakMap<EntryContent, string>();

/** 词条不可变，按对象缓存可搜索文本：每输入一个字都要扫描整个归档库 */
function searchTextOf(entry: EntryContent): string {
  const cached = searchTextCache.get(entry);
  if (cached !== undefined) return cached;
  const text = [...entry.answers, entry.prompt, entry.chapter, entry.lesson]
    .map(answerKey)
    .join(FIELD_SEPARATOR);
  searchTextCache.set(entry, text);
  return text;
}

/**
 * F-043 搜索：任一可接受答案、释义、章节或课时名中包含关键词即命中。
 * 与判分使用同一套比较规则（不区分大小写、标点视为空格），因此搜“jm bei”也能找到“jm. bei etw. helfen”。
 * 关键词为空时返回原数组。
 */
export function filterEntries<T extends EntryContent>(
  entries: readonly T[],
  query: string,
): readonly T[] {
  const key = answerKey(query);
  if (key === '') return entries;
  return entries.filter((entry) => searchTextOf(entry).includes(key));
}

export function isInSection(entry: Grouped, section: QuizSection): boolean {
  return (
    entry.chapter === section.chapter &&
    (section.lesson === null || entry.lesson === section.lesson)
  );
}

/** F-048 / F-055：属于任一给定章节或课时的词，保持原顺序 */
export function entriesInSections<T extends Grouped>(
  entries: readonly T[],
  sections: readonly QuizSection[],
): T[] {
  return entries.filter((entry) => sections.some((section) => isInSection(entry, section)));
}
