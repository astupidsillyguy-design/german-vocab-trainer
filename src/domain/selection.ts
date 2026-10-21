/**
 * 按课时多选（组合测试 F-055、按课时同步 F-076）：选择状态是课时键的集合，章节复选框据此显示全选 / 半选。
 */
import type { ChapterGroup, Grouped } from './order';
import type { QuizSection } from './quiz';

/** 课时的唯一键：章节名与课时名可以包含任意字符，用 JSON 数组编码，两段永远不会混淆 */
export function lessonKey(chapter: string, lesson: string): string {
  return JSON.stringify([chapter, lesson]);
}

export function chapterKey(chapter: string): string {
  return JSON.stringify([chapter]);
}

export type ChapterSelection = 'none' | 'some' | 'all';

export function chapterSelection<T extends Grouped>(
  group: ChapterGroup<T>,
  selected: ReadonlySet<string>,
): ChapterSelection {
  const count = group.lessons.filter(({ lesson }) =>
    selected.has(lessonKey(group.chapter, lesson)),
  ).length;
  if (count === 0) return 'none';
  return count === group.lessons.length ? 'all' : 'some';
}

export function toggleLesson(
  selected: ReadonlySet<string>,
  chapter: string,
  lesson: string,
): ReadonlySet<string> {
  const next = new Set(selected);
  const key = lessonKey(chapter, lesson);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** 整章已全选时取消整章，否则选中整章的全部课时（与 iOS 的“全选”一致） */
export function toggleChapter<T extends Grouped>(
  selected: ReadonlySet<string>,
  group: ChapterGroup<T>,
): ReadonlySet<string> {
  const next = new Set(selected);
  const selectAll = chapterSelection(group, selected) !== 'all';
  for (const { lesson } of group.lessons) {
    const key = lessonKey(group.chapter, lesson);
    if (selectAll) next.add(key);
    else next.delete(key);
  }
  return next;
}

/** 去掉已不存在的课时（被删除或改名）；没有变化时返回原集合 */
export function pruneSelection<T extends Grouped>(
  selected: ReadonlySet<string>,
  groups: readonly ChapterGroup<T>[],
): ReadonlySet<string> {
  if (selected.size === 0) return selected;
  const existing = new Set(
    groups.flatMap((group) => group.lessons.map(({ lesson }) => lessonKey(group.chapter, lesson))),
  );
  const kept = [...selected].filter((key) => existing.has(key));
  return kept.length === selected.size ? selected : new Set(kept);
}

/**
 * 选中的课时按显示顺序排列；整章都选中时合并成整章，测验标题因此显示章节名而不是一长串课时。
 * `groups` 应是完整的归档库分组（搜索时也一样），否则“整章”的判断会出错。
 */
export function selectedSections<T extends Grouped>(
  groups: readonly ChapterGroup<T>[],
  selected: ReadonlySet<string>,
): QuizSection[] {
  const sections: QuizSection[] = [];
  for (const group of groups) {
    const state = chapterSelection(group, selected);
    if (state === 'all') {
      sections.push({ chapter: group.chapter, lesson: null });
    } else if (state === 'some') {
      for (const { lesson } of group.lessons) {
        if (selected.has(lessonKey(group.chapter, lesson))) {
          sections.push({ chapter: group.chapter, lesson });
        }
      }
    }
  }
  return sections;
}

/** 某个课时（章节名 + 课时名） */
export interface LessonRef {
  readonly chapter: string;
  readonly lesson: string;
}

/** 选中的课时按显示顺序逐个列出（不合并整章，用于按课时同步：只覆盖确实选中的课时） */
export function selectedLessons<T extends Grouped>(
  groups: readonly ChapterGroup<T>[],
  selected: ReadonlySet<string>,
): LessonRef[] {
  return groups.flatMap((group) =>
    group.lessons
      .filter(({ lesson }) => selected.has(lessonKey(group.chapter, lesson)))
      .map(({ chapter, lesson }) => ({ chapter, lesson })),
  );
}

/** 全部课时的键（“全选”） */
export function allLessonKeys<T extends Grouped>(
  groups: readonly ChapterGroup<T>[],
): ReadonlySet<string> {
  return new Set(
    groups.flatMap((group) => group.lessons.map(({ lesson }) => lessonKey(group.chapter, lesson))),
  );
}
