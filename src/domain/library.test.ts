import { describe, expect, it } from 'vitest';
import { parse } from '../shared/schema';
import { makeEntry, TEST_NOW, testId } from '../test/entries';
import {
  changesBetween,
  countLibrary,
  EMPTY_LIBRARY,
  hasChanges,
  normalizeLibrary,
  type Library,
} from './library';
import { LIMITS } from './limits';
import { archiveOrderSchema, entrySchema, parseSnapshotSummary, timestampSchema } from './schemas';
import {
  createSnapshot,
  sortSnapshots,
  snapshotsToPrune,
  summarizeSnapshot,
  SNAPSHOT_LIMIT,
  type SnapshotSummary,
} from './snapshot';

const SNAPSHOT_ID = '11111111-1111-4111-8111-111111111111';

describe('Library', () => {
  it('normalizeLibrary 按归档数据补齐排序表；已一致时返回原对象', () => {
    const library: Library = { ...EMPTY_LIBRARY, archive: [makeEntry({ chapter: 'B1' })] };
    const normalized = normalizeLibrary(library);
    expect(normalized.order).toEqual([{ chapter: 'B1', lessons: ['第30讲'] }]);
    expect(normalizeLibrary(normalized)).toBe(normalized);
    expect(normalizeLibrary(EMPTY_LIBRARY)).toBe(EMPTY_LIBRARY);
  });

  it('countLibrary', () => {
    expect(countLibrary({ ...EMPTY_LIBRARY, pool: [makeEntry(), makeEntry()] })).toEqual({
      pool: 2,
      archive: 0,
    });
  });

  it('changesBetween 按引用判断哪一部分变化', () => {
    const next: Library = { ...EMPTY_LIBRARY, pool: [makeEntry()] };
    const changes = changesBetween(EMPTY_LIBRARY, next);
    expect(changes).toEqual({ pool: true, archive: false, order: false });
    expect(hasChanges(changes)).toBe(true);
    expect(hasChanges(changesBetween(next, next))).toBe(false);
  });
});

describe('快照', () => {
  it('createSnapshot 记录原因、时间与计数', () => {
    const library: Library = { ...EMPTY_LIBRARY, pool: [makeEntry()] };
    const snapshot = createSnapshot(library, 'replace-pool', { id: SNAPSHOT_ID, now: TEST_NOW });
    expect(summarizeSnapshot(snapshot)).toEqual({
      id: SNAPSHOT_ID,
      createdAt: TEST_NOW.toISOString(),
      reason: 'replace-pool',
      counts: { pool: 1, archive: 0 },
    });
    expect(snapshot.library).toBe(library);
  });

  const summary = (id: string, createdAt: string): SnapshotSummary => ({
    id,
    createdAt,
    reason: 'sync',
    counts: { pool: 0, archive: 0 },
  });

  it('sortSnapshots 从新到旧，同一时间按 id 排序', () => {
    const sorted = sortSnapshots([
      summary('b', '2025-01-01T00:00:00.000Z'),
      summary('c', '2025-01-02T00:00:00.000Z'),
      summary('a', '2025-01-01T00:00:00.000Z'),
    ]);
    expect(sorted.map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  });

  it(`snapshotsToPrune 只保留最新的 ${String(SNAPSHOT_LIMIT)} 份`, () => {
    const extra = 3;
    const all = Array.from({ length: SNAPSHOT_LIMIT + extra }, (_, index) =>
      summary(
        `s${String(index).padStart(2, '0')}`,
        new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
      ),
    );
    expect(snapshotsToPrune(all)).toEqual(['s02', 's01', 's00']);
    expect(snapshotsToPrune(all.slice(0, SNAPSHOT_LIMIT))).toEqual([]);
    expect(snapshotsToPrune(all, 1)).toHaveLength(SNAPSHOT_LIMIT + extra - 1);
  });
});

describe('持久化结构校验', () => {
  it('合法词条通过校验', () => {
    const entry = makeEntry();
    expect(parse(entrySchema, entry)).toEqual({ ok: true, value: entry });
  });

  it('拒绝错误的 id 与超长内容，丢弃多余字段', () => {
    const entry = makeEntry();
    expect(parse(entrySchema, { ...entry, id: 'not-a-uuid' }).ok).toBe(false);
    expect(parse(entrySchema, { ...entry, extra: 1 })).toEqual({ ok: true, value: entry });
    expect(parse(entrySchema, { ...entry, answers: [] }).ok).toBe(false);
    expect(
      parse(entrySchema, {
        ...entry,
        answers: Array.from(
          { length: LIMITS.answersPerEntry + 1 },
          (_, index) => `a${String(index)}`,
        ),
      }).ok,
    ).toBe(false);
    expect(parse(entrySchema, { ...entry, verbForm: { kind: 'futur', base: 'gehen' } }).ok).toBe(
      false,
    );
  });

  it('时间戳必须是 ISO 8601 且可解析', () => {
    expect(parse(timestampSchema, '2025-01-15T08:30:00.000Z').ok).toBe(true);
    expect(parse(timestampSchema, '2025-01-15T08:30:00+08:00').ok).toBe(true);
    expect(parse(timestampSchema, '2025-13-45T99:99:99Z').ok).toBe(false);
    expect(parse(timestampSchema, '15.01.2025').ok).toBe(false);
  });

  it('排序表结构', () => {
    expect(parse(archiveOrderSchema, [{ chapter: 'A1', lessons: ['L1'] }]).ok).toBe(true);
    expect(parse(archiveOrderSchema, [{ chapter: '', lessons: [] }]).ok).toBe(false);
    expect(parse(archiveOrderSchema, { chapter: 'A1' }).ok).toBe(false);
  });

  it('parseSnapshotSummary', () => {
    const valid = {
      id: SNAPSHOT_ID,
      createdAt: TEST_NOW.toISOString(),
      reason: 'import',
      counts: { pool: 1, archive: 2 },
    };
    expect(parseSnapshotSummary(valid)).toEqual(valid);
    expect(parseSnapshotSummary({ ...valid, reason: 'other' })).toBeNull();
    expect(parseSnapshotSummary({ ...valid, counts: { pool: -1, archive: 0 } })).toBeNull();
    expect(parseSnapshotSummary(null)).toBeNull();
  });

  it('testId 生成合法的词条 id', () => {
    expect(parse(entrySchema, makeEntry({ id: testId(LIMITS.chapters) })).ok).toBe(true);
  });
});
