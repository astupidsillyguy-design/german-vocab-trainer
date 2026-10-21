import { describe, expect, it } from 'vitest';
import { makeEntry, TEST_NOW, testId } from '../test/entries';
import {
  advance,
  createQuizSession,
  currentQuestion,
  currentResponse,
  diffAnswer,
  hasSameQuestions,
  isBlankAnswer,
  isCorrectAnswer,
  isRoundPassed,
  isSameScope,
  parseQuizSession,
  phaseOf,
  restartFull,
  restartRound,
  shuffle,
  startRetest,
  submitAnswer,
  tallyOf,
  wrongAnswers,
  type QuizScope,
  type QuizSession,
} from './quiz';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const POOL_SCOPE: QuizScope = { source: 'pool', sections: [] };
/** 固定返回 0：洗牌结果确定（每一步都与第一个元素交换） */
const ZERO = (): number => 0;
/** 不打乱：j 总等于 i */
const KEEP_ORDER = (): number => 1 - Number.EPSILON;

const ENTRIES = [
  makeEntry({ id: testId(1), prompt: '柜子', answers: ['der Schrank'] }),
  makeEntry({ id: testId(2), prompt: '帮助某人', answers: ['jm. bei etw. helfen', 'helfen'] }),
  makeEntry({ id: testId(3), prompt: '门', answers: ['die Tür'] }),
];

function start(random = KEEP_ORDER): QuizSession {
  const session = createQuizSession(ENTRIES, POOL_SCOPE, { id: SESSION_ID, now: TEST_NOW, random });
  if (session === null) throw new Error('应当创建会话');
  return session;
}

/** 依次作答并进入下一题 */
function answerAll(session: QuizSession, inputs: readonly string[]): QuizSession {
  return inputs.reduce((current, input) => advance(submitAnswer(current, input)), session);
}

describe('判分（F-025 / F-026）', () => {
  it('不区分大小写，标点视为空格，多余空白忽略', () => {
    expect(isCorrectAnswer('DER schrank', ['der Schrank'])).toBe(true);
    expect(isCorrectAnswer('  der   Schrank. ', ['der Schrank'])).toBe(true);
    expect(isCorrectAnswer('jm bei etw helfen', ['jm. bei etw. helfen'])).toBe(true);
  });

  it('名词必须写冠词；ä 与 ae、ß 与 ss 不互通', () => {
    expect(isCorrectAnswer('Schrank', ['der Schrank'])).toBe(false);
    expect(isCorrectAnswer('die Tuer', ['die Tür'])).toBe(false);
    expect(isCorrectAnswer('die Strasse', ['die Straße'])).toBe(false);
  });

  it('组合字符与预组合字符等价（NFC）', () => {
    expect(isCorrectAnswer('die Tu\u0308r', ['die Tür'])).toBe(true);
  });

  it('任一可接受答案都算对', () => {
    expect(isCorrectAnswer('helfen', ['jm. bei etw. helfen', 'helfen'])).toBe(true);
  });

  it('只有空格或标点的输入视为空答案（F-019）', () => {
    expect(isBlankAnswer('   ')).toBe(true);
    expect(isBlankAnswer(' ... ')).toBe(true);
    expect(isBlankAnswer('a')).toBe(false);
    expect(isCorrectAnswer('', ['der Schrank'])).toBe(false);
  });
});

describe('字母级对比（F-029）', () => {
  it('写错一个字母：输入标出多写的，答案标出漏写的', () => {
    const diff = diffAnswer('der Schrenk', ['der Schrank']);
    expect(diff.inputParts).toEqual([
      { kind: 'same', text: 'der Schr' },
      { kind: 'extra', text: 'e' },
      { kind: 'same', text: 'nk' },
    ]);
    expect(diff.answerParts).toEqual([
      { kind: 'same', text: 'der Schr' },
      { kind: 'missing', text: 'a' },
      { kind: 'same', text: 'nk' },
    ]);
  });

  it('漏写冠词：答案中的冠词整体标为漏写', () => {
    const diff = diffAnswer('Schrank', ['der Schrank']);
    expect(diff.inputParts).toEqual([{ kind: 'same', text: 'Schrank' }]);
    expect(diff.answerParts).toEqual([
      { kind: 'missing', text: 'der ' },
      { kind: 'same', text: 'Schrank' },
    ]);
  });

  it('大小写不同不算差异，显示各自的原文', () => {
    const diff = diffAnswer('DER schrank', ['der Schrank']);
    expect(diff.inputParts).toEqual([{ kind: 'same', text: 'DER schrank' }]);
    expect(diff.answerParts).toEqual([{ kind: 'same', text: 'der Schrank' }]);
  });

  it('与最接近的可接受答案对比；同样接近时用标准答案', () => {
    expect(diffAnswer('helfn', ['jm. bei etw. helfen', 'helfen']).answer).toBe('helfen');
    expect(diffAnswer('x', ['ab', 'cd']).answer).toBe('ab');
  });

  it('变音字母按码位比较', () => {
    const diff = diffAnswer('die Tuer', ['die Tür']);
    expect(diff.answerParts).toContainEqual({ kind: 'missing', text: 'ü' });
    expect(diff.inputParts).toContainEqual({ kind: 'extra', text: 'ue' });
  });

  it('几乎没有相同字母（写成了另一个词）时整段标出，不逐字标出噪点', () => {
    const diff = diffAnswer('der Tisch', ['eingezogen']);
    expect(diff.inputParts).toEqual([{ kind: 'extra', text: 'der Tisch' }]);
    expect(diff.answerParts).toEqual([{ kind: 'missing', text: 'eingezogen' }]);
  });

  it('异常长的输入不做逐字对比，整段标出', () => {
    const long = 'a'.repeat(5000);
    const diff = diffAnswer(long, ['b'.repeat(200)]);
    expect(diff.inputParts).toEqual([{ kind: 'extra', text: long }]);
  });
});

describe('shuffle', () => {
  it('返回同样元素的新数组，不修改原数组', () => {
    const items = [1, 2, 3, 4];
    const output = shuffle(items, Math.random);
    expect(output).not.toBe(items);
    expect([...output].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4]);
  });

  it('按注入的随机数确定顺序', () => {
    expect(shuffle([1, 2, 3], KEEP_ORDER)).toEqual([1, 2, 3]);
    expect(shuffle([1, 2, 3], ZERO)).toEqual([2, 3, 1]);
  });
});

describe('测验会话', () => {
  it('空词池不开始测验（F-038），重复的词条只出一次', () => {
    expect(
      createQuizSession([], POOL_SCOPE, { id: SESSION_ID, now: TEST_NOW, random: ZERO }),
    ).toBeNull();
    const first = ENTRIES[0];
    if (first === undefined) throw new Error('缺少词条');
    const session = createQuizSession([first, first], POOL_SCOPE, {
      id: SESSION_ID,
      now: TEST_NOW,
      random: ZERO,
    });
    expect(session?.order).toEqual([first.id]);
  });

  it('题目内容复制进会话，不含词条的其他字段', () => {
    const session = start();
    expect(session.questions[0]).toEqual({
      id: testId(1),
      chapter: 'A1',
      lesson: '第30讲',
      prompt: '柜子',
      answers: ['der Schrank'],
      verbForm: null,
    });
    expect(session.startedAt).toBe(TEST_NOW.toISOString());
  });

  it('作答 → 反馈 → 下一题；非作答阶段的操作被忽略', () => {
    let session = start();
    expect(phaseOf(session)).toBe('answering');
    expect(advance(session)).toBe(session);

    session = submitAnswer(session, ' der  Schrank ');
    expect(phaseOf(session)).toBe('answered');
    expect(currentResponse(session)).toEqual({ input: 'der Schrank', correct: true });
    expect(submitAnswer(session, 'noch einmal')).toBe(session);

    session = advance(session);
    expect(currentQuestion(session)?.id).toBe(testId(2));
    expect(tallyOf(session)).toEqual({ total: 3, answered: 1, correct: 1, wrong: 0 });
  });

  it('答错的题按作答顺序列出', () => {
    const session = answerAll(start(), ['der Schrank', 'hilfen', 'die Tuer']);
    expect(wrongAnswers(session).map(({ question, input }) => [question.id, input])).toEqual([
      [testId(2), 'hilfen'],
      [testId(3), 'die Tuer'],
    ]);
  });

  it('第 1 轮全对即通关，不锁定错词', () => {
    const session = answerAll(start(), ['der Schrank', 'helfen', 'die Tür']);
    expect(phaseOf(session)).toBe('finished');
    expect(isRoundPassed(session)).toBe(true);
    expect(session.lockedIds).toEqual([]);
    expect(startRetest(session, ZERO)).toBe(session);
  });

  it('第 1 轮结束时锁定固定错词集（F-032），重测考整组错词（F-033）', () => {
    const first = answerAll(start(), ['x', 'helfen', 'y']);
    expect(first.lockedIds).toEqual([testId(1), testId(3)]);
    expect(isRoundPassed(first)).toBe(false);

    const second = startRetest(first, KEEP_ORDER);
    expect(second.round).toBe(2);
    expect(second.order).toEqual([testId(1), testId(3)]);
    expect(second.responses).toEqual([]);

    // 第 2 轮又错了一个：固定集不变，第 3 轮仍考两个词（F-035：必须一次全对）
    const secondDone = answerAll(second, ['der Schrank', 'z']);
    expect(secondDone.lockedIds).toEqual([testId(1), testId(3)]);
    const third = startRetest(secondDone, KEEP_ORDER);
    expect(third.round).toBe(3);
    expect(third.order).toEqual([testId(1), testId(3)]);

    const passed = answerAll(third, ['der Schrank', 'die Tür']);
    expect(isRoundPassed(passed)).toBe(true);
  });

  it('重开（F-014）：重测轮次重新开始本轮，第 1 轮重新完整测试', () => {
    const firstRound = submitAnswer(start(), 'x');
    const restarted = restartRound(firstRound, KEEP_ORDER);
    expect(restarted.round).toBe(1);
    expect(restarted.responses).toEqual([]);
    expect(restarted.order).toHaveLength(ENTRIES.length);

    const retest = submitAnswer(
      startRetest(answerAll(start(), ['x', 'helfen', 'y']), KEEP_ORDER),
      'der Schrank',
    );
    const again = restartRound(retest, KEEP_ORDER);
    expect(again.round).toBe(2);
    expect(again.order).toEqual([testId(1), testId(3)]);
    expect(again.responses).toEqual([]);
  });

  it('重新完整测试（F-034）回到第 1 轮并清空固定错词集', () => {
    const retest = startRetest(answerAll(start(), ['x', 'helfen', 'y']), KEEP_ORDER);
    const full = restartFull(retest, KEEP_ORDER);
    expect(full.round).toBe(1);
    expect(full.lockedIds).toEqual([]);
    expect(full.order).toEqual(ENTRIES.map((entry) => entry.id));
  });
  it('范围与题目的比较与顺序无关（保存未改动的词表时继续进行中的测验）', () => {
    const a: QuizScope = {
      source: 'archive',
      sections: [
        { chapter: 'A1', lesson: '第1讲' },
        { chapter: 'A2', lesson: null },
      ],
    };
    const reversed: QuizScope = { source: 'archive', sections: [...a.sections].reverse() };
    expect(isSameScope(a, reversed)).toBe(true);
    expect(isSameScope(a, { ...a, source: 'pool' })).toBe(false);
    expect(isSameScope(a, { source: 'archive', sections: [{ chapter: 'A1', lesson: null }] })).toBe(
      false,
    );
    const session = start();
    expect(hasSameQuestions(session, [...ENTRIES].reverse())).toBe(true);
    expect(hasSameQuestions(session, ENTRIES.slice(1))).toBe(false);
  });
});

describe('会话持久化校验', () => {
  it('正常会话经过结构化克隆后原样读回', () => {
    const session = submitAnswer(start(), 'der Schrank');
    expect(parseQuizSession(structuredClone(session))).toEqual(session);
  });

  it('字段之间不一致的会话被拒绝', () => {
    const session = start();
    const unknownId = testId(99);
    expect(parseQuizSession({ ...session, order: [...session.order, unknownId] })).toBeNull();
    expect(parseQuizSession({ ...session, index: 2 })).toBeNull();
    expect(parseQuizSession({ ...session, lockedIds: [unknownId] })).toBeNull();
    expect(parseQuizSession({ ...session, order: [testId(1), testId(1)] })).toBeNull();
    expect(parseQuizSession({ ...session, version: 2 })).toBeNull();
    expect(parseQuizSession('garbage')).toBeNull();
  });
});
