import { describe, expect, it } from 'vitest';
import { makeEntry, TEST_NOW, testId } from '../test/entries';
import { EMPTY_LIBRARY } from './library';
import { LineCache } from './wordList/cache';
import { LIMITS } from './limits';
import type { EntryContent } from './model';
import {
  createWordListParser,
  extractPartOfSpeech,
  formatEntryLine,
  formatWordList,
  isSamePool,
  normalizePartOfSpeech,
  parseLine,
  parseWordList,
  repairLine,
  replacePool,
  type LineDraft,
  type ParsedLine,
  type WordListOptions,
} from './wordList';

const OPTIONS: WordListOptions = {
  defaultChapter: '自定义词库',
  defaultLesson: '当前词条集',
  untitledChapter: '未命名章节',
  untitledLesson: '未命名课时',
};

function draftOf(line: string): LineDraft {
  const parsed = parseLine(line);
  if (parsed.kind !== 'entry') throw new Error(`未识别为词条：${line}（${parsed.kind}）`);
  return parsed.draft;
}

function kindsOf(lines: readonly ParsedLine[]): string[] {
  return lines.map((line) => line.kind);
}

describe('词性标注', () => {
  it.each([
    ['adv', 'Adv.'],
    ['Adjektiv', 'Adj.'],
    ['v.t.', 'vt.'],
    ['VR', 'Vr.'],
    ['präp', 'Präp.'],
    ['Konj.', 'Konj.'],
    ['mst. sg', 'mst Sg'],
    ['nur Pl', 'nur Pl'],
    ['pl', 'Pl.'],
    ['(interj)', 'Interj.'],
  ])('统一写法：%s → %s', (tag, expected) => {
    expect(normalizePartOfSpeech(tag)).toBe(expected);
  });

  it('取出末尾或括号中的标注', () => {
    expect(extractPartOfSpeech('endlich Adv.')).toEqual({ text: 'endlich', tag: 'Adv.' });
    expect(extractPartOfSpeech('froh (Adj.)')).toEqual({ text: 'froh', tag: 'Adj.' });
    expect(extractPartOfSpeech('die Musik mst Sg')).toEqual({ text: 'die Musik', tag: 'mst Sg' });
    expect(extractPartOfSpeech('einziehen')).toEqual({ text: 'einziehen', tag: null });
  });

  it('名词本身与标注同形时不拆（原版会把“die Art”拆成“die”）', () => {
    expect(extractPartOfSpeech('die Art')).toEqual({ text: 'die Art', tag: null });
    expect(extractPartOfSpeech('Art')).toEqual({ text: 'Art', tag: null });
  });
});

describe('拍照文字修复规则（F-063）', () => {
  it('去掉不可见字符并提示', () => {
    expect(repairLine('Schrän\u00ADke\u200B')).toEqual({
      text: 'Schränke',
      applied: ['invisible'],
    });
  });

  it('表格竖线、列表符号与编号只是排版，清理后不提示', () => {
    expect(repairLine('| der Schrank | 柜子 |').applied).toEqual([]);
    expect(repairLine('• der Schrank 柜子').text.trim()).toBe('der Schrank 柜子');
    expect(repairLine('12. der Schrank 柜子')).toEqual({ text: 'der Schrank 柜子', applied: [] });
  });

  it('全角字母、印刷连字与丢失的词首字母', () => {
    expect(repairLine('ｄｅｒ Ｓｃｈｒａｎｋ')).toEqual({
      text: 'der Schrank',
      applied: ['full-width'],
    });
    expect(repairLine('ﬁnden 找到').text).toBe('finden 找到');
    expect(repairLine('ützlich 有用的')).toEqual({
      text: 'nützlich 有用的',
      applied: ['dropped-letter'],
    });
  });

  it('只修正完整的词，不改动更长的词', () => {
    expect(repairLine('unnützlich').text).toBe('unnützlich');
    expect(repairLine('nötig 必要的').applied).toEqual([]);
  });
});

describe('单行解析（F-064）', () => {
  it('普通名词只接受带冠词的标准答案', () => {
    expect(draftOf('der Schrank 柜子')).toEqual({
      prompt: '柜子',
      answers: ['der Schrank'],
      verbForm: null,
    });
    expect(draftOf('Das Einrichten, - 布置、整理').answers).toEqual(['das Einrichten']);
    expect(draftOf('der Stuhl, ¨-e 椅子').answers).toEqual(['der Stuhl']);
  });

  it('特殊名词：数量限定移到释义', () => {
    expect(draftOf('die Musik mst Sg, 音乐')).toEqual({
      prompt: '音乐 [mst Sg]',
      answers: ['die Musik'],
      verbForm: null,
    });
    expect(draftOf('die Leute (Pl.) 人们').prompt).toBe('人们 [Pl.]');
  });

  it('副词、形容词与动词', () => {
    expect(draftOf('endlich Adv. 总算，终于')).toMatchObject({
      prompt: '总算，终于 [Adv.]',
      answers: ['endlich'],
    });
    expect(draftOf('froh Adj. 高兴的').prompt).toBe('高兴的 [Adj.]');
    expect(draftOf('einziehen 搬入').answers).toEqual(['einziehen']);
  });

  it('短语：去掉括号说明的写法也算对', () => {
    expect(draftOf('jm bei etw.(D.) helfen 在……方面帮助某人').answers).toEqual([
      'jm bei etw.(D.) helfen',
      'jm bei etw. helfen',
    ]);
  });

  it('括号里的中文说明属于释义（原版会丢掉）', () => {
    expect(draftOf('das Apartment (小型、单人居住的)公寓住房')).toMatchObject({
      prompt: '(小型、单人居住的)公寓住房',
      answers: ['das Apartment'],
    });
  });

  it('等号后的德语解释不计入答案', () => {
    expect(draftOf('fernsehen = TV schauen 看电视').answers).toEqual(['fernsehen']);
  });

  it('列表行照常解析，不再被当成标题吞掉（F-062）', () => {
    expect(draftOf('* der Schrank 柜子').answers).toEqual(['der Schrank']);
    expect(draftOf('- der Schrank 柜子').answers).toEqual(['der Schrank']);
    expect(draftOf('3) der Schrank 柜子').answers).toEqual(['der Schrank']);
    expect(draftOf('**der Schrank** 柜子').answers).toEqual(['der Schrank']);
  });

  it('没有中日文释义时可以用制表符、“ - ”或冒号分隔', () => {
    expect(draftOf('der Schrank\twardrobe')).toMatchObject({ prompt: 'wardrobe' });
    expect(draftOf('endlich Adv. - finally')).toMatchObject({
      prompt: 'finally [Adv.]',
      answers: ['endlich'],
    });
    expect(draftOf('der Schrank：wardrobe').prompt).toBe('wardrobe');
  });

  it('日文假名释义', () => {
    expect(draftOf('der Schrank たんす').prompt).toBe('たんす');
  });

  it('标题：#、##、整行加粗', () => {
    expect(parseLine('# A1')).toEqual({ kind: 'chapter', name: 'A1' });
    expect(parseLine('#A1 ##')).toEqual({ kind: 'chapter', name: 'A1' });
    expect(parseLine('## Lektion 1')).toEqual({ kind: 'lesson', name: 'Lektion 1' });
    expect(parseLine('### **Lektion 2**')).toEqual({ kind: 'lesson', name: 'Lektion 2' });
    expect(parseLine('**Lektion 3**')).toEqual({ kind: 'lesson', name: 'Lektion 3' });
    expect(parseLine('#')).toEqual({ kind: 'chapter', name: '' });
  });

  it('没有字母的行（空行、分隔线）忽略', () => {
    expect(parseLine('')).toEqual({ kind: 'blank' });
    expect(parseLine('---')).toEqual({ kind: 'blank' });
    expect(parseLine('|---|---|')).toEqual({ kind: 'blank' });
  });

  it('缺少释义或德语时报告原因', () => {
    expect(parseLine('der Schrank')).toEqual({ kind: 'error', reason: 'no-prompt', repairs: [] });
    expect(parseLine('柜子')).toEqual({ kind: 'error', reason: 'no-answer', repairs: [] });
  });
});

describe('动词变形关系（F-065）', () => {
  it('二分词与过去式', () => {
    expect(draftOf('eingezogen einziehen的二分词')).toEqual({
      prompt: 'einziehen的二分词',
      answers: ['eingezogen'],
      verbForm: { kind: 'partizip2', base: 'einziehen' },
    });
    expect(draftOf('zog ein “einziehen” 的过去式')).toEqual({
      prompt: 'einziehen的过去式',
      answers: ['zog ein'],
      verbForm: { kind: 'praeteritum', base: 'einziehen' },
    });
    expect(draftOf('half helfen 的 Präteritum').verbForm).toEqual({
      kind: 'praeteritum',
      base: 'helfen',
    });
    expect(draftOf('geholfen helfen的第二分词').verbForm?.kind).toBe('partizip2');
  });

  it('原形可以写在括号里', () => {
    expect(draftOf('eingezogen (einziehen)的二分词').verbForm).toEqual({
      kind: 'partizip2',
      base: 'einziehen',
    });
  });

  it('变形与原形相同时按普通词条解析', () => {
    expect(draftOf('kommen kommen的二分词').verbForm).toBeNull();
  });
});

describe('整份词表（F-062）', () => {
  it('按 # 章节、## 课时分组；新章节从默认课时开始', () => {
    const result = parseWordList(
      [
        'der Tisch 桌子',
        '# A1',
        'der Stuhl 椅子',
        '## Lektion 1',
        'das Bett 床',
        '# A2',
        'die Lampe 灯',
      ].join('\n'),
      OPTIONS,
    );
    expect(result.entries.map(({ chapter, lesson }) => [chapter, lesson])).toEqual([
      ['自定义词库', '当前词条集'],
      ['A1', '当前词条集'],
      ['A1', 'Lektion 1'],
      ['A2', '当前词条集'],
    ]);
    expect(result.counts).toEqual({
      entries: 4,
      chapters: 3,
      lessons: 4,
      problems: 0,
      duplicates: 0,
    });
  });

  it('没写名称的标题使用“未命名”', () => {
    const result = parseWordList('#\n##\nder Tisch 桌子', OPTIONS);
    expect(result.entries[0]).toMatchObject({ chapter: '未命名章节', lesson: '未命名课时' });
  });

  it('记录行号与位置（兼容 CRLF），空行不出现在结果中', () => {
    const text = '# A1\r\n\r\nder Tisch 桌子\r\nder Stuhl';
    const result = parseWordList(text, OPTIONS);
    expect(kindsOf(result.lines)).toEqual(['chapter', 'entry', 'error']);
    const [, entry, error] = result.lines;
    expect(entry).toMatchObject({ number: 3, source: 'der Tisch 桌子' });
    expect(entry && text.slice(entry.start, entry.end)).toBe('der Tisch 桌子');
    expect(error).toMatchObject({ number: 4, problem: { reason: 'no-prompt' } });
    expect(result.counts.problems).toBe(1);
  });

  it('重复的词只保存一次，并指出第一次出现的行', () => {
    const result = parseWordList('der Tisch 桌子\nder Tisch 桌子\n# B\nder Tisch 桌子', OPTIONS);
    expect(kindsOf(result.lines)).toEqual(['entry', 'duplicate', 'chapter', 'entry']);
    expect(result.lines[1]).toMatchObject({ kind: 'duplicate', original: 1 });
    expect(result.counts).toMatchObject({ entries: 2, duplicates: 1 });
  });

  it('超长的字段逐行报告', () => {
    const longPrompt = '长'.repeat(LIMITS.promptLength + 1);
    const longName = 'A'.repeat(LIMITS.groupNameLength + 1);
    const result = parseWordList(`der Tisch ${longPrompt}\n# ${longName}\nder Stuhl 椅子`, OPTIONS);
    expect(result.lines[0]).toMatchObject({
      kind: 'error',
      problem: { reason: 'too-long', field: 'prompt', max: LIMITS.promptLength },
    });
    expect(result.lines[1]).toMatchObject({
      kind: 'error',
      problem: { reason: 'too-long', field: 'chapter', max: LIMITS.groupNameLength },
    });
    // 无效的标题不切换分组
    expect(result.entries[0]?.chapter).toBe('自定义词库');
  });

  it('超过词条上限的行不保存', () => {
    const lines = Array.from(
      { length: LIMITS.entriesPerCollection + 1 },
      (_, index) => `Wort${String(index)} 词`,
    );
    const result = parseWordList(lines.join('\n'), OPTIONS);
    expect(result.counts.entries).toBe(LIMITS.entriesPerCollection);
    expect(result.lines.at(-1)).toMatchObject({
      kind: 'error',
      problem: { reason: 'over-limit', max: LIMITS.entriesPerCollection },
    });
  });

  it('变形题的答案记到原形词条上（F-065）', () => {
    const result = parseWordList(
      'einziehen 搬入\neingezogen einziehen的二分词\nzog ein einziehen的过去式',
      OPTIONS,
    );
    expect(result.entries[0]?.linkedForms).toEqual(['eingezogen', 'zog ein']);
    expect(result.lines[0]).toMatchObject({
      kind: 'entry',
      entry: { linkedForms: ['eingezogen', 'zog ein'] },
    });
    expect(result.entries[1]?.linkedForms).toEqual([]);
  });

  it('被修正的行带有规则标记', () => {
    const result = parseWordList('ｄｅｒ Ｔｉｓｃｈ 桌子', OPTIONS);
    expect(result.lines[0]).toMatchObject({
      kind: 'entry',
      repairs: ['full-width'],
      entry: { answers: ['der Tisch'] },
    });
  });
});

describe('增量与分段解析', () => {
  const text = Array.from({ length: 300 }, (_, index) => `Wort${String(index)} 词`).join('\n');

  it('未改动的行复用上一次的结果对象', () => {
    const parser = createWordListParser(OPTIONS);
    const first = parser.parse(text);
    const second = parser.parse(text.replace('Wort5 词', 'Wort5 词语'));
    expect(second.entries[0]).toBe(first.entries[0]);
    expect(second.entries[5]).not.toBe(first.entries[5]);
    expect(second.entries[5]?.prompt).toBe('词语');
  });

  it('同一行换到另一个分组时重新校验', () => {
    const parser = createWordListParser(OPTIONS);
    const first = parser.parse('der Tisch 桌子');
    const second = parser.parse('# A1\nder Tisch 桌子');
    expect(second.entries[0]).not.toBe(first.entries[0]);
    expect(second.entries[0]?.chapter).toBe('A1');
  });

  it('分段解析：每次让出后可以继续，结果与同步解析一致', () => {
    const parser = createWordListParser(OPTIONS);
    const job = parser.start(text);
    let slices = 0;
    let result = null;
    while (result === null) {
      slices += 1;
      result = job.resume(() => true);
    }
    expect(slices).toBeGreaterThan(1);
    expect(result).toEqual(parseWordList(text, OPTIONS));
    // 完成后再次调用直接返回结果
    expect(job.resume(() => true)).toBe(result);
  });
});

describe('按行缓存', () => {
  it('命中时不重新计算；缓存明显大于当前行数时淘汰本次没用到的条目', () => {
    const cache = new LineCache<string, number>();
    let computed = 0;
    const compute = (): number => {
      computed += 1;
      return computed;
    };
    const keys = Array.from({ length: 600 }, (_, index) => `k${String(index)}`);
    for (const key of keys) cache.get(key, compute);
    cache.endPass(keys.length);
    expect(cache.get('k1', compute)).toBe(2);
    expect(computed).toBe(keys.length);
    // 只用到一个键：600 > 1 × 2 + 余量，其余条目被淘汰
    cache.endPass(1);
    expect(cache.size).toBe(1);
  });
});

describe('词表文本（往返）', () => {
  const SOURCE = [
    '# A1',
    '',
    '## Ein Apartment im Studentenwohnheim',
    'das Apartment (小型、单人居住的)公寓住房',
    'die Musik mst Sg, 音乐',
    'endlich Adv. 总算，终于，到底',
    'jm bei etw.(D.) helfen 在……方面帮助某人',
    'einziehen 搬入',
    'eingezogen einziehen的二分词',
    '',
    '## Wortschatz',
    'der Schrank - wardrobe',
  ].join('\n');

  it('格式化后能原样读回', () => {
    const first = parseWordList(SOURCE, OPTIONS);
    const text = formatWordList(first.entries);
    const second = parseWordList(text, OPTIONS);
    expect(second.entries).toEqual(first.entries);
    expect(second.counts.problems).toBe(0);
    expect(text).toContain('# A1\n\n## Ein Apartment im Studentenwohnheim\ndas Apartment');
    expect(text).toContain('die Musik 音乐 [mst Sg]');
  });

  it('释义不以中日文开头时用“ - ”分隔', () => {
    const entry: EntryContent = makeEntry({ answers: ['der Schrank'], prompt: 'wardrobe' });
    expect(formatEntryLine(entry)).toBe('der Schrank - wardrobe');
    expect(formatEntryLine(makeEntry({ prompt: '柜子' }))).toBe('der Schrank 柜子');
  });

  it('同一章节、课时的词条合并输出（按首次出现的顺序）', () => {
    const entries = [
      makeEntry({ chapter: 'B', lesson: '1', prompt: '桌子', answers: ['der Tisch'] }),
      makeEntry({ chapter: 'A', lesson: '1', prompt: '椅子', answers: ['der Stuhl'] }),
      makeEntry({ chapter: 'B', lesson: '1', prompt: '床', answers: ['das Bett'] }),
    ];
    expect(formatWordList(entries)).toBe(
      '# B\n\n## 1\nder Tisch 桌子\ndas Bett 床\n\n# A\n\n## 1\nder Stuhl 椅子',
    );
    expect(formatWordList([])).toBe('');
  });
});

describe('整体替换待测库（F-067）', () => {
  const table = makeEntry({ id: testId(1), prompt: '桌子', answers: ['der Tisch'] });
  const chair = makeEntry({ id: testId(2), prompt: '椅子', answers: ['der Stuhl'] });
  const library = {
    ...EMPTY_LIBRARY,
    pool: [table, chair],
    archive: [makeEntry({ id: testId(9) })],
  };

  it('内容未变的词条保留 ID 与创建时间；新词条获得新 ID', () => {
    const contents = parseWordList('# A1\n## 第30讲\nder Stuhl 椅子\ndas Bett 床', OPTIONS).entries;
    const next = replacePool(library, contents, {
      now: new Date('2025-02-01T00:00:00.000Z'),
      newId: () => testId(3),
    });
    expect(next.pool.map((entry) => entry.id)).toEqual([testId(2), testId(3)]);
    expect(next.pool[0]).toBe(chair);
    expect(next.pool[1]).toMatchObject({
      createdAt: '2025-02-01T00:00:00.000Z',
      archivedAt: null,
      prompt: '床',
    });
    expect(next.archive).toBe(library.archive);
  });

  it('指纹相同、其他内容变了的词条保留 ID 并更新内容', () => {
    const [content] = parseWordList('# A1\n## 第30讲\nder Tisch 桌子', OPTIONS).entries;
    if (content === undefined) throw new Error('解析失败');
    const changed = { ...content, answers: ['der Tisch', 'die Tische'] as const };
    const [entry] = replacePool(library, [changed]).pool;
    expect(entry).toMatchObject({ id: testId(1), createdAt: TEST_NOW.toISOString() });
    expect(entry?.answers).toEqual(['der Tisch', 'die Tische']);
  });

  it('判断内容是否与当前待测库一致（含顺序）', () => {
    expect(isSamePool(library.pool, [table, chair])).toBe(true);
    expect(isSamePool(library.pool, [chair, table])).toBe(false);
    expect(isSamePool(library.pool, [table])).toBe(false);
  });
});
