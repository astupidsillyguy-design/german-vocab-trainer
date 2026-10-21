/**
 * 归档库管理（F-051 – F-054）：编辑词条、章节 / 课时改名与删除，以及各自的撤销。
 *
 * 每个操作只返回撤销这一次修改所需的信息；撤销时只回退这次涉及的词条，
 * 其间的其他修改（例如接连删除了几个词，再撤销第一个）不受影响。
 */
import { answerKey } from './answer';
import { updateEntry } from './entry';
import type { EntryId } from './id';
import type { Library } from './library';
import { LIMITS } from './limits';
import type { Entry } from './model';
import {
  renameChapterInOrder,
  renameLessonInOrder,
  restorePositions,
  type ArchiveOrder,
} from './order';
import { normalizeText, uniqueBy } from './text';
import { sameContent } from './wordList';

export type ArchiveGroup =
  | { readonly kind: 'chapter'; readonly chapter: string }
  | { readonly kind: 'lesson'; readonly chapter: string; readonly lesson: string };

export type ArchiveTarget = ArchiveGroup | { readonly kind: 'entry'; readonly id: EntryId };

export function isInGroup(entry: Entry, group: ArchiveGroup): boolean {
  return (
    entry.chapter === group.chapter && (group.kind === 'chapter' || entry.lesson === group.lesson)
  );
}

function matchesTarget(entry: Entry, target: ArchiveTarget): boolean {
  return target.kind === 'entry' ? entry.id === target.id : isInGroup(entry, target);
}

function replaceAt(entries: readonly Entry[], index: number, entry: Entry): readonly Entry[] {
  const next = [...entries];
  next[index] = entry;
  return next;
}

// —— 删除（F-054）——

export interface RemovedEntry {
  readonly entry: Entry;
  /** 删除前在归档库中的位置 */
  readonly index: number;
}

export interface ArchiveRemoval {
  /** 按原位置从前到后排列 */
  readonly removed: readonly RemovedEntry[];
  /** 删除前的排序表：撤销时把章节与课时放回原位 */
  readonly order: ArchiveOrder;
}

export interface RemovalResult {
  readonly library: Library;
  readonly removal: ArchiveRemoval;
}

/** 删除一个词、一个课时或整个章节；没有匹配的词时返回原对象 */
export function removeFromArchive(library: Library, target: ArchiveTarget): RemovalResult {
  const removed: RemovedEntry[] = [];
  const kept: Entry[] = [];
  library.archive.forEach((entry, index) => {
    if (matchesTarget(entry, target)) removed.push({ entry, index });
    else kept.push(entry);
  });
  const removal = { removed, order: library.order };
  return removed.length === 0
    ? { library, removal }
    : { library: { ...library, archive: kept }, removal };
}

/** 撤销删除：把仍不在归档库中的词插回原位置（已经回来的不重复添加） */
export function restoreRemoval(library: Library, { removed, order }: ArchiveRemoval): Library {
  const present = new Set(library.archive.map((entry) => entry.id));
  const missing = removed.filter(({ entry }) => !present.has(entry.id));
  if (missing.length === 0) return library;
  const archive = [...library.archive];
  for (const { entry, index } of missing) {
    archive.splice(Math.min(index, archive.length), 0, entry);
  }
  return { ...library, archive, order: restorePositions(library.order, order) };
}

// —— 编辑词条（F-051）——

export interface EntryEdit {
  /** 标准答案（显示与朗读都用它） */
  readonly answer: string;
  /** 其他可接受答案：编辑时原样保留，不再像原版那样被丢掉 */
  readonly alternatives: readonly string[];
  readonly prompt: string;
}

export type EditError =
  'missing' | 'answerRequired' | 'promptRequired' | 'tooManyAnswers' | 'invalid';

export type EditResult =
  | {
      readonly ok: true;
      readonly library: Library;
      /** 修改前的词条；内容没有变化时为 null（不必保存，也不必提供撤销） */
      readonly previous: Entry | null;
    }
  | { readonly ok: false; readonly error: EditError };

function answerCount(answers: readonly string[]): number {
  return uniqueBy(answers.map(normalizeText).filter(Boolean), answerKey).length;
}

export function editArchiveEntry(library: Library, id: EntryId, edit: EntryEdit): EditResult {
  const index = library.archive.findIndex((entry) => entry.id === id);
  const previous = library.archive[index];
  if (previous === undefined) return { ok: false, error: 'missing' };
  if (normalizeText(edit.answer) === '') return { ok: false, error: 'answerRequired' };
  if (normalizeText(edit.prompt) === '') return { ok: false, error: 'promptRequired' };
  const answers = [edit.answer, ...edit.alternatives];
  if (answerCount(answers) > LIMITS.answersPerEntry) return { ok: false, error: 'tooManyAnswers' };
  const updated = updateEntry(previous, { answers, prompt: edit.prompt });
  if (!updated.ok) return { ok: false, error: 'invalid' };
  if (sameContent(previous, updated.value)) return { ok: true, library, previous: null };
  return {
    ok: true,
    library: { ...library, archive: replaceAt(library.archive, index, updated.value) },
    previous,
  };
}

/** 撤销编辑：词条仍在归档库中时换回修改前的内容 */
export function restoreEntry(library: Library, previous: Entry): Library {
  const index = library.archive.findIndex((entry) => entry.id === previous.id);
  if (index < 0) return library;
  return { ...library, archive: replaceAt(library.archive, index, previous) };
}

// —— 章节 / 课时改名（F-052、F-053）——

export type RenameError = 'nameRequired' | 'nameTooLong' | 'nameTaken';

export interface ArchiveRename {
  readonly group: ArchiveGroup;
  /** 新名称 */
  readonly name: string;
  /** 改了名的词条（归档库与待测库） */
  readonly ids: readonly EntryId[];
  /** 改名前的排序表 */
  readonly order: ArchiveOrder;
}

export type RenameResult =
  | {
      readonly ok: true;
      readonly library: Library;
      /** 名称没有变化（或该组已不存在）时为 null */
      readonly rename: ArchiveRename | null;
    }
  | { readonly ok: false; readonly error: RenameError };

export function groupName(group: ArchiveGroup): string {
  return group.kind === 'chapter' ? group.chapter : group.lesson;
}

function withName(entry: Entry, group: ArchiveGroup, name: string): Entry {
  return group.kind === 'chapter' ? { ...entry, chapter: name } : { ...entry, lesson: name };
}

/** 改名后的组（name 须已规范化） */
export function renamedGroup(group: ArchiveGroup, name: string): ArchiveGroup {
  return group.kind === 'chapter'
    ? { kind: 'chapter', chapter: name }
    : { kind: 'lesson', chapter: group.chapter, lesson: name };
}

/** 把属于 group 的词条改名，记下改了哪些；没有可改的词条时返回原数组 */
function renameEntries(
  entries: readonly Entry[],
  group: ArchiveGroup,
  name: string,
  ids: EntryId[],
): readonly Entry[] {
  const matched = entries.filter((entry) => isInGroup(entry, group));
  if (matched.length === 0) return entries;
  ids.push(...matched.map(({ id }) => id));
  return entries.map((entry) => (isInGroup(entry, group) ? withName(entry, group, name) : entry));
}

/**
 * 章节或课时改名。待测库中同一章节（课时）的词一起改名（F-052），以后归档时才会落在同一个组里。
 * 与原版一致，不允许改成归档库中已有的名称（两组合并后无法再分开）。
 */
export function renameArchiveGroup(
  library: Library,
  group: ArchiveGroup,
  rawName: string,
): RenameResult {
  const name = normalizeText(rawName);
  if (name === '') return { ok: false, error: 'nameRequired' };
  if (name.length > LIMITS.groupNameLength) return { ok: false, error: 'nameTooLong' };
  if (name === groupName(group)) return { ok: true, library, rename: null };
  const target = renamedGroup(group, name);
  if (library.archive.some((entry) => isInGroup(entry, target))) {
    return { ok: false, error: 'nameTaken' };
  }

  const ids: EntryId[] = [];
  const archive = renameEntries(library.archive, group, name, ids);
  if (archive === library.archive) return { ok: true, library, rename: null };
  const pool = renameEntries(library.pool, group, name, ids);
  const order =
    group.kind === 'chapter'
      ? renameChapterInOrder(library.order, group.chapter, name)
      : renameLessonInOrder(library.order, group.chapter, group.lesson, name);
  return {
    ok: true,
    library: { ...library, pool, archive, order },
    rename: { group, name, ids, order: library.order },
  };
}

/** 撤销改名：只改回当时改了名、且名称仍是新名称的词条，并把组放回原来的位置 */
export function revertRename(
  library: Library,
  { group, name, ids, order }: ArchiveRename,
): Library {
  const targets = new Set(ids);
  const current = renamedGroup(group, name);
  const original = groupName(group);
  const revert = (entries: readonly Entry[]): readonly Entry[] => {
    const isTarget = (entry: Entry): boolean => targets.has(entry.id) && isInGroup(entry, current);
    if (!entries.some(isTarget)) return entries;
    return entries.map((entry) => (isTarget(entry) ? withName(entry, group, original) : entry));
  };
  const archive = revert(library.archive);
  const pool = revert(library.pool);
  if (archive === library.archive && pool === library.pool) return library;
  return { ...library, pool, archive, order: restorePositions(library.order, order) };
}
