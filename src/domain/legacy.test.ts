import { describe, expect, it } from 'vitest';
import { makeEntry, testId, TEST_NOW } from '../test/entries';
import {
  convertLegacy,
  dumpFromKeyMap,
  LEGACY_EXPORT_KIND,
  LEGACY_EXPORT_VERSION,
  LEGACY_KEYS,
  LIMITS,
  mergeLibraries,
  readLegacyFile,
  withoutBareNouns,
  type EntryId,
  type LegacyDump,
} from '.';

/** 原版的词条：答案已按原版规则展开（名词额外接受不带冠词与全小写的写法） */
const SCHRANK = {
  chapter: 'A1',
  lesson: '第30讲: Ein Apartment im Studentenwohnheim',
  prompt: '柜子',
  answers: ['der Schrank', 'Schrank', 'der schrank', 'schrank'],
  baseForm: null,
  derivedForm: null,
  linkedDerivedForms: ['eingeschrankt'],
  archivedAt: null,
  _uid: 'uid_abc',
};

const HELFEN = {
  chapter: 'A1',
  lesson: '第30讲: Ein Apartment im Studentenwohnheim',
  prompt: '在……方面帮助某人',
  answers: ['jm bei etw.(D.) helfen', 'jm bei etw(D) helfen', 'jm bei etw. helfen'],
};

function ids(): () => EntryId {
  let serial = 0;
  return () => {
    serial += 1;
    return testId(serial);
  };
}

function convert(dump: LegacyDump) {
  return convertLegacy(dump, { now: TEST_NOW, newId: ids() });
}

describe('withoutBareNouns', () => {
  it('名词只保留带冠词的答案', () => {
    expect(withoutBareNouns(['der Schrank', 'Schrank', 'schrank'])).toEqual(['der Schrank']);
    expect(withoutBareNouns(['die Musik', 'Musik', 'die musik'])).toEqual([
      'die Musik',
      'die musik',
    ]);
  });

  it('不是名词或没有不带冠词的写法时原样返回', () => {
    const verb = ['helfen'];
    expect(withoutBareNouns(verb)).toBe(verb);
    const noun = ['der Schrank'];
    expect(withoutBareNouns(noun)).toBe(noun);
    // 只有不带冠词的写法时无从得知冠词，保留
    const bare = ['Schrank'];
    expect(withoutBareNouns(bare)).toBe(bare);
  });
});

describe('convertLegacy', () => {
  it('转换待测库：新 UUID、去掉不带冠词的名词答案、保留变形记录', () => {
    const result = convert({ pool: JSON.stringify([SCHRANK, HELFEN]) });
    const [schrank, helfen] = result.library.pool;
    expect(schrank).toEqual({
      id: testId(1),
      chapter: 'A1',
      lesson: '第30讲: Ein Apartment im Studentenwohnheim',
      prompt: '柜子',
      answers: ['der Schrank'],
      verbForm: null,
      linkedForms: ['eingeschrankt'],
      createdAt: TEST_NOW.toISOString(),
      archivedAt: null,
    });
    // 判分时等价的写法合并为一个（标点视为空格）
    expect(helfen?.answers).toEqual(['jm bei etw.(D.) helfen', 'jm bei etw. helfen']);
    expect(result.stats).toEqual({
      pool: 2,
      archive: 0,
      backup: 0,
      synthetic: 0,
      bareNouns: 1,
      rejected: 0,
    });
    expect(result.backup).toBeNull();
  });

  it('按原版的加载规则整理：补默认分类，跳过自动生成的“原形”词条', () => {
    const result = convert({
      pool: [
        { prompt: '桌子', answers: ['der Tisch'] },
        { prompt: '原形（eingezogen的二分词）', answers: ['einziehen'] },
        {
          prompt: '原形（eingezogen的二分词）',
          answers: ['einziehen'],
          baseForm: 'einziehen',
          derivedForm: 'eingezogen',
        },
      ],
    });
    expect(result.library.pool).toHaveLength(2);
    expect(result.library.pool[0]).toMatchObject({
      chapter: 'A1',
      lesson: 'Ein Apartment im Studentenwohnheim',
    });
    expect(result.stats.synthetic).toBe(1);
  });

  it('动词变形：根据题面区分二分词与过去式', () => {
    const result = convert({
      pool: [
        {
          prompt: 'einziehen的二分词',
          answers: ['eingezogen'],
          baseForm: 'einziehen',
          derivedForm: 'eingezogen',
        },
        {
          prompt: 'gehen的过去式',
          answers: ['ging'],
          baseForm: 'gehen',
          derivedForm: 'ging',
        },
      ],
    });
    expect(result.library.pool.map(({ verbForm }) => verbForm)).toEqual([
      { kind: 'partizip2', base: 'einziehen' },
      { kind: 'praeteritum', base: 'gehen' },
    ]);
  });

  it('归档库：统一旧分类，识别归档日期，无法识别时用迁移时间', () => {
    const result = convert({
      archive: JSON.stringify([
        { ...SCHRANK, chapter: 'A1：第30讲', lesson: '', archivedAt: '2024-11-03' },
        { ...HELFEN, chapter: 'A1', lesson: 'In den Ferien', archivedAt: '已归档' },
        { ...HELFEN, prompt: '帮助', archivedAt: '2024-12-01T10:00:00.000Z' },
      ]),
    });
    const [first, second, third] = result.library.archive;
    expect(first).toMatchObject({
      chapter: 'A1',
      lesson: '第30讲: Ein Apartment im Studentenwohnheim',
      createdAt: '2024-11-03T00:00:00.000Z',
      archivedAt: '2024-11-03T00:00:00.000Z',
    });
    expect(second).toMatchObject({
      lesson: '第33讲: In den Ferien',
      archivedAt: TEST_NOW.toISOString(),
    });
    expect(third?.archivedAt).toBe('2024-12-01T10:00:00.000Z');
    expect(result.stats.archive).toBe(3);
  });

  it('排序表：按原版记录的章节与课时顺序', () => {
    const result = convert({
      archive: [
        { ...SCHRANK, chapter: 'A1', lesson: 'L1' },
        { ...SCHRANK, chapter: 'A1', lesson: 'L2' },
        { ...SCHRANK, chapter: 'B1', lesson: 'L9' },
      ],
      order: JSON.stringify({ chapters: ['B1', 'A1', '已删除'], lessons: { A1: ['L2', 'L1'] } }),
    });
    expect(result.library.order).toEqual([
      { chapter: 'B1', lessons: ['L9'] },
      { chapter: 'A1', lessons: ['L2', 'L1'] },
    ]);
  });

  it('接收同步前的备份：归档库与排序来自备份，待测库沿用迁移结果', () => {
    const result = convert({
      pool: [SCHRANK],
      archive: [],
      backup: JSON.stringify({
        archivedList: [{ ...HELFEN, chapter: 'B1', lesson: 'L1' }],
        archiveOrder: { chapters: ['B1'], lessons: { B1: ['L1'] } },
      }),
    });
    expect(result.backup?.pool).toBe(result.library.pool);
    expect(result.backup?.archive.map(({ chapter }) => chapter)).toEqual(['B1']);
    expect(result.backup?.order).toEqual([{ chapter: 'B1', lessons: ['L1'] }]);
    expect(result.stats.backup).toBe(1);
  });

  it('无法转换的数据原样交出，不影响其余部分', () => {
    const broken = '[{"prompt": "坏';
    const result = convert({
      pool: [SCHRANK, 'x', { ...SCHRANK, answers: [] }],
      archive: broken,
      order: '"x"',
      backup: { archivedList: 'x' },
    });
    expect(result.library.pool).toHaveLength(1);
    expect(result.rejected).toEqual([
      { part: 'pool', issues: ['pool[1]: type'], raw: 'x' },
      {
        part: 'pool',
        issues: ['pool[2].answers: too_short'],
        raw: { ...SCHRANK, answers: [] },
      },
      { part: 'archive', issues: ['archive: invalid'], raw: broken },
      { part: 'order', issues: ['order: type'], raw: 'x' },
      { part: 'backup', issues: ['backup.archivedList: type'], raw: 'x' },
    ]);
    expect(result.stats.rejected).toBe(5);
  });

  it('词条数超出上限的集合整体交出', () => {
    const tooMany = Array.from({ length: LIMITS.entriesPerCollection + 1 }, () => SCHRANK);
    const result = convert({ pool: tooMany });
    expect(result.library.pool).toEqual([]);
    expect(result.rejected).toEqual([{ part: 'pool', issues: ['pool: too_long'], raw: tooMany }]);
  });

  it('JSON 中的 null 视为没有保存过', () => {
    const result = convert({ pool: 'null', backup: 'null' });
    expect(result.library.pool).toEqual([]);
    expect(result.backup).toBeNull();
    expect(result.rejected).toEqual([]);
  });
});

describe('readLegacyFile', () => {
  const pool = JSON.stringify([SCHRANK]);

  it('读取导出工具生成的文件', () => {
    const file = JSON.stringify({
      kind: LEGACY_EXPORT_KIND,
      version: LEGACY_EXPORT_VERSION,
      exportedAt: TEST_NOW.toISOString(),
      keys: { [LEGACY_KEYS.pool]: pool, DE_QUIZ_ARCHIVE_IMPORTED_A1_33_V1: '1' },
    });
    expect(readLegacyFile(file)).toEqual({ ok: true, dump: { pool } });
  });

  it('也接受直接导出的 localStorage，以及带 BOM 的文件', () => {
    const file = `\uFEFF${JSON.stringify({ [LEGACY_KEYS.archive]: pool, other: 'x' })}`;
    expect(readLegacyFile(file)).toEqual({ ok: true, dump: { archive: pool } });
  });

  it('不是 JSON 或没有旧数据时报告原因', () => {
    expect(readLegacyFile('{')).toEqual({ ok: false, error: 'invalid-json' });
    expect(readLegacyFile('[]')).toEqual({ ok: false, error: 'no-legacy-data' });
    expect(readLegacyFile('{"a": 1}')).toEqual({ ok: false, error: 'no-legacy-data' });
  });
});

describe('dumpFromKeyMap', () => {
  it('只取出存在的部分；一项都没有时返回 null', () => {
    const storage = new Map<string, string>([[LEGACY_KEYS.order, '{}']]);
    expect(dumpFromKeyMap((key) => storage.get(key))).toEqual({ order: '{}' });
    expect(dumpFromKeyMap(() => null)).toBeNull();
  });
});

describe('mergeLibraries', () => {
  const schrank = makeEntry({ chapter: 'A1', lesson: 'L1', prompt: '柜子' });
  const tisch = makeEntry({ chapter: 'A1', lesson: 'L2', prompt: '桌子', answers: ['der Tisch'] });
  const archived = makeEntry({ chapter: 'B1', lesson: 'L9', archivedAt: TEST_NOW.toISOString() });

  it('跳过已有的词，新章节排在后面', () => {
    const current = { pool: [schrank], archive: [], order: [] };
    const incoming = {
      pool: [{ ...schrank, id: testId(900) }, tisch],
      archive: [archived],
      order: [{ chapter: 'B1', lessons: ['L9'] }],
    };
    const result = mergeLibraries(current, incoming);
    if (!result.ok) throw new Error('合并失败');
    expect(result.library.pool).toEqual([schrank, tisch]);
    expect(result.library.archive).toEqual([archived]);
    expect(result.added).toEqual({ pool: 1, archive: 1 });
    expect(result.duplicates).toBe(1);
  });

  it('合并后超出上限时拒绝', () => {
    const many = Array.from({ length: LIMITS.entriesPerCollection }, (_, index) =>
      makeEntry({ prompt: `词${String(index)}` }),
    );
    const result = mergeLibraries(
      { pool: many, archive: [], order: [] },
      { pool: [tisch], archive: [], order: [] },
    );
    expect(result).toEqual({ ok: false, error: 'too-many' });
  });
});
