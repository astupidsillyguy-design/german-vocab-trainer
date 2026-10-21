/**
 * 设备直连同步的数据（F-076 – F-079）：只同步归档库与归档排序，待测库永远不受影响。
 *
 * - 整库覆盖（full）：接收方的归档库与排序整体替换为发送方的内容；
 * - 按课时覆盖（lessons）：只替换选中的课时，其余课时原样保留；新课时按发送方的顺序排在后面。
 *
 * 发送方按显示顺序排列词条，接收方因此得到与发送方一致的排列。
 * 来自对端的数据一律经过 syncPayloadSchema 校验后才会使用。
 */
import { array, literal, object, parse, refine, type Schema } from '../shared/schema';
import { fingerprintOf, type Fingerprint } from './fingerprint';
import { newEntryId, type EntryId } from './id';
import type { Library } from './library';
import { LIMITS } from './limits';
import type { Entry } from './model';
import {
  groupEntries,
  orderOfGroups,
  reconcileOrder,
  type ArchiveOrder,
  type ChapterOrder,
} from './order';
import { archiveOrderSchema, entrySchema, groupNameSchema } from './schemas';
import { lessonKey, type LessonRef } from './selection';

export const SYNC_MODES = ['full', 'lessons'] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

/** 发送方选择的范围 */
export type SyncScope =
  { readonly mode: 'full' } | { readonly mode: 'lessons'; readonly lessons: readonly LessonRef[] };

export interface SyncPayload {
  readonly mode: SyncMode;
  /** 按课时覆盖时要替换的课时（发送方的显示顺序）；整库覆盖时为空 */
  readonly lessons: readonly LessonRef[];
  /** 按发送方的显示顺序排列 */
  readonly entries: readonly Entry[];
  readonly order: ArchiveOrder;
}

function keyOf({ chapter, lesson }: LessonRef): string {
  return lessonKey(chapter, lesson);
}

/** 发送方：按选择的范围取出归档库中的词条（显示顺序）与对应的排序 */
export function buildSyncPayload(library: Library, scope: SyncScope): SyncPayload {
  const groups = groupEntries(library.archive, library.order);
  if (scope.mode === 'full') {
    return {
      mode: 'full',
      lessons: [],
      entries: groups.flatMap((group) => group.lessons.flatMap((lesson) => lesson.entries)),
      order: orderOfGroups(groups),
    };
  }
  const wanted = new Set(scope.lessons.map(keyOf));
  const lessons = groups
    .flatMap((group) => group.lessons)
    .filter((lesson) => wanted.has(keyOf(lesson)));
  const entries = lessons.flatMap((lesson) => lesson.entries);
  return {
    mode: 'lessons',
    lessons: lessons.map(({ chapter, lesson }) => ({ chapter, lesson })),
    entries,
    order: orderOfGroups(groupEntries(entries, library.order)),
  };
}

/** 整库覆盖不列课时；按课时覆盖至少一个课时，且每个词都属于所列课时 */
function isConsistent(payload: SyncPayload): boolean {
  if (payload.mode === 'full') return payload.lessons.length === 0;
  if (payload.lessons.length === 0) return false;
  const keys = new Set(payload.lessons.map(keyOf));
  return payload.entries.every((entry) => keys.has(keyOf(entry)));
}

const lessonRefSchema = object({ chapter: groupNameSchema, lesson: groupNameSchema });

export const syncPayloadSchema: Schema<SyncPayload> = refine(
  object({
    mode: literal(...SYNC_MODES),
    lessons: array(lessonRefSchema, { max: LIMITS.entriesPerCollection }),
    entries: array(entrySchema, { max: LIMITS.entriesPerCollection }),
    order: archiveOrderSchema,
  }),
  isConsistent,
);

/** 校验对端发来的数据；不合法时返回 null */
export function parseSyncPayload(input: unknown): SyncPayload | null {
  const result = parse(syncPayloadSchema, input);
  return result.ok ? result.value : null;
}

/** 接收方本机将被替换的词：整库覆盖时是整个归档库，按课时覆盖时是所列课时中的词 */
function replacedEntries(library: Library, payload: SyncPayload): readonly Entry[] {
  if (payload.mode === 'full') return library.archive;
  const keys = new Set(payload.lessons.map(keyOf));
  return library.archive.filter((entry) => keys.has(keyOf(entry)));
}

/** 本机的排序在前；对方的新课时补在所属章节末尾，新章节按对方的顺序排在最后 */
function mergeOrder(local: ArchiveOrder, incoming: ArchiveOrder): ArchiveOrder {
  const incomingLessons = new Map(incoming.map(({ chapter, lessons }) => [chapter, lessons]));
  const merged = local.map((item): ChapterOrder => {
    const extra = incomingLessons.get(item.chapter);
    return extra === undefined
      ? item
      : { chapter: item.chapter, lessons: [...new Set([...item.lessons, ...extra])] };
  });
  const known = new Set(local.map(({ chapter }) => chapter));
  return [...merged, ...incoming.filter(({ chapter }) => !known.has(chapter))];
}

/**
 * 接收方：写入对方的数据（调用方负责先保存快照）。待测库不变；
 * 对方词条的 id 与本机保留的词条（含待测库）或彼此重复时换成新的 id，保证 id 唯一。
 */
export function applySyncPayload(
  library: Library,
  payload: SyncPayload,
  makeId: () => EntryId = () => newEntryId(),
): Library {
  const replaced = new Set(replacedEntries(library, payload));
  const kept = library.archive.filter((entry) => !replaced.has(entry));
  const used = new Set<string>([...library.pool, ...kept].map(({ id }) => id));
  const incoming = payload.entries.map((entry) => {
    const next = used.has(entry.id) ? { ...entry, id: makeId() } : entry;
    used.add(next.id);
    return next;
  });
  const archive = [...kept, ...incoming];
  const order = payload.mode === 'full' ? payload.order : mergeOrder(library.order, payload.order);
  return { ...library, archive, order: reconcileOrder(order, archive) };
}

export interface SyncLessonChange extends LessonRef {
  /** 对方发来的词数（0 表示整库覆盖后该课时将被删除） */
  readonly incoming: number;
  /** 本机该课时现有的词数（0 表示新课时） */
  readonly current: number;
}

export interface SyncPreview {
  readonly mode: SyncMode;
  readonly incoming: {
    readonly entries: number;
    readonly lessons: number;
    readonly chapters: number;
  };
  /** 本机将被替换的词数 */
  readonly replaced: number;
  /** 按内容比较（同一课时、题面与标准答案相同视为同一个词）：对方有、本机没有的词 */
  readonly added: number;
  /** 本机有、对方没有的词（将被删除） */
  readonly removed: number;
  /** 两边都有的词 */
  readonly unchanged: number;
  /** 涉及的课时：本机已有的按本机顺序在前，新课时按对方的顺序在后 */
  readonly lessons: readonly SyncLessonChange[];
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

/** 接收方确认前的预览（F-078）：会替换什么、新增和删除多少 */
export function previewSyncPayload(library: Library, payload: SyncPayload): SyncPreview {
  const replaced = replacedEntries(library, payload);
  const incomingCounts = countBy(payload.entries, keyOf);
  const currentCounts = countBy(replaced, keyOf);

  const remaining = new Map<Fingerprint, number>();
  for (const entry of replaced) {
    const fingerprint = fingerprintOf(entry);
    remaining.set(fingerprint, (remaining.get(fingerprint) ?? 0) + 1);
  }
  let unchanged = 0;
  for (const entry of payload.entries) {
    const fingerprint = fingerprintOf(entry);
    const count = remaining.get(fingerprint) ?? 0;
    if (count > 0) {
      unchanged += 1;
      remaining.set(fingerprint, count - 1);
    }
  }

  const localLessons = groupEntries(replaced, library.order).flatMap((group) => group.lessons);
  const incomingLessons = groupEntries(payload.entries, payload.order).flatMap(
    (group) => group.lessons,
  );
  const seen = new Set<string>();
  const lessons: SyncLessonChange[] = [];
  for (const { chapter, lesson } of [...localLessons, ...incomingLessons]) {
    const key = lessonKey(chapter, lesson);
    if (seen.has(key)) continue;
    seen.add(key);
    lessons.push({
      chapter,
      lesson,
      incoming: incomingCounts.get(key) ?? 0,
      current: currentCounts.get(key) ?? 0,
    });
  }

  return {
    mode: payload.mode,
    incoming: {
      entries: payload.entries.length,
      lessons: incomingCounts.size,
      chapters: new Set(payload.entries.map(({ chapter }) => chapter)).size,
    },
    replaced: replaced.length,
    added: payload.entries.length - unchanged,
    removed: replaced.length - unchanged,
    unchanged,
    lessons,
  };
}
