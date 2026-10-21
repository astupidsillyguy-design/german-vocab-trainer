import { describe, expect, it } from 'vitest';
import { makeEntry, TEST_NOW, testId } from '../test/entries';
import {
  archiveEntries,
  archiveStats,
  entriesInSections,
  filterEntries,
  unitArchiveStatus,
} from './archive';
import { normalizeLibrary, type Library } from './library';

const ARCHIVED_AT = new Date('2025-02-01T09:00:00.000Z');

const SCHRANK = makeEntry({ id: testId(1), prompt: '柜子', answers: ['der Schrank'] });
const TISCH = makeEntry({ id: testId(2), prompt: '桌子', answers: ['der Tisch'] });
const STUHL = makeEntry({
  id: testId(3),
  chapter: 'A2',
  lesson: '第2讲',
  prompt: '椅子',
  answers: ['der Stuhl'],
});

function libraryOf(pool: Library['pool'], archive: Library['archive'] = []): Library {
  return normalizeLibrary({ pool, archive, order: [] });
}

describe('archiveEntries（F-036 一键归档）', () => {
  it('按待测库中的顺序移到归档库末尾，记下归档时间，章节与课时保持原名', () => {
    const old = makeEntry({ id: testId(9), prompt: '旧词', archivedAt: TEST_NOW.toISOString() });
    const library = libraryOf([SCHRANK, TISCH, STUHL], [old]);
    const { library: next, archived } = archiveEntries(
      library,
      [STUHL.id, SCHRANK.id],
      ARCHIVED_AT,
    );

    expect(archived).toBe(2);
    expect(next.pool).toEqual([TISCH]);
    expect(next.archive.map((entry) => entry.id)).toEqual([old.id, SCHRANK.id, STUHL.id]);
    expect(next.archive[1]).toEqual({ ...SCHRANK, archivedAt: ARCHIVED_AT.toISOString() });
    expect(next.archive[2]?.chapter).toBe('A2');
    expect(next.archive[2]?.lesson).toBe('第2讲');
    // 其余部分保持原引用：持久化层只写入变化的集合
    expect(next.order).toBe(library.order);
    expect(normalizeLibrary(next).order).toEqual([
      { chapter: 'A1', lessons: ['第30讲'] },
      { chapter: 'A2', lessons: ['第2讲'] },
    ]);
  });

  it('只归档仍在待测库中的词；一个都没有时返回原对象', () => {
    const library = libraryOf([TISCH]);
    expect(archiveEntries(library, [SCHRANK.id], ARCHIVED_AT)).toEqual({ library, archived: 0 });
    expect(archiveEntries(library, [], ARCHIVED_AT).library).toBe(library);
  });

  it('归档库中已有同一个词时不重复添加，只从待测库移除', () => {
    const existing = makeEntry({
      id: testId(8),
      prompt: SCHRANK.prompt,
      answers: SCHRANK.answers,
      archivedAt: TEST_NOW.toISOString(),
    });
    const duplicate = makeEntry({
      id: testId(7),
      prompt: SCHRANK.prompt,
      answers: SCHRANK.answers,
    });
    const library = libraryOf([SCHRANK, duplicate, TISCH], [existing]);
    const { library: next, archived } = archiveEntries(
      library,
      [SCHRANK.id, duplicate.id, TISCH.id],
      ARCHIVED_AT,
    );

    expect(archived).toBe(3);
    expect(next.pool).toEqual([]);
    expect(next.archive.map((entry) => entry.id)).toEqual([existing.id, TISCH.id]);
  });

  it('全部是重复词时归档库保持原引用', () => {
    const existing = makeEntry({ id: testId(8), prompt: TISCH.prompt, answers: TISCH.answers });
    const library = libraryOf([TISCH], [existing]);
    const { library: next } = archiveEntries(library, [TISCH.id], ARCHIVED_AT);
    expect(next.pool).toEqual([]);
    expect(next.archive).toBe(library.archive);
  });
});

describe('unitArchiveStatus', () => {
  it('列出仍在待测库中的词，并统计已在归档库中的词', () => {
    const library = libraryOf([TISCH], [{ ...SCHRANK, id: testId(8) }]);
    expect(unitArchiveStatus(library, [SCHRANK, TISCH, STUHL])).toEqual({
      pending: [TISCH.id],
      archived: 1,
    });
  });

  it('归档之后：没有待归档的词', () => {
    const { library } = archiveEntries(
      libraryOf([SCHRANK, TISCH]),
      [SCHRANK.id, TISCH.id],
      ARCHIVED_AT,
    );
    expect(unitArchiveStatus(library, [SCHRANK, TISCH])).toEqual({ pending: [], archived: 2 });
  });
});

describe('归档库浏览', () => {
  const HELFEN = makeEntry({
    id: testId(4),
    chapter: 'A1',
    lesson: '第31讲',
    prompt: '在……方面帮助某人',
    answers: ['jm. bei etw.(D.) helfen', 'jm. bei etw. helfen'],
  });
  const ENTRIES = [SCHRANK, TISCH, STUHL, HELFEN];

  it('archiveStats（F-042）：词数与章节数', () => {
    expect(archiveStats(ENTRIES)).toEqual({ entries: 4, chapters: 2 });
    expect(archiveStats([])).toEqual({ entries: 0, chapters: 0 });
  });

  it('filterEntries（F-043）：匹配答案、释义、章节与课时；不区分大小写，标点视为空格', () => {
    const ids = (query: string) => filterEntries(ENTRIES, query).map((entry) => entry.id);
    expect(ids('SCHRANK')).toEqual([SCHRANK.id]);
    expect(ids('桌')).toEqual([TISCH.id]);
    expect(ids('a2')).toEqual([STUHL.id]);
    expect(ids('第31讲')).toEqual([HELFEN.id]);
    expect(ids('jm bei')).toEqual([HELFEN.id]);
    expect(ids('不存在')).toEqual([]);
  });

  it('filterEntries：关键词为空白时返回原数组；不跨字段匹配', () => {
    expect(filterEntries(ENTRIES, '  ')).toBe(ENTRIES);
    // “der Schrank”的末尾与“柜子”的开头不应拼成一个可匹配的串
    expect(filterEntries(ENTRIES, 'schrank 柜')).toEqual([]);
  });

  it('entriesInSections（F-048 / F-055）：整章或指定课时，保持原顺序', () => {
    expect(entriesInSections(ENTRIES, [{ chapter: 'A1', lesson: null }])).toEqual([
      SCHRANK,
      TISCH,
      HELFEN,
    ]);
    expect(
      entriesInSections(ENTRIES, [
        { chapter: 'A2', lesson: '第2讲' },
        { chapter: 'A1', lesson: '第31讲' },
      ]),
    ).toEqual([STUHL, HELFEN]);
    expect(entriesInSections(ENTRIES, [])).toEqual([]);
  });
});
