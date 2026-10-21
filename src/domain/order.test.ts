import { describe, expect, it } from 'vitest';
import {
  EMPTY_ORDER,
  groupEntries,
  isSameOrder,
  moveChapter,
  moveItem,
  moveLesson,
  orderOfGroups,
  reconcileOrder,
  renameChapterInOrder,
  renameLessonInOrder,
  restorePositions,
  type ArchiveOrder,
  type Grouped,
} from './order';

interface Item extends Grouped {
  readonly name: string;
}

const item = (chapter: string, lesson: string, name: string): Item => ({ chapter, lesson, name });

const ITEMS: readonly Item[] = [
  item('A1', 'L1', 'a'),
  item('A2', 'L9', 'b'),
  item('A1', 'L2', 'c'),
  item('A1', 'L1', 'd'),
];

describe('groupEntries', () => {
  it('无排序表时按首次出现的顺序分组，组内保持原顺序', () => {
    const groups = groupEntries(ITEMS);
    expect(orderOfGroups(groups)).toEqual([
      { chapter: 'A1', lessons: ['L1', 'L2'] },
      { chapter: 'A2', lessons: ['L9'] },
    ]);
    expect(groups[0]?.lessons[0]?.entries.map(({ name }) => name)).toEqual(['a', 'd']);
    expect(groups[0]?.entryCount).toBe(3);
  });

  it('按排序表排列，忽略已不存在的组，未列出的组接在后面', () => {
    const order: ArchiveOrder = [
      { chapter: 'B1', lessons: ['X'] },
      { chapter: 'A2', lessons: ['L9'] },
      { chapter: 'A1', lessons: ['L2', 'gone'] },
    ];
    expect(orderOfGroups(groupEntries(ITEMS, order))).toEqual([
      { chapter: 'A2', lessons: ['L9'] },
      { chapter: 'A1', lessons: ['L2', 'L1'] },
    ]);
  });

  it('排序表中重复的章节与课时只取第一次', () => {
    const order: ArchiveOrder = [
      { chapter: 'A1', lessons: ['L2', 'L2'] },
      { chapter: 'A1', lessons: ['L1'] },
    ];
    expect(orderOfGroups(groupEntries(ITEMS, order))[0]).toEqual({
      chapter: 'A1',
      lessons: ['L2', 'L1'],
    });
  });

  it('空数据得到空分组', () => {
    expect(groupEntries([], [{ chapter: 'A1', lessons: ['L1'] }])).toEqual([]);
  });
});

describe('reconcileOrder', () => {
  it('已一致时返回原引用', () => {
    const order = orderOfGroups(groupEntries(ITEMS));
    expect(reconcileOrder(order, ITEMS)).toBe(order);
  });

  it('补齐新组并移除空组', () => {
    const order: ArchiveOrder = [{ chapter: 'Z', lessons: ['old'] }];
    const next = reconcileOrder(order, ITEMS);
    expect(next).not.toBe(order);
    expect(next).toEqual(orderOfGroups(groupEntries(ITEMS)));
  });

  it('空数据得到空排序表', () => {
    expect(reconcileOrder(EMPTY_ORDER, [])).toBe(EMPTY_ORDER);
  });
});

describe('isSameOrder', () => {
  it('比较章节与课时顺序', () => {
    const a: ArchiveOrder = [{ chapter: 'A1', lessons: ['L1', 'L2'] }];
    expect(isSameOrder(a, [{ chapter: 'A1', lessons: ['L1', 'L2'] }])).toBe(true);
    expect(isSameOrder(a, [{ chapter: 'A1', lessons: ['L2', 'L1'] }])).toBe(false);
    expect(isSameOrder(a, [])).toBe(false);
  });
});

describe('移动', () => {
  it('moveItem 移动并夹紧目标位置；无效或无变化时返回原数组', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(list, 2, -5)).toEqual(['c', 'a', 'b']);
    expect(moveItem(list, 1, 99)).toEqual(['a', 'c', 'b']);
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, -1, 0)).toBe(list);
    expect(moveItem(list, 3, 0)).toBe(list);
  });

  const order: ArchiveOrder = [
    { chapter: 'A1', lessons: ['L1', 'L2', 'L3'] },
    { chapter: 'A2', lessons: ['L9'] },
  ];

  it('moveChapter', () => {
    expect(moveChapter(order, 'A2', 0).map(({ chapter }) => chapter)).toEqual(['A2', 'A1']);
    expect(moveChapter(order, 'missing', 0)).toBe(order);
  });

  it('moveLesson 只修改所在章节', () => {
    const next = moveLesson(order, 'A1', 'L3', 0);
    expect(next[0]?.lessons).toEqual(['L3', 'L1', 'L2']);
    expect(next[1]).toBe(order[1]);
    expect(moveLesson(order, 'A1', 'missing', 0)[0]).toBe(order[0]);
  });
});

describe('改名', () => {
  const order: ArchiveOrder = [
    { chapter: 'A1', lessons: ['L1', 'L2'] },
    { chapter: 'A2', lessons: ['L2', 'L3'] },
  ];

  it('章节改为新名称时原地改名', () => {
    expect(renameChapterInOrder(order, 'A1', 'B1').map(({ chapter }) => chapter)).toEqual([
      'B1',
      'A2',
    ]);
  });

  it('章节改为已有名称时合并到目标章节', () => {
    expect(renameChapterInOrder(order, 'A1', 'A2')).toEqual([
      { chapter: 'A2', lessons: ['L2', 'L3', 'L1'] },
    ]);
  });

  it('同名或不存在时返回原排序表', () => {
    expect(renameChapterInOrder(order, 'A1', 'A1')).toBe(order);
    expect(renameChapterInOrder(order, 'X', 'Y')).toBe(order);
  });

  it('课时改名与合并', () => {
    expect(renameLessonInOrder(order, 'A1', 'L1', 'L5')[0]?.lessons).toEqual(['L5', 'L2']);
    expect(renameLessonInOrder(order, 'A1', 'L1', 'L2')[0]?.lessons).toEqual(['L2']);
    expect(renameLessonInOrder(order, 'A1', 'L1', 'L1')).toBe(order);
    expect(renameLessonInOrder(order, 'A1', 'missing', 'L9')[0]).toBe(order[0]);
  });
});

describe('restorePositions（撤销删除 / 改名）', () => {
  const before: ArchiveOrder = [
    { chapter: 'A1', lessons: ['L1', 'L2', 'L3'] },
    { chapter: 'A2', lessons: ['M1'] },
    { chapter: 'B1', lessons: ['N1'] },
  ];

  it('其间没有别的修改时精确还原', () => {
    const afterDelete: ArchiveOrder = [
      { chapter: 'A1', lessons: ['L1', 'L3'] },
      { chapter: 'B1', lessons: ['N1'] },
    ];
    expect(restorePositions(afterDelete, before)).toEqual(before);
  });

  it('其间有修改时按相邻关系插回，不打乱其余顺序', () => {
    const changed: ArchiveOrder = [
      { chapter: 'B1', lessons: ['N1'] },
      { chapter: 'C1', lessons: ['X'] },
      { chapter: 'A1', lessons: ['L3', 'L1'] },
    ];
    expect(restorePositions(changed, before)).toEqual([
      { chapter: 'B1', lessons: ['N1'] },
      { chapter: 'C1', lessons: ['X'] },
      { chapter: 'A1', lessons: ['L3', 'L1', 'L2'] },
      { chapter: 'A2', lessons: ['M1'] },
    ]);
  });

  it('没有缺少的组时返回原对象', () => {
    expect(restorePositions(before, before)).toBe(before);
    expect(restorePositions(before, EMPTY_ORDER)).toBe(before);
  });
});
