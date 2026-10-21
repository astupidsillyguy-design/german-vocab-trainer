import { describe, expect, it } from 'vitest';
import { makeLesson } from '../test/entries';
import type { Entry } from './model';
import { groupEntries } from './order';
import {
  allLessonKeys,
  chapterKey,
  chapterSelection,
  lessonKey,
  pruneSelection,
  selectedLessons,
  selectedSections,
  toggleChapter,
  toggleLesson,
} from './selection';

const NONE: ReadonlySet<string> = new Set();

const ENTRIES: readonly Entry[] = [
  ...makeLesson('A1', '第1讲', ['柜子', '桌子']),
  ...makeLesson('A1', '第2讲', ['猫']),
  ...makeLesson('A2', '第5讲', ['工作']),
];
const GROUPS = groupEntries(ENTRIES, []);

function chapter(name: string) {
  const group = GROUPS.find((item) => item.chapter === name);
  if (group === undefined) throw new Error(`缺少章节 ${name}`);
  return group;
}

describe('课时与章节的键', () => {
  it('名称中含有分隔符或引号时也不会混淆', () => {
    expect(lessonKey('A · 1', '2')).not.toBe(lessonKey('A', '1 · 2'));
    expect(lessonKey('"A"', 'B')).not.toBe(lessonKey('A', '"B"'));
    expect(chapterKey('A1')).not.toBe(lessonKey('A1', ''));
  });
});

describe('组合测试的选择（F-055）', () => {
  it('章节的选择状态：未选、部分、全部', () => {
    const a1 = chapter('A1');
    expect(chapterSelection(a1, NONE)).toBe('none');
    const one = toggleLesson(NONE, 'A1', '第1讲');
    expect(chapterSelection(a1, one)).toBe('some');
    expect(chapterSelection(a1, toggleLesson(one, 'A1', '第2讲'))).toBe('all');
  });

  it('再次点按课时取消选择', () => {
    const once = toggleLesson(NONE, 'A1', '第1讲');
    expect(toggleLesson(once, 'A1', '第1讲').size).toBe(0);
  });

  it('章节复选框：未全选时选中整章，已全选时取消整章', () => {
    const a1 = chapter('A1');
    const partial = toggleLesson(NONE, 'A1', '第1讲');
    const all = toggleChapter(partial, a1);
    expect(chapterSelection(a1, all)).toBe('all');
    expect(chapterSelection(a1, toggleChapter(all, a1))).toBe('none');
  });

  it('去掉已删除或改名的课时；没有变化时返回原集合', () => {
    const selected = new Set([lessonKey('A1', '第1讲'), lessonKey('A1', '已删除')]);
    expect([...pruneSelection(selected, GROUPS)]).toEqual([lessonKey('A1', '第1讲')]);
    const valid = new Set([lessonKey('A2', '第5讲')]);
    expect(pruneSelection(valid, GROUPS)).toBe(valid);
  });

  it('按显示顺序给出测验范围，整章选中时合并为整章（只选 1 个课时也可以）', () => {
    expect(selectedSections(GROUPS, toggleLesson(NONE, 'A2', '第5讲'))).toEqual([
      { chapter: 'A2', lesson: null },
    ]);
    const mixed = toggleLesson(toggleLesson(NONE, 'A2', '第5讲'), 'A1', '第2讲');
    expect(selectedSections(GROUPS, mixed)).toEqual([
      { chapter: 'A1', lesson: '第2讲' },
      { chapter: 'A2', lesson: null },
    ]);
  });
});

describe('按课时同步的选择（F-076）', () => {
  it('逐个列出选中的课时，整章选中时也不合并', () => {
    const all = allLessonKeys(GROUPS);
    expect(all.size).toBe(3);
    expect(selectedLessons(GROUPS, all)).toEqual([
      { chapter: 'A1', lesson: '第1讲' },
      { chapter: 'A1', lesson: '第2讲' },
      { chapter: 'A2', lesson: '第5讲' },
    ]);
    expect(selectedLessons(GROUPS, toggleLesson(NONE, 'A1', '第2讲'))).toEqual([
      { chapter: 'A1', lesson: '第2讲' },
    ]);
    expect(selectedLessons(GROUPS, NONE)).toEqual([]);
  });
});
