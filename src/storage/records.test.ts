import { describe, expect, it } from 'vitest';
import { LIMITS } from '../domain';
import { makeEntry } from '../test/entries';
import { rawLibraryOf, readCollection, readLibrary, readOrder } from './records';

describe('readCollection', () => {
  it('缺失的集合视为空', () => {
    expect(readCollection(undefined, 'pool')).toEqual({ entries: [], rejected: [] });
  });

  it('合法词条全部保留，顺序不变', () => {
    const entries = [makeEntry(), makeEntry()];
    expect(readCollection(entries, 'pool')).toEqual({ entries, rejected: [] });
  });

  it('只隔离坏掉的那一条，并原样保留原始数据', () => {
    const good = makeEntry();
    const bad = { ...makeEntry(), answers: [] };
    const result = readCollection([bad, good, 'garbage'], 'archive');
    expect(result.entries).toEqual([good]);
    expect(result.rejected).toEqual([
      { source: 'archive', issues: ['answers: too_short'], raw: bad },
      { source: 'archive', issues: ['type'], raw: 'garbage' },
    ]);
    expect(result.rejected[0]?.raw).toBe(bad);
  });

  it('重复 id 的后一条被隔离', () => {
    const entry = makeEntry();
    const copy = { ...entry, prompt: '另一个' };
    const result = readCollection([entry, copy], 'pool');
    expect(result.entries).toEqual([entry]);
    expect(result.rejected).toEqual([{ source: 'pool', issues: ['id: duplicate'], raw: copy }]);
  });

  it('不是数组或超出数量上限时整体隔离', () => {
    const notList = { length: 1 };
    expect(readCollection(notList, 'pool')).toEqual({
      entries: [],
      rejected: [{ source: 'pool', issues: ['type'], raw: notList }],
    });
    const tooMany = { length: LIMITS.entriesPerCollection + 1 };
    const huge: unknown = Array.from(tooMany, () => null);
    expect(readCollection(huge, 'pool').rejected).toHaveLength(1);
  });
});

describe('readOrder', () => {
  it('缺失时为空排序表，损坏时整体隔离', () => {
    expect(readOrder(undefined, 'order')).toEqual({ order: [], rejected: [] });
    const order = [{ chapter: 'A1', lessons: ['L1'] }];
    expect(readOrder(order, 'order')).toEqual({ order, rejected: [] });
    const broken = [{ chapter: 'A1' }];
    expect(readOrder(broken, 'order').rejected).toEqual([
      { source: 'order', issues: ['[0].lessons: type'], raw: broken },
    ]);
  });
});

describe('readLibrary', () => {
  it('标记含有坏数据的部分，并补齐排序表', () => {
    const archived = makeEntry({ chapter: 'B1', archivedAt: '2025-02-01T00:00:00.000Z' });
    const read = readLibrary({ pool: [null], archive: [archived], order: undefined });
    expect(read.library.pool).toEqual([]);
    expect(read.library.order).toEqual([{ chapter: 'B1', lessons: ['第30讲'] }]);
    expect(read.dirty).toEqual({ pool: true, archive: false, order: false });
    expect(read.rejected).toHaveLength(1);
  });

  it('读取快照时所有问题都记为来自快照', () => {
    const read = readLibrary({ pool: [null], archive: 1, order: 'x' }, 'snapshot');
    expect(read.rejected.map(({ source }) => source)).toEqual(['snapshot', 'snapshot', 'snapshot']);
  });
});

describe('rawLibraryOf', () => {
  it('只接受 { library: { … } } 结构', () => {
    expect(rawLibraryOf({ id: 'x', library: { pool: [], archive: [], order: [] } })).toEqual({
      pool: [],
      archive: [],
      order: [],
    });
    expect(rawLibraryOf(null)).toBeNull();
    expect(rawLibraryOf({ library: [] })).toBeNull();
    expect(rawLibraryOf([])).toBeNull();
  });
});
