import { describe, expect, it } from 'vitest';
import { createQuizSession, phaseOf, type Library, type QuizSession } from '../../domain';
import { makeEntry, TEST_NOW, testId } from '../../test/entries';
import { StorageError } from '../../storage';
import { createTestStore } from '../../test/library';
import { ControlledRepository } from '../../test/repositories';
import { POOL_SCOPE, QUIZ_STATE_KEY, QuizStore } from './QuizStore';

/** 不打乱：洗牌时 j 总等于 i */
const KEEP_ORDER = (): number => 1 - Number.EPSILON;

const POOL = [
  makeEntry({ id: testId(1), prompt: '柜子', answers: ['der Schrank'] }),
  makeEntry({ id: testId(2), prompt: '门', answers: ['die Tür'] }),
];
const LIBRARY: Library = { pool: POOL, archive: [], order: [] };

const SAVED_ID = '11111111-1111-4111-8111-111111111111';
let serial = 0;
/** 会话 id 必须是 UUID（与持久化校验一致） */
const nextSessionId = (): string => {
  serial += 1;
  return `22222222-2222-4222-8222-${String(serial).padStart(12, '0')}`;
};

async function setup(saved?: unknown) {
  const repository = new ControlledRepository({ initial: LIBRARY });
  if (saved !== undefined) await repository.writeState(QUIZ_STATE_KEY, saved);
  repository.stateWrites.length = 0;
  const library = createTestStore(repository);
  await library.load();
  const quiz = new QuizStore({
    library,
    random: KEEP_ORDER,
    clock: () => TEST_NOW,
    newId: nextSessionId,
  });
  return { repository, library, quiz };
}

function savedSession(): QuizSession {
  const session = createQuizSession(POOL, POOL_SCOPE, {
    id: SAVED_ID,
    now: TEST_NOW,
    random: KEEP_ORDER,
  });
  if (session === null) throw new Error('应当创建会话');
  return session;
}

/** 等待后台写入完成 */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('QuizStore', () => {
  it('读取保存的进度（刷新后从当前题继续）；无法识别的进度被丢弃', async () => {
    const { quiz } = await setup(savedSession());
    expect(quiz.getState().status).toBe('loading');
    await quiz.load();
    expect(quiz.getState()).toEqual({ status: 'ready', session: savedSession() });

    const broken = await setup({ version: 1, garbage: true });
    await broken.quiz.load();
    expect(broken.quiz.getState()).toEqual({ status: 'ready', session: null });
  });

  it('变化都会保存；作答、下一题按会话规则推进', async () => {
    const { quiz, repository } = await setup();
    await quiz.load();
    const session = quiz.start(POOL, POOL_SCOPE);
    expect(session?.order).toEqual([testId(1), testId(2)]);
    quiz.submit('der Schrank');
    quiz.next();
    const current = quiz.getState().session;
    expect(current?.index).toBe(1);
    expect(current?.responses).toEqual([{ input: 'der Schrank', correct: true }]);
    await settle();
    // 写入中途的变化合并为一次：只保证最后保存的是最新进度
    expect(repository.stateWrites.length).toBeGreaterThan(0);
    expect(repository.stateWrites.every(([key]) => key === QUIZ_STATE_KEY)).toBe(true);
    expect(await repository.readState(QUIZ_STATE_KEY)).toEqual(current);
  });

  it('加载期间已经开始了新的测验：以新的为准，不被旧进度覆盖', async () => {
    const { quiz } = await setup(savedSession());
    const loading = quiz.load();
    const started = quiz.start(POOL, POOL_SCOPE);
    await loading;
    expect(quiz.getState().session).toEqual(started);
    expect(started?.id).not.toBe(SAVED_ID);
  });

  it('没有题目时清空当前测验', async () => {
    const { quiz, repository } = await setup(savedSession());
    await quiz.load();
    expect(quiz.start([], POOL_SCOPE)).toBeNull();
    expect(quiz.getState().session).toBeNull();
    await settle();
    expect(await repository.readState(QUIZ_STATE_KEY)).toBeUndefined();
  });

  it('词表没有变化时继续进行中的测验；已结束或题目不同则重新开始', async () => {
    const { quiz } = await setup();
    await quiz.load();
    const first = quiz.start(POOL, POOL_SCOPE);
    quiz.submit('falsch');
    const answered = quiz.getState().session;
    expect(quiz.resumeOrStart([...POOL].reverse(), POOL_SCOPE)).toBe(answered);
    expect(quiz.resumeOrStart(POOL.slice(0, 1), POOL_SCOPE)?.id).not.toBe(first?.id);

    const single = quiz.getState().session;
    quiz.submit('der Schrank');
    quiz.next();
    const finished = quiz.getState().session;
    expect(finished === null ? null : phaseOf(finished)).toBe('finished');
    expect(quiz.resumeOrStart(POOL.slice(0, 1), POOL_SCOPE)?.id).not.toBe(single?.id);
  });

  it('重开返回之前的测验，用它可以撤销', async () => {
    const { quiz } = await setup();
    await quiz.load();
    quiz.start(POOL, POOL_SCOPE);
    quiz.submit('der Schrank');
    const before = quiz.getState().session;
    const previous = quiz.restart();
    expect(previous).toBe(before);
    expect(quiz.getState().session?.responses).toEqual([]);
    quiz.replace(previous);
    expect(quiz.getState().session).toBe(before);
  });

  it('重测固定错词集与重新完整测试', async () => {
    const { quiz } = await setup();
    await quiz.load();
    quiz.start(POOL, POOL_SCOPE);
    quiz.submit('der Tisch');
    quiz.next();
    quiz.submit('die Tür');
    quiz.next();
    quiz.retest();
    expect(quiz.getState().session).toMatchObject({ round: 2, order: [testId(1)] });
    quiz.restartFull();
    expect(quiz.getState().session).toMatchObject({ round: 1, lockedIds: [] });
  });

  it('一键归档：通关后把题目移到归档库，保存快照，可以撤销（F-036）', async () => {
    const { quiz, library } = await setup();
    await quiz.load();
    quiz.start(POOL, POOL_SCOPE);
    expect(quiz.archiveUnit()).toBeNull();
    quiz.submit('der Schrank');
    quiz.next();
    quiz.submit('die Tür');
    quiz.next();

    const result = quiz.archiveUnit();
    expect(result?.archived).toBe(2);
    // 内存中立即生效
    expect(library.getState().library.pool).toEqual([]);
    expect(library.getState().library.archive).toEqual(
      POOL.map((entry) => ({ ...entry, archivedAt: TEST_NOW.toISOString() })),
    );
    const saved = await result?.saving;
    expect(saved?.saved).toBe(true);
    expect(library.getState().snapshots[0]?.reason).toBe('archive');
    // 已经没有可归档的词
    expect(quiz.archiveUnit()).toBeNull();

    if (saved === undefined || saved.snapshotId === null) throw new Error('应当保存快照');
    await library.restoreSnapshot(saved.snapshotId, { saveCurrent: false });
    expect(library.getState().library.pool).toEqual(POOL);
    expect(library.getState().library.archive).toEqual([]);
  });

  it('未通关、或从归档库发起的测验不归档（F-035 / F-037）', async () => {
    const { quiz, library } = await setup();
    await quiz.load();
    quiz.start(POOL, POOL_SCOPE);
    quiz.submit('der Tisch');
    quiz.next();
    quiz.submit('die Tür');
    quiz.next();
    expect(quiz.archiveUnit()).toBeNull();

    quiz.start(POOL, { source: 'archive', sections: [] });
    quiz.submit('der Schrank');
    quiz.next();
    quiz.submit('die Tür');
    quiz.next();
    expect(quiz.getState().session).toMatchObject({ index: POOL.length, round: 1 });
    expect(quiz.archiveUnit()).toBeNull();
    expect(library.getState().library.pool).toEqual(POOL);
  });

  it('保存失败不影响作答', async () => {
    const { quiz, repository } = await setup();
    await quiz.load();
    repository.failure = new StorageError('unknown');
    quiz.start(POOL, POOL_SCOPE);
    quiz.submit('der Schrank');
    await settle();
    expect(quiz.getState().session?.responses).toHaveLength(1);
  });

  it('订阅者在每次变化时收到通知，取消订阅后不再收到', async () => {
    const { quiz } = await setup();
    let calls = 0;
    const unsubscribe = quiz.subscribe(() => {
      calls += 1;
    });
    await quiz.load();
    quiz.start(POOL, POOL_SCOPE);
    unsubscribe();
    quiz.submit('x');
    expect(calls).toBe(2);
  });
});
