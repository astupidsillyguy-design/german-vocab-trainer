import { describe, expect, it } from 'vitest';
import { parseWordList } from '../../domain';
import { previewPage } from './sections';

const GROUPS = {
  defaultChapter: '自定义词库',
  defaultLesson: '当前词条集',
  untitledChapter: '未命名章节',
  untitledLesson: '未命名课时',
};

const TEXT = [
  'der Tisch 桌子',
  '# A1',
  '## Lektion 1',
  'der Schrank 柜子',
  'kaputt',
  'der Schrank 柜子',
  '## Lektion 2',
  'helfen 帮助',
  '# B1',
  'endlich Adv. 总算',
].join('\n');

const lines = parseWordList(TEXT, GROUPS).lines;

describe('previewPage', () => {
  it('按章节 · 课时分段，标题行不单独成行；第一个标题之前的词条归入默认分组', () => {
    const page = previewPage(lines, GROUPS, 'all', Infinity);
    expect(
      page.sections.map(({ chapter, lesson, lines: rows }) => [
        chapter,
        lesson,
        rows.map((row) => row.number),
      ]),
    ).toEqual([
      ['自定义词库', '当前词条集', [1]],
      ['A1', 'Lektion 1', [4, 5, 6]],
      ['A1', 'Lektion 2', [8]],
      ['B1', '当前词条集', [10]],
    ]);
    expect(page.sections.map(({ key }) => key)).toEqual([1, 4, 8, 10]);
    expect(page).toMatchObject({ shown: 6, total: 6 });
  });

  it('“有问题”只显示未识别与重复的行，并保留所在分组', () => {
    const page = previewPage(lines, GROUPS, 'problems', Infinity);
    expect(page.sections).toHaveLength(1);
    expect(page.sections[0]?.lines.map(({ number, kind }) => [number, kind])).toEqual([
      [5, 'error'],
      [6, 'duplicate'],
    ]);
    expect(page.total).toBe(2);
  });

  it('超过上限的行不渲染，但计入总数', () => {
    const page = previewPage(lines, GROUPS, 'all', 2);
    expect(page.sections.flatMap((section) => section.lines.map(({ number }) => number))).toEqual([
      1, 4,
    ]);
    expect(page).toMatchObject({ shown: 2, total: 6 });
  });

  it('没有词条行时没有分段', () => {
    const page = previewPage(parseWordList('# A1\n## L1', GROUPS).lines, GROUPS, 'all', 10);
    expect(page).toEqual({ sections: [], shown: 0, total: 0 });
  });
});
