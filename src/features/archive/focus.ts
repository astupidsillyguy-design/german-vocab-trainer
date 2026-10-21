/**
 * 删除与改名后的焦点去向（WCAG 2.4.3 焦点顺序）。
 *
 * 删除按钮随被删的词条、课时或章节一起消失；改名后章节 / 课时以新名称重新挂载。
 * 对话框或面板关闭时焦点于是无处可回、落到页面开头。
 * 管理模式下每个词条、课时、章节的操作按钮（铅笔或垃圾桶，同一时刻只有一种）都带有唯一键；
 * 删除时按“同级的下一个 → 同级的上一个 → 上一级”的顺序给出候选，
 * 与 iOS 列表删除后焦点停留在相邻行的行为一致。
 */
import {
  chapterKey,
  lessonKey,
  type ArchiveGroup,
  type ArchiveTarget,
  type ChapterGroup,
  type Grouped,
} from '../../domain';

const FOCUS_KEY_ATTRIBUTE = 'data-focus-key';

/** 词条、课时或章节的唯一键（词条 id 是 UUID，组的键是 JSON 数组，两者不会重复） */
export function focusKey(target: ArchiveTarget): string {
  switch (target.kind) {
    case 'entry':
      return target.id;
    case 'chapter':
      return chapterKey(target.chapter);
    case 'lesson':
      return lessonKey(target.chapter, target.lesson);
  }
}

/** 写在管理模式的操作按钮上，删除或改名后据此找回按钮 */
export function focusKeyProps(target: ArchiveTarget): { readonly [FOCUS_KEY_ATTRIBUTE]: string } {
  return { [FOCUS_KEY_ATTRIBUTE]: focusKey(target) };
}

/** 同级的下一个、上一个（不含自己） */
function neighbors<T>(items: readonly T[], index: number): T[] {
  return [items[index + 1], items[index - 1]].filter((item) => item !== undefined);
}

function chapterFallbacks<T extends Grouped & { readonly id: string }>(
  groups: readonly ChapterGroup<T>[],
  chapterIndex: number,
): ArchiveGroup[] {
  return neighbors(groups, chapterIndex).map(({ chapter }) => ({ kind: 'chapter', chapter }));
}

/** 课时消失后的候选：同章的相邻课时 → 所在章节 → 相邻章节 */
function lessonFallbacks<T extends Grouped & { readonly id: string }>(
  groups: readonly ChapterGroup<T>[],
  chapterIndex: number,
  lessonIndex: number,
): ArchiveGroup[] {
  const group = groups[chapterIndex];
  if (group === undefined) return [];
  return [
    ...neighbors(group.lessons, lessonIndex).map(({ lesson }): ArchiveGroup => ({
      kind: 'lesson',
      chapter: group.chapter,
      lesson,
    })),
    { kind: 'chapter', chapter: group.chapter },
    ...chapterFallbacks(groups, chapterIndex),
  ];
}

/**
 * 删除 `target` 后依次尝试聚焦的按钮（键）。
 * 删掉课时的最后一个词时课时本身也会消失，因此词条的候选里包含课时之后的各级候选。
 */
export function removalFallbacks<T extends Grouped & { readonly id: string }>(
  groups: readonly ChapterGroup<T>[],
  target: ArchiveTarget,
): string[] {
  for (const [chapterIndex, group] of groups.entries()) {
    if (target.kind === 'chapter') {
      if (group.chapter === target.chapter) {
        return chapterFallbacks(groups, chapterIndex).map(focusKey);
      }
      continue;
    }
    if (target.kind === 'lesson' && group.chapter !== target.chapter) continue;
    for (const [lessonIndex, lesson] of group.lessons.entries()) {
      const afterLesson = () => lessonFallbacks(groups, chapterIndex, lessonIndex).map(focusKey);
      if (target.kind === 'lesson') {
        if (lesson.lesson === target.lesson) return afterLesson();
        continue;
      }
      const entryIndex = lesson.entries.findIndex(({ id }) => id === target.id);
      if (entryIndex !== -1) {
        return [
          ...neighbors(lesson.entries, entryIndex).map(({ id }) => id),
          lessonKey(group.chapter, lesson.lesson),
          ...afterLesson(),
        ];
      }
    }
  }
  return [];
}

/** 页面上第一个仍然存在的候选按钮 */
export function findFocusTarget(keys: readonly string[]): HTMLElement | null {
  const buttons = new Map<string, HTMLElement>();
  for (const element of document.querySelectorAll<HTMLElement>(`[${FOCUS_KEY_ATTRIBUTE}]`)) {
    const key = element.getAttribute(FOCUS_KEY_ATTRIBUTE);
    if (key !== null) buttons.set(key, element);
  }
  for (const key of keys) {
    const button = buttons.get(key);
    if (button !== undefined) return button;
  }
  return null;
}
