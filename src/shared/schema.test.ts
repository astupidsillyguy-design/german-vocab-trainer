import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ISSUES,
  array,
  boolean,
  formatIssue,
  literal,
  map,
  nonEmptyArray,
  nullable,
  number,
  object,
  optional,
  parse,
  refine,
  string,
  variant,
  type Schema,
} from './schema';

function issuesOf<T>(schema: Schema<T>, input: unknown): string[] {
  const result = parse(schema, input);
  return result.ok ? [] : result.issues.map(formatIssue);
}

describe('基础类型', () => {
  it('string：类型、长度与格式', () => {
    const name = string({ min: 1, max: 5, pattern: /^[a-z]+$/u });
    expect(parse(name, 'abc')).toEqual({ ok: true, value: 'abc' });
    expect(issuesOf(name, 3)).toEqual(['type']);
    expect(issuesOf(name, '')).toEqual(['too_short']);
    expect(issuesOf(name, 'abcdef')).toEqual(['too_long']);
    expect(issuesOf(name, 'ABC')).toEqual(['pattern']);
  });

  it('number：拒绝 NaN 与无穷，可要求整数并限制范围', () => {
    const count = number({ min: 0, max: 10, integer: true });
    expect(parse(count, 3)).toEqual({ ok: true, value: 3 });
    expect(issuesOf(count, Number.NaN)).toEqual(['type']);
    expect(issuesOf(count, Number.POSITIVE_INFINITY)).toEqual(['type']);
    expect(issuesOf(count, 1.5)).toEqual(['type']);
    expect(issuesOf(count, 11)).toEqual(['out_of_range']);
    expect(issuesOf(count, '3')).toEqual(['type']);
  });

  it('boolean 与 literal', () => {
    expect(parse(boolean(), false)).toEqual({ ok: true, value: false });
    expect(issuesOf(boolean(), 0)).toEqual(['type']);
    const mode = literal('full', 'selective');
    expect(parse(mode, 'full')).toEqual({ ok: true, value: 'full' });
    expect(issuesOf(mode, 'other')).toEqual(['enum']);
  });
});

describe('array', () => {
  it('先检查长度，超长时不逐项校验', () => {
    const check = vi.fn(() => true);
    const list = array(refine(string({ max: 10 }), check), { max: 3 });
    expect(issuesOf(list, ['a', 'b', 'c', 'd'])).toEqual(['too_long']);
    expect(check).not.toHaveBeenCalled();
  });

  it('错误带下标路径，并收集多个错误', () => {
    const list = array(string({ min: 1, max: 10 }), { max: 10 });
    expect(issuesOf(list, ['ok', '', 'ok', 7])).toEqual(['[1]: too_short', '[3]: type']);
    expect(issuesOf(list, { length: 1 })).toEqual(['type']);
  });

  it('nonEmptyArray 要求至少一项', () => {
    const answers = nonEmptyArray(string({ max: 10 }), { max: 4 });
    expect(parse(answers, ['a', 'b'])).toEqual({ ok: true, value: ['a', 'b'] });
    expect(issuesOf(answers, [])).toEqual(['too_short']);
  });

  it('错误数量有上限', () => {
    const list = array(string({ max: 1 }), { max: 1000 });
    const result = parse(
      list,
      Array.from({ length: 100 }, () => 0),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toHaveLength(MAX_ISSUES);
  });
});

describe('object', () => {
  const person = object({
    name: string({ min: 1, max: 20 }),
    nickname: optional(string({ max: 20 })),
    note: nullable(string({ max: 20 })),
  });

  it('只保留声明过的键，可选键缺省时不出现在结果中', () => {
    const result = parse(person, { name: 'Anna', note: null, extra: 'dropped' });
    expect(result).toEqual({ ok: true, value: { name: 'Anna', note: null } });
    if (result.ok) expect(Object.keys(result.value)).toEqual(['name', 'note']);
  });

  it('不读取原型链上的属性', () => {
    const input: unknown = Object.create({ name: 'inherited', note: null });
    expect(issuesOf(person, input)).toEqual(['name: type', 'note: type']);
  });

  it('__proto__ 键不会污染原型', () => {
    const input: unknown = JSON.parse('{"__proto__":{"polluted":true},"name":"Ben","note":null}');
    const result = parse(person, input);
    expect(result.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (result.ok) expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
  });

  it('嵌套路径', () => {
    const entries = array(object({ answers: array(string({ min: 1, max: 5 }), { max: 3 }) }), {
      max: 5,
    });
    expect(issuesOf(entries, [{ answers: ['a'] }, { answers: ['b', ''] }])).toEqual([
      '[1].answers[1]: too_short',
    ]);
    expect(issuesOf(person, null)).toEqual(['type']);
    expect(issuesOf(person, ['Anna'])).toEqual(['type']);
  });
});

describe('refine 与 map', () => {
  it('refine 追加规则，map 转换结果', () => {
    const even = refine(number({ min: 0, max: 100 }), (value) => value % 2 === 0);
    expect(parse(even, 4)).toEqual({ ok: true, value: 4 });
    expect(issuesOf(even, 3)).toEqual(['invalid']);
    const upper = map(string({ max: 5 }), (value) => value.toUpperCase());
    expect(parse(upper, 'de')).toEqual({ ok: true, value: 'DE' });
    expect(issuesOf(upper, 1)).toEqual(['type']);
  });
});

describe('variant', () => {
  const shape = variant('kind', {
    circle: object({ kind: literal('circle'), radius: number({ min: 0, max: 10 }) }),
    square: object({ kind: literal('square'), side: number({ min: 0, max: 10 }) }),
  });

  it('按判别字段选择分支，并只保留该分支声明的键', () => {
    expect(parse(shape, { kind: 'circle', radius: 2, side: 3 })).toEqual({
      ok: true,
      value: { kind: 'circle', radius: 2 },
    });
    expect(parse(shape, { kind: 'square', side: 4 })).toEqual({
      ok: true,
      value: { kind: 'square', side: 4 },
    });
  });

  it('判别值缺失、未知或来自原型链时报 enum', () => {
    expect(issuesOf(shape, { radius: 2 })).toEqual(['kind: enum']);
    expect(issuesOf(shape, { kind: 'triangle' })).toEqual(['kind: enum']);
    expect(issuesOf(shape, { kind: 'toString' })).toEqual(['kind: enum']);
    expect(issuesOf(shape, Object.create({ kind: 'circle', radius: 1 }))).toEqual(['kind: enum']);
    expect(issuesOf(shape, 'circle')).toEqual(['type']);
  });

  it('分支内的错误带完整路径', () => {
    expect(issuesOf(shape, { kind: 'circle', radius: 20 })).toEqual(['radius: out_of_range']);
  });
});
