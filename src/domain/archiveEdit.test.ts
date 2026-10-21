import { describe, expect, it } from 'vitest';
import { makeEntry, TEST_NOW, testId } from '../test/entries';
import {
  editArchiveEntry,
  removeFromArchive,
  renameArchiveGroup,
  restoreEntry,
  restoreRemoval,
  revertRename,
} from './archiveEdit';
import { normalizeLibrary, type Library } from './library';
import { LIMITS } from './limits';
import type { Entry } from './model';

const ARCHIVED = TEST_NOW.toISOString();

function archived(index: number, chapter: string, lesson: string, prompt: string): Entry {
  return makeEntry({
    id: testId(index),
    chapter,
    lesson,
    prompt,
    answers: [`Wort${String(index)}`],
    archivedAt: ARCHIVED,
  });
}

const A1_L1 = archived(1, 'A1', 'L1', '一');
const A1_L1B = archived(2, 'A1', 'L1', '二');
const A1_L2 = archived(3, 'A1', 'L2', '三');
const A2_M1 = archived(4, 'A2', 'M1', '四');
const POOL_A1 = makeEntry({ id: testId(10), chapter: 'A1', lesson: 'L3', prompt: '待测' });
const POOL_L1 = makeEntry({ id: testId(11), chapter: 'A1', lesson: 'L1', prompt: '待测二' });

function library(): Library {
  return normalizeLibrary({
    pool: [POOL_A1, POOL_L1],
    archive: [A1_L1, A1_L1B, A1_L2, A2_M1],
    order: [
      { chapter: 'A2', lessons: ['M1'] },
      { chapter: 'A1', lessons: ['L2', 'L1'] },
    ],
  });
}

const ids = (entries: readonly Entry[]) => entries.map((entry) => entry.id);

describe('removeFromArchive / restoreRemoval（F-054）', () => {
  it('删除一个词，撤销后回到原位置', () => {
    const before = library();
    const { library: after, removal } = removeFromArchive(before, { kind: 'entry', id: A1_L1B.id });
    expect(ids(after.archive)).toEqual([A1_L1.id, A1_L2.id, A2_M1.id]);
    expect(after.pool).toBe(before.pool);
    expect(normalizeLibrary(restoreRemoval(normalizeLibrary(after), removal))).toEqual(before);
  });

  it('删除整个章节，撤销后章节与课时回到排序表中的原位置', () => {
    const before = library();
    const { library: after, removal } = removeFromArchive(before, {
      kind: 'chapter',
      chapter: 'A1',
    });
    const normalized = normalizeLibrary(after);
    expect(ids(normalized.archive)).toEqual([A2_M1.id]);
    expect(normalized.order).toEqual([{ chapter: 'A2', lessons: ['M1'] }]);
    // 待测库中的同名章节不受影响
    expect(normalized.pool).toBe(before.pool);
    expect(normalizeLibrary(restoreRemoval(normalized, removal))).toEqual(before);
  });

  it('删除一个课时只删该课时', () => {
    const { library: after, removal } = removeFromArchive(library(), {
      kind: 'lesson',
      chapter: 'A1',
      lesson: 'L1',
    });
    expect(ids(after.archive)).toEqual([A1_L2.id, A2_M1.id]);
    expect(removal.removed.map(({ index }) => index)).toEqual([0, 1]);
  });

  it('连续删除后先撤销第一次，不影响第二次删除', () => {
    const before = library();
    const first = removeFromArchive(before, { kind: 'entry', id: A1_L1.id });
    const second = removeFromArchive(normalizeLibrary(first.library), {
      kind: 'entry',
      id: A2_M1.id,
    });
    const undone = normalizeLibrary(
      restoreRemoval(normalizeLibrary(second.library), first.removal),
    );
    expect(ids(undone.archive)).toEqual([A1_L1.id, A1_L1B.id, A1_L2.id]);
  });

  it('没有匹配的词时返回原对象；重复撤销不会重复添加', () => {
    const before = library();
    expect(removeFromArchive(before, { kind: 'chapter', chapter: 'C1' }).library).toBe(before);
    const { library: after, removal } = removeFromArchive(before, { kind: 'entry', id: A1_L1.id });
    const restored = restoreRemoval(after, removal);
    expect(restoreRemoval(restored, removal)).toBe(restored);
  });
});

describe('editArchiveEntry / restoreEntry（F-051）', () => {
  const HELFEN = makeEntry({
    id: testId(20),
    chapter: 'A1',
    lesson: 'L1',
    prompt: '帮助',
    answers: ['jm. bei etw.(D.) helfen', 'jm. bei etw. helfen'],
    archivedAt: ARCHIVED,
  });
  const withHelfen = (): Library => ({ ...library(), archive: [...library().archive, HELFEN] });

  it('修改标准答案与释义，保留其他可接受答案、id、创建与归档时间', () => {
    const result = editArchiveEntry(withHelfen(), HELFEN.id, {
      answer: ' jm.  bei etw.(D.) helfen ',
      alternatives: ['jm. bei etw. helfen'],
      prompt: '在……方面帮助某人',
    });
    if (!result.ok) throw new Error(result.error);
    const edited = result.library.archive.at(-1);
    expect(edited).toEqual({
      ...HELFEN,
      prompt: '在……方面帮助某人',
      answers: ['jm. bei etw.(D.) helfen', 'jm. bei etw. helfen'],
    });
    expect(result.previous).toBe(HELFEN);
    expect(restoreEntry(result.library, HELFEN).archive.at(-1)).toBe(HELFEN);
  });

  it('答案按判分规则去重；内容没有变化时返回原对象', () => {
    const base = withHelfen();
    const result = editArchiveEntry(base, HELFEN.id, {
      answer: 'jm. bei etw.(D.) helfen',
      alternatives: ['jm. bei etw. helfen', 'JM BEI ETW HELFEN', ''],
      prompt: '帮助',
    });
    expect(result).toEqual({ ok: true, library: base, previous: null });
  });

  it('校验：答案、释义不能为空，答案数量有上限，词条必须存在', () => {
    const base = withHelfen();
    const edit = { answer: 'helfen', alternatives: [], prompt: '帮助' };
    expect(editArchiveEntry(base, HELFEN.id, { ...edit, answer: ' ' })).toEqual({
      ok: false,
      error: 'answerRequired',
    });
    expect(editArchiveEntry(base, HELFEN.id, { ...edit, prompt: '' })).toEqual({
      ok: false,
      error: 'promptRequired',
    });
    const many = Array.from({ length: LIMITS.answersPerEntry }, (_, index) => `w${String(index)}`);
    expect(editArchiveEntry(base, HELFEN.id, { ...edit, alternatives: many })).toEqual({
      ok: false,
      error: 'tooManyAnswers',
    });
    expect(
      editArchiveEntry(base, HELFEN.id, { ...edit, prompt: 'x'.repeat(LIMITS.promptLength + 1) }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(editArchiveEntry(base, testId(99), edit)).toEqual({ ok: false, error: 'missing' });
  });

  it('撤销时词条已被删除则不做任何事', () => {
    const base = library();
    const { library: after } = removeFromArchive(base, { kind: 'entry', id: A1_L1.id });
    expect(restoreEntry(after, A1_L1)).toBe(after);
  });
});

describe('renameArchiveGroup / revertRename（F-052、F-053）', () => {
  it('章节改名：归档库与待测库中的同名章节一起改，排序位置不变；撤销后完全还原', () => {
    const before = library();
    const result = renameArchiveGroup(before, { kind: 'chapter', chapter: 'A1' }, '  Band 1 ');
    if (!result.ok) throw new Error(result.error);
    const after = normalizeLibrary(result.library);
    expect(after.archive.filter((entry) => entry.chapter === 'Band 1')).toHaveLength(3);
    expect(after.pool.map((entry) => entry.chapter)).toEqual(['Band 1', 'Band 1']);
    expect(after.order).toEqual([
      { chapter: 'A2', lessons: ['M1'] },
      { chapter: 'Band 1', lessons: ['L2', 'L1'] },
    ]);
    if (result.rename === null) throw new Error('应当改名');
    expect(normalizeLibrary(revertRename(after, result.rename))).toEqual(before);
  });

  it('课时改名：只改该章节中的这个课时（含待测库）；撤销后还原', () => {
    const before = library();
    const result = renameArchiveGroup(
      before,
      { kind: 'lesson', chapter: 'A1', lesson: 'L1' },
      'Lektion 1',
    );
    if (!result.ok || result.rename === null) throw new Error('应当改名');
    const after = normalizeLibrary(result.library);
    expect(after.archive.map((entry) => entry.lesson)).toEqual([
      'Lektion 1',
      'Lektion 1',
      'L2',
      'M1',
    ]);
    expect(after.pool.map((entry) => entry.lesson)).toEqual(['L3', 'Lektion 1']);
    expect(after.order[1]).toEqual({ chapter: 'A1', lessons: ['L2', 'Lektion 1'] });
    expect(result.rename.ids).toEqual([A1_L1.id, A1_L1B.id, POOL_L1.id]);
    expect(normalizeLibrary(revertRename(after, result.rename))).toEqual(before);
  });

  it('校验：名称不能为空、不能过长、不能与归档库中已有的组重名；同名时不做修改', () => {
    const base = library();
    const chapter = { kind: 'chapter', chapter: 'A1' } as const;
    expect(renameArchiveGroup(base, chapter, ' ')).toEqual({ ok: false, error: 'nameRequired' });
    expect(renameArchiveGroup(base, chapter, 'x'.repeat(LIMITS.groupNameLength + 1))).toEqual({
      ok: false,
      error: 'nameTooLong',
    });
    expect(renameArchiveGroup(base, chapter, 'A2')).toEqual({ ok: false, error: 'nameTaken' });
    expect(renameArchiveGroup(base, { kind: 'lesson', chapter: 'A1', lesson: 'L1' }, 'L2')).toEqual(
      { ok: false, error: 'nameTaken' },
    );
    // 待测库中已有的课时名不算重名
    expect(renameArchiveGroup(base, { kind: 'lesson', chapter: 'A1', lesson: 'L1' }, 'L3').ok).toBe(
      true,
    );
    expect(renameArchiveGroup(base, chapter, ' A1 ')).toEqual({
      ok: true,
      library: base,
      rename: null,
    });
    expect(renameArchiveGroup(base, { kind: 'chapter', chapter: 'C1' }, 'C2')).toEqual({
      ok: true,
      library: base,
      rename: null,
    });
  });

  it('撤销只改回当时改名、且名称未再变化的词条', () => {
    const result = renameArchiveGroup(library(), { kind: 'chapter', chapter: 'A1' }, 'B');
    if (!result.ok || result.rename === null) throw new Error('应当改名');
    const again = renameArchiveGroup(
      normalizeLibrary(result.library),
      { kind: 'lesson', chapter: 'B', lesson: 'L2' },
      'L9',
    );
    if (!again.ok) throw new Error(again.error);
    const moved = {
      ...again.library,
      archive: again.library.archive.map((entry) =>
        entry.id === A1_L2.id ? { ...entry, chapter: 'C' } : entry,
      ),
    };
    const reverted = normalizeLibrary(revertRename(normalizeLibrary(moved), result.rename));
    expect(reverted.archive.find((entry) => entry.id === A1_L2.id)?.chapter).toBe('C');
    expect(reverted.archive.find((entry) => entry.id === A1_L1.id)?.chapter).toBe('A1');
    expect(revertRename(reverted, result.rename)).toBe(reverted);
  });
});
