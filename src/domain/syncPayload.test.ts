import { describe, expect, it } from 'vitest';
import { makeEntry, makeLesson, testId } from '../test/entries';
import { normalizeLibrary, type Library } from './library';
import type { Entry } from './model';
import { groupEntries } from './order';
import {
  applySyncPayload,
  buildSyncPayload,
  parseSyncPayload,
  previewSyncPayload,
  type SyncPayload,
} from './syncPayload';

const ARCHIVED_AT = '2025-02-01T09:00:00.000Z';

function archived(entries: readonly Entry[]): Entry[] {
  return entries.map((entry) => ({ ...entry, archivedAt: ARCHIVED_AT }));
}

function library(archive: readonly Entry[], pool: readonly Entry[] = []): Library {
  return normalizeLibrary({ pool, archive, order: [] });
}

function lessonsOf(value: Library): string[] {
  return groupEntries(value.archive, value.order).flatMap((group) =>
    group.lessons.map(({ chapter, lesson }) => `${chapter}/${lesson}`),
  );
}

const SENDER = normalizeLibrary({
  pool: [makeEntry({ prompt: '待测' })],
  archive: archived([
    ...makeLesson('A1', '第2讲', ['猫']),
    ...makeLesson('A1', '第1讲', ['柜子', '桌子']),
    ...makeLesson('A2', '第5讲', ['工作']),
  ]),
  // 显示顺序与数据中的先后不同：第1讲在前
  order: [{ chapter: 'A1', lessons: ['第1讲', '第2讲'] }],
});

describe('发送端载荷（F-076）', () => {
  it('整库：按显示顺序列出全部归档词条与排序，不含待测库', () => {
    const payload = buildSyncPayload(SENDER, { mode: 'full' });
    expect(payload.mode).toBe('full');
    expect(payload.lessons).toEqual([]);
    expect(payload.entries.map(({ prompt }) => prompt)).toEqual(['柜子', '桌子', '猫', '工作']);
    expect(payload.order).toEqual([
      { chapter: 'A1', lessons: ['第1讲', '第2讲'] },
      { chapter: 'A2', lessons: ['第5讲'] },
    ]);
  });

  it('按课时：只含选中且存在的课时，按显示顺序排列', () => {
    const payload = buildSyncPayload(SENDER, {
      mode: 'lessons',
      lessons: [
        { chapter: 'A2', lesson: '第5讲' },
        { chapter: 'A1', lesson: '第1讲' },
        { chapter: 'A9', lesson: '不存在' },
      ],
    });
    expect(payload.lessons).toEqual([
      { chapter: 'A1', lesson: '第1讲' },
      { chapter: 'A2', lesson: '第5讲' },
    ]);
    expect(payload.entries.map(({ prompt }) => prompt)).toEqual(['柜子', '桌子', '工作']);
    expect(payload.order).toEqual([
      { chapter: 'A1', lessons: ['第1讲'] },
      { chapter: 'A2', lessons: ['第5讲'] },
    ]);
  });
});

describe('载荷校验（F-077）', () => {
  const valid = buildSyncPayload(SENDER, { mode: 'full' });

  it('合法载荷经 JSON 往返后仍然合法，未知字段被丢弃', () => {
    const roundTrip: unknown = JSON.parse(JSON.stringify({ ...valid, extra: '<script>' }));
    expect(parseSyncPayload(roundTrip)).toEqual(valid);
  });

  it('拒绝结构错误、模式与内容不一致的数据', () => {
    expect(parseSyncPayload(null)).toBeNull();
    expect(parseSyncPayload({ ...valid, mode: 'merge' })).toBeNull();
    expect(
      parseSyncPayload({ ...valid, lessons: [{ chapter: 'A1', lesson: '第1讲' }] }),
    ).toBeNull();
    expect(parseSyncPayload({ ...valid, mode: 'lessons' })).toBeNull();
    expect(
      parseSyncPayload({
        ...valid,
        mode: 'lessons',
        lessons: [{ chapter: 'A1', lesson: '第1讲' }],
      }),
    ).toBeNull();
    expect(parseSyncPayload({ ...valid, entries: [{ id: 'x' }] })).toBeNull();
  });
});

describe('接收端写入（F-079）', () => {
  const receiverPool = [makeEntry({ prompt: '本机待测' })];
  const RECEIVER = normalizeLibrary({
    pool: receiverPool,
    archive: archived([
      ...makeLesson('B1', '第9讲', ['旧词']),
      ...makeLesson('A1', '第1讲', ['旧柜子']),
      ...makeLesson('A1', '第3讲', ['本机独有']),
    ]),
    order: [],
  });

  it('整库覆盖：归档与排序整体替换，待测库不变', () => {
    const next = applySyncPayload(RECEIVER, buildSyncPayload(SENDER, { mode: 'full' }));
    expect(next.pool).toBe(RECEIVER.pool);
    expect(next.archive.map(({ prompt }) => prompt)).toEqual(['柜子', '桌子', '猫', '工作']);
    expect(lessonsOf(next)).toEqual(['A1/第1讲', 'A1/第2讲', 'A2/第5讲']);
  });

  it('按课时覆盖：只替换所列课时；新课时排在章节末尾，新章节排在最后', () => {
    const payload = buildSyncPayload(SENDER, {
      mode: 'lessons',
      lessons: [
        { chapter: 'A1', lesson: '第1讲' },
        { chapter: 'A1', lesson: '第2讲' },
        { chapter: 'A2', lesson: '第5讲' },
      ],
    });
    const next = applySyncPayload(RECEIVER, payload);
    expect(next.pool).toBe(RECEIVER.pool);
    expect(lessonsOf(next)).toEqual(['B1/第9讲', 'A1/第1讲', 'A1/第3讲', 'A1/第2讲', 'A2/第5讲']);
    const prompts = next.archive.map(({ prompt }) => prompt);
    expect(prompts).toContain('本机独有');
    expect(prompts).toContain('旧词');
    expect(prompts).not.toContain('旧柜子');
  });

  it('对方词条的 id 与本机保留的词条或彼此重复时换成新 id', () => {
    const clash = archived([makeEntry({ id: receiverPool[0]?.id ?? testId(1), chapter: 'C1' })]);
    const payload: SyncPayload = {
      mode: 'full',
      lessons: [],
      entries: [...clash, { ...clash[0], id: clash[0]?.id ?? testId(1) } as Entry],
      order: [],
    };
    let next = 0;
    const result = applySyncPayload(RECEIVER, payload, () => testId(900 + (next += 1)));
    const ids = [...result.pool, ...result.archive].map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.archive.map(({ id }) => id)).toEqual([testId(901), testId(902)]);
  });
});

describe('接收预览（F-078）', () => {
  it('按内容比较新增、删除与不变的词，列出涉及的课时', () => {
    const shared = archived(makeLesson('A1', '第1讲', ['柜子']));
    const receiver = library([...shared, ...archived(makeLesson('A1', '第3讲', ['独有']))]);
    const sender = library([
      ...shared.map((entry) => ({ ...entry, id: testId(500) })),
      ...archived(makeLesson('A2', '第5讲', ['工作', '学习'])),
    ]);
    const preview = previewSyncPayload(receiver, buildSyncPayload(sender, { mode: 'full' }));
    expect(preview).toMatchObject({
      mode: 'full',
      incoming: { entries: 3, lessons: 2, chapters: 2 },
      replaced: 2,
      added: 2,
      removed: 1,
      unchanged: 1,
    });
    expect(preview.lessons).toEqual([
      { chapter: 'A1', lesson: '第1讲', incoming: 1, current: 1 },
      { chapter: 'A1', lesson: '第3讲', incoming: 0, current: 1 },
      { chapter: 'A2', lesson: '第5讲', incoming: 2, current: 0 },
    ]);
  });

  it('按课时覆盖只统计所列课时', () => {
    const receiver = library(archived(makeLesson('A1', '第3讲', ['独有'])));
    const payload = buildSyncPayload(SENDER, {
      mode: 'lessons',
      lessons: [{ chapter: 'A2', lesson: '第5讲' }],
    });
    expect(previewSyncPayload(receiver, payload)).toMatchObject({
      replaced: 0,
      added: 1,
      removed: 0,
      unchanged: 0,
      lessons: [{ chapter: 'A2', lesson: '第5讲', incoming: 1, current: 0 }],
    });
  });
});
