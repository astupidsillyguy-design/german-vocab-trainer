import { describe, expect, it } from 'vitest';
import { makeEntry, TEST_NOW, testId } from '../test/entries';
import { createEntry, normalizeContent, updateEntry } from './entry';
import { LIMITS } from './limits';

const BASE = { chapter: ' A1 ', lesson: '第30讲', prompt: ' 柜子 ', answers: ['der Schrank'] };

describe('normalizeContent', () => {
  it('整理空白并补齐可选字段', () => {
    const result = normalizeContent(BASE);
    expect(result).toEqual({
      ok: true,
      value: {
        chapter: 'A1',
        lesson: '第30讲',
        prompt: '柜子',
        answers: ['der Schrank'],
        verbForm: null,
        linkedForms: [],
      },
    });
  });

  it('答案去空，并按判分规则去重（保留第一次的写法）', () => {
    const result = normalizeContent({
      ...BASE,
      answers: ['  ', 'der Schrank', 'Der  Schrank.', 'die Schränke'],
    });
    expect(result.ok && result.value.answers).toEqual(['der Schrank', 'die Schränke']);
  });

  it('ä 与 ae 视为不同答案，不会被去重', () => {
    const result = normalizeContent({ ...BASE, answers: ['die Gärten', 'die Gaerten'] });
    expect(result.ok && result.value.answers).toEqual(['die Gärten', 'die Gaerten']);
  });

  it('全部答案为空时报错', () => {
    const result = normalizeContent({ ...BASE, answers: [' ', ''] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues[0]?.path).toEqual(['answers']);
  });

  it('题面为空或超长时报错', () => {
    expect(normalizeContent({ ...BASE, prompt: '  ' }).ok).toBe(false);
    expect(normalizeContent({ ...BASE, prompt: 'x'.repeat(LIMITS.promptLength + 1) }).ok).toBe(
      false,
    );
  });

  it('整理动词变形与已知变形', () => {
    const result = normalizeContent({
      ...BASE,
      verbForm: { kind: 'partizip2', base: ' einziehen ' },
      linkedForms: ['eingezogen', 'Eingezogen', ''],
    });
    expect(result.ok && result.value.verbForm).toEqual({ kind: 'partizip2', base: 'einziehen' });
    expect(result.ok && result.value.linkedForms).toEqual(['eingezogen']);
  });
});

describe('createEntry / updateEntry', () => {
  it('使用给定的 id 与时间', () => {
    const result = createEntry(BASE, { id: testId(1), now: TEST_NOW });
    expect(result.ok && result.value.id).toBe(testId(1));
    expect(result.ok && result.value.createdAt).toBe(TEST_NOW.toISOString());
    expect(result.ok && result.value.archivedAt).toBeNull();
  });

  it('未指定 id 时生成新的 UUID', () => {
    const first = createEntry(BASE);
    const second = createEntry(BASE);
    expect(first.ok && second.ok && first.value.id !== second.value.id).toBe(true);
  });

  it('无效内容不会创建词条', () => {
    expect(createEntry({ ...BASE, chapter: '' }).ok).toBe(false);
  });

  it('编辑时保留 id、创建时间与归档时间', () => {
    const archivedAt = '2025-02-01T00:00:00.000Z';
    const entry = makeEntry({ archivedAt });
    const result = updateEntry(entry, { prompt: ' 衣柜 ' });
    expect(result).toEqual({ ok: true, value: { ...entry, prompt: '衣柜' } });
  });

  it('编辑为无效内容时返回错误且不修改原词条', () => {
    const entry = makeEntry();
    expect(updateEntry(entry, { answers: [] }).ok).toBe(false);
    expect(entry.answers).toEqual(['der Schrank']);
  });
});
