import { describe, expect, it } from 'vitest';
import { chapterKey, groupEntries, lessonKey, type Entry } from '../../domain';
import { makeEntry, makeLesson, testId } from '../../test/entries';
import { followRename, type BrowseState } from './expansion';
import { focusKey, removalFallbacks } from './focus';
import { afterDoublePress, afterSinglePress } from './manageMode';

const ENTRIES: readonly Entry[] = [
  ...makeLesson('A1', '第1讲', ['柜子', '桌子']),
  ...makeLesson('A1', '第2讲', ['猫']),
  ...makeLesson('A2', '第5讲', ['工作']),
];
const GROUPS = groupEntries(ENTRIES, []);

describe('管理模式（F-050）', () => {
  it('单击进入或退出编辑模式', () => {
    expect(afterSinglePress('none')).toBe('edit');
    expect(afterSinglePress('edit')).toBe('none');
    expect(afterSinglePress('delete')).toBe('none');
  });

  it('双击按第一下之前的模式判断：进入删除模式，已在删除模式时退出', () => {
    expect(afterDoublePress('none')).toBe('delete');
    expect(afterDoublePress('edit')).toBe('delete');
    expect(afterDoublePress('delete')).toBe('none');
  });
});

describe('删除后的焦点候选', () => {
  const [schrank, tisch, katze, arbeit] = ENTRIES;
  if (schrank === undefined || tisch === undefined || katze === undefined || arbeit === undefined) {
    throw new Error('测试数据不完整');
  }

  it('词条：同课时的下一个、上一个，然后是课时与更上级', () => {
    expect(removalFallbacks(GROUPS, { kind: 'entry', id: schrank.id })).toEqual([
      tisch.id,
      lessonKey('A1', '第1讲'),
      lessonKey('A1', '第2讲'),
      chapterKey('A1'),
      chapterKey('A2'),
    ]);
    expect(removalFallbacks(GROUPS, { kind: 'entry', id: tisch.id })[0]).toBe(schrank.id);
  });

  it('课时的最后一个词：课时会一起消失，候选包含相邻课时', () => {
    expect(removalFallbacks(GROUPS, { kind: 'entry', id: katze.id })).toEqual([
      lessonKey('A1', '第2讲'),
      lessonKey('A1', '第1讲'),
      chapterKey('A1'),
      chapterKey('A2'),
    ]);
  });

  it('课时与章节：相邻的同级，然后是上一级', () => {
    expect(removalFallbacks(GROUPS, { kind: 'lesson', chapter: 'A2', lesson: '第5讲' })).toEqual([
      chapterKey('A2'),
      chapterKey('A1'),
    ]);
    expect(removalFallbacks(GROUPS, { kind: 'chapter', chapter: 'A1' })).toEqual([
      chapterKey('A2'),
    ]);
  });

  it('目标不在当前显示的分组里时没有候选', () => {
    const other = makeEntry({ id: testId(99) });
    expect(removalFallbacks(GROUPS, { kind: 'entry', id: other.id })).toEqual([]);
    expect(removalFallbacks(GROUPS, { kind: 'chapter', chapter: 'B1' })).toEqual([]);
  });

  it('词条与组的键互不重复', () => {
    expect(focusKey({ kind: 'entry', id: arbeit.id })).toBe(arbeit.id);
    expect(focusKey({ kind: 'chapter', chapter: 'A1' })).toBe(chapterKey('A1'));
    expect(focusKey({ kind: 'lesson', chapter: 'A1', lesson: '第1讲' })).toBe(
      lessonKey('A1', '第1讲'),
    );
  });
});

describe('改名后展开状态跟随新名称', () => {
  const state: BrowseState = {
    chapter: 'A1',
    lessons: new Map([
      ['A1', '第1讲'],
      ['A2', '第5讲'],
    ]),
  };

  it('章节改名：展开的章节与它记住的课时都换成新名称', () => {
    const next = followRename(
      state,
      { kind: 'chapter', chapter: 'A1' },
      { kind: 'chapter', chapter: 'B1' },
    );
    expect(next.chapter).toBe('B1');
    expect([...next.lessons]).toEqual([
      ['A2', '第5讲'],
      ['B1', '第1讲'],
    ]);
  });

  it('课时改名：只有展开的那个课时需要跟随', () => {
    const lesson = (name: string) => ({ kind: 'lesson', chapter: 'A1', lesson: name }) as const;
    expect(followRename(state, lesson('第1讲'), lesson('第3讲')).lessons.get('A1')).toBe('第3讲');
    expect(followRename(state, lesson('第2讲'), lesson('第3讲'))).toBe(state);
  });
});
