/**
 * 章节 / 课时的排序（F-008：由数据驱动）。
 *
 * 有哪些章节和课时完全由词条决定；排序表只记录用户的排列偏好：
 * - 排序表里有、数据里已没有的组自动忽略；
 * - 数据里有、排序表里没有的组按首次出现的顺序排在后面；
 * - 组内词条保持原有顺序。
 * 因此排序表永远不会与数据“不同步”，原版的 ensureArchiveOrder 修补逻辑不再需要。
 */

export interface ChapterOrder {
  readonly chapter: string;
  readonly lessons: readonly string[];
}

export type ArchiveOrder = readonly ChapterOrder[];

export const EMPTY_ORDER: ArchiveOrder = [];

export interface Grouped {
  readonly chapter: string;
  readonly lesson: string;
}

export interface LessonGroup<T extends Grouped> {
  readonly chapter: string;
  readonly lesson: string;
  readonly entries: readonly T[];
}

export interface ChapterGroup<T extends Grouped> {
  readonly chapter: string;
  readonly lessons: readonly LessonGroup<T>[];
  readonly entryCount: number;
}

function bucketize<T extends Grouped>(entries: readonly T[]): Map<string, Map<string, T[]>> {
  const chapters = new Map<string, Map<string, T[]>>();
  for (const entry of entries) {
    let lessons = chapters.get(entry.chapter);
    if (lessons === undefined) {
      lessons = new Map();
      chapters.set(entry.chapter, lessons);
    }
    let items = lessons.get(entry.lesson);
    if (items === undefined) {
      items = [];
      lessons.set(entry.lesson, items);
    }
    items.push(entry);
  }
  return chapters;
}

/** 先按偏好顺序取出存在的键，再按出现顺序补上其余键；重复的键只保留第一次 */
function orderedKeys(
  preferred: Iterable<string>,
  existing: ReadonlyMap<string, unknown>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const take = (key: string): void => {
    if (seen.has(key) || !existing.has(key)) return;
    seen.add(key);
    result.push(key);
  };
  for (const key of preferred) take(key);
  for (const key of existing.keys()) take(key);
  return result;
}

function preferredLessons(order: ArchiveOrder): Map<string, readonly string[]> {
  const lessons = new Map<string, readonly string[]>();
  for (const { chapter, lessons: names } of order) {
    if (!lessons.has(chapter)) lessons.set(chapter, names);
  }
  return lessons;
}

export function groupEntries<T extends Grouped>(
  entries: readonly T[],
  order: ArchiveOrder = EMPTY_ORDER,
): ChapterGroup<T>[] {
  const buckets = bucketize(entries);
  const preferred = preferredLessons(order);
  const groups: ChapterGroup<T>[] = [];
  for (const chapter of orderedKeys(
    order.map((item) => item.chapter),
    buckets,
  )) {
    const lessonBuckets = buckets.get(chapter);
    if (lessonBuckets === undefined) continue;
    const lessons: LessonGroup<T>[] = [];
    let entryCount = 0;
    for (const lesson of orderedKeys(preferred.get(chapter) ?? [], lessonBuckets)) {
      const items = lessonBuckets.get(lesson);
      if (items === undefined) continue;
      lessons.push({ chapter, lesson, entries: items });
      entryCount += items.length;
    }
    groups.push({ chapter, lessons, entryCount });
  }
  return groups;
}

export function orderOfGroups<T extends Grouped>(groups: readonly ChapterGroup<T>[]): ArchiveOrder {
  return groups.map(({ chapter, lessons }) => ({
    chapter,
    lessons: lessons.map(({ lesson }) => lesson),
  }));
}

function isSameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function isSameOrder(a: ArchiveOrder, b: ArchiveOrder): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index];
      return other?.chapter === item.chapter && isSameList(item.lessons, other.lessons);
    })
  );
}

/** 让排序表与数据一致；没有变化时返回原对象（引用不变，便于判断是否需要写入） */
export function reconcileOrder(order: ArchiveOrder, entries: readonly Grouped[]): ArchiveOrder {
  const next = orderOfGroups(groupEntries(entries, order));
  return isSameOrder(order, next) ? order : next;
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from < 0 || from >= items.length) return items;
  const target = clampIndex(to, items.length);
  if (target === from) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items;
  next.splice(target, 0, moved);
  return next;
}

export function moveChapter(order: ArchiveOrder, chapter: string, toIndex: number): ArchiveOrder {
  return moveItem(
    order,
    order.findIndex((item) => item.chapter === chapter),
    toIndex,
  );
}

export function moveLesson(
  order: ArchiveOrder,
  chapter: string,
  lesson: string,
  toIndex: number,
): ArchiveOrder {
  return order.map((item) => {
    if (item.chapter !== chapter) return item;
    const lessons = moveItem(item.lessons, item.lessons.indexOf(lesson), toIndex);
    return lessons === item.lessons ? item : { chapter, lessons };
  });
}

function mergeLists(first: readonly string[], second: readonly string[]): string[] {
  return [...first, ...second.filter((value) => !first.includes(value))];
}

/** 章节改名；若新名称已存在则两章合并（课时接在目标章节之后），位置取目标章节 */
export function renameChapterInOrder(order: ArchiveOrder, from: string, to: string): ArchiveOrder {
  if (from === to) return order;
  const source = order.find((item) => item.chapter === from);
  if (source === undefined) return order;
  const target = order.find((item) => item.chapter === to);
  if (target === undefined) {
    return order.map((item) => (item === source ? { chapter: to, lessons: item.lessons } : item));
  }
  return order
    .filter((item) => item !== source)
    .map((item) =>
      item === target ? { chapter: to, lessons: mergeLists(target.lessons, source.lessons) } : item,
    );
}

/** 课时改名；若同章内新名称已存在则合并到已有课时的位置 */
export function renameLessonInOrder(
  order: ArchiveOrder,
  chapter: string,
  from: string,
  to: string,
): ArchiveOrder {
  if (from === to) return order;
  return order.map((item) => {
    if (item.chapter !== chapter || !item.lessons.includes(from)) return item;
    const lessons = item.lessons.includes(to)
      ? item.lessons.filter((lesson) => lesson !== from)
      : item.lessons.map((lesson) => (lesson === from ? to : lesson));
    return { chapter, lessons };
  });
}

/**
 * 把 previous 中有、list 中没有的项插回原来的位置：紧跟在它原先前面、现在仍然存在的那一项之后。
 * 其间没有别的修改时可以精确还原；有修改时也只按相邻关系插回，不打乱其余项的顺序。
 */
function insertMissing<T>(
  list: readonly T[],
  previous: readonly T[],
  keyOf: (item: T) => string,
): readonly T[] {
  const result = [...list];
  const keys = result.map(keyOf);
  let anchor = -1;
  for (const item of previous) {
    const key = keyOf(item);
    const position = keys.indexOf(key);
    if (position >= 0) {
      anchor = position;
      continue;
    }
    anchor += 1;
    result.splice(anchor, 0, item);
    keys.splice(anchor, 0, key);
  }
  return result.length === list.length ? list : result;
}

const identity = (value: string): string => value;

/**
 * 撤销删除或改名：把操作前排序表中的章节与课时放回原来的位置，其余保持当前顺序。
 * 当前已经不存在的组会在 normalizeLibrary 中去掉，因此这里只需要“插回”。
 */
export function restorePositions(current: ArchiveOrder, previous: ArchiveOrder): ArchiveOrder {
  const previousLessons = preferredLessons(previous);
  const merged = current.map((item) => {
    const before = previousLessons.get(item.chapter);
    if (before === undefined) return item;
    const lessons = insertMissing(item.lessons, before, identity);
    return lessons === item.lessons ? item : { chapter: item.chapter, lessons };
  });
  const restored = insertMissing(merged, previous, (item) => item.chapter);
  return isSameOrder(restored, current) ? current : restored;
}
