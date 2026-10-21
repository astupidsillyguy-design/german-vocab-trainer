/**
 * 测验会话（F-011 – F-018，轮次规则 F-032 – F-035）：纯数据 + 纯函数，便于持久化（刷新后继续）与测试。
 *
 * - 第 1 轮考本次范围内的全部词；
 * - 第 1 轮结束时，答错的词锁定为“固定错词集”（F-032），之后每一轮重测都考这整组词，
 *   直到某一轮全部答对才算通关（F-035）——只答对上一轮错的那几个不算；
 * - 题目内容在开始时复制进会话：测验途中修改词库不会让题目或进度错乱。
 */
import { LIMITS } from '../limits';
import type { EntryId } from '../id';
import type { Entry } from '../model';
import { normalizeText } from '../text';
import { isCorrectAnswer } from './grade';

export const QUIZ_SOURCES = ['pool', 'archive'] as const;
/** 待测库，或从归档库选出的课时（归档词重测不再归档，F-037） */
export type QuizSource = (typeof QUIZ_SOURCES)[number];

export interface QuizSection {
  readonly chapter: string;
  /** null 表示整个章节 */
  readonly lesson: string | null;
}

export interface QuizScope {
  readonly source: QuizSource;
  /** 空数组表示整个集合 */
  readonly sections: readonly QuizSection[];
}

export type QuizQuestion = Pick<
  Entry,
  'id' | 'chapter' | 'lesson' | 'prompt' | 'answers' | 'verbForm'
>;

export interface QuizResponse {
  readonly input: string;
  readonly correct: boolean;
}

export const QUIZ_SESSION_VERSION = 1;

export interface QuizSession {
  readonly version: typeof QUIZ_SESSION_VERSION;
  readonly id: string;
  readonly scope: QuizScope;
  /** ISO 8601 */
  readonly startedAt: string;
  /** 本次测验的全部题目（第 1 轮的题库），保持词库中的顺序 */
  readonly questions: readonly QuizQuestion[];
  /** 从 1 开始 */
  readonly round: number;
  /** 第 1 轮答错的词（固定错词集）；第 1 轮结束前为空 */
  readonly lockedIds: readonly EntryId[];
  /** 本轮出题顺序 */
  readonly order: readonly EntryId[];
  /** 本轮的作答结果，与 order 一一对应 */
  readonly responses: readonly QuizResponse[];
  /** 当前显示的题目；等于 order.length 表示本轮已结束 */
  readonly index: number;
}

export type QuizPhase = 'answering' | 'answered' | 'finished';

export interface QuizContext {
  readonly id: string;
  readonly now: Date;
  /** 返回 [0, 1) 的随机数（测试中可注入固定序列） */
  readonly random: () => number;
}

export type RandomSource = QuizContext['random'];

/** Fisher–Yates 洗牌（返回新数组） */
export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = output[i];
    const b = output[j];
    if (a === undefined || b === undefined) continue;
    output[i] = b;
    output[j] = a;
  }
  return output;
}

function toQuestion({
  id,
  chapter,
  lesson,
  prompt,
  answers,
  verbForm,
}: QuizQuestion): QuizQuestion {
  return { id, chapter, lesson, prompt, answers, verbForm };
}

/** 题目为空时返回 null（F-038：空词池不开始测验） */
export function createQuizSession(
  entries: readonly QuizQuestion[],
  scope: QuizScope,
  { id, now, random }: QuizContext,
): QuizSession | null {
  const questions = uniqueQuestions(entries);
  if (questions.length === 0) return null;
  return {
    version: QUIZ_SESSION_VERSION,
    id,
    scope,
    startedAt: now.toISOString(),
    questions,
    round: 1,
    lockedIds: [],
    order: shuffle(
      questions.map((question) => question.id),
      random,
    ),
    responses: [],
    index: 0,
  };
}

function uniqueQuestions(entries: readonly QuizQuestion[]): QuizQuestion[] {
  const seen = new Set<EntryId>();
  const output: QuizQuestion[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    output.push(toQuestion(entry));
  }
  return output;
}

function sameSection(a: QuizSection, b: QuizSection): boolean {
  return a.chapter === b.chapter && a.lesson === b.lesson;
}

/** 范围相同：来源相同，选中的章节与课时相同（与顺序无关） */
export function isSameScope(a: QuizScope, b: QuizScope): boolean {
  return (
    a.source === b.source &&
    a.sections.length === b.sections.length &&
    a.sections.every((section) => b.sections.some((other) => sameSection(section, other)))
  );
}

/** 会话的题目恰好是这些词条（与顺序无关） */
export function hasSameQuestions(session: QuizSession, entries: readonly QuizQuestion[]): boolean {
  const ids = new Set(entries.map((entry) => entry.id));
  return (
    ids.size === session.questions.length &&
    session.questions.every((question) => ids.has(question.id))
  );
}

const questionMaps = new WeakMap<readonly QuizQuestion[], ReadonlyMap<EntryId, QuizQuestion>>();

/** 按 id 查题（同一个题目数组只建一次索引） */
export function questionMap(session: QuizSession): ReadonlyMap<EntryId, QuizQuestion> {
  let map = questionMaps.get(session.questions);
  if (map === undefined) {
    map = new Map(session.questions.map((question) => [question.id, question]));
    questionMaps.set(session.questions, map);
  }
  return map;
}

export function phaseOf(session: QuizSession): QuizPhase {
  if (session.index >= session.order.length) return 'finished';
  return session.responses.length > session.index ? 'answered' : 'answering';
}

export function currentQuestion(session: QuizSession): QuizQuestion | null {
  const id = session.order[session.index];
  return id === undefined ? null : (questionMap(session).get(id) ?? null);
}

export function currentResponse(session: QuizSession): QuizResponse | null {
  return session.responses[session.index] ?? null;
}

export interface QuizTally {
  readonly total: number;
  readonly answered: number;
  readonly correct: number;
  readonly wrong: number;
}

export function tallyOf(session: QuizSession): QuizTally {
  const correct = session.responses.filter((response) => response.correct).length;
  return {
    total: session.order.length,
    answered: session.responses.length,
    correct,
    wrong: session.responses.length - correct,
  };
}

export interface WrongAnswer {
  readonly question: QuizQuestion;
  readonly input: string;
}

/** 本轮答错的题（按作答顺序） */
export function wrongAnswers(session: QuizSession): WrongAnswer[] {
  const questions = questionMap(session);
  return session.responses.flatMap((response, index): WrongAnswer[] => {
    if (response.correct) return [];
    const id = session.order[index];
    const question = id === undefined ? undefined : questions.get(id);
    return question === undefined ? [] : [{ question, input: response.input }];
  });
}

/** 提交答案。空白答案（isBlankAnswer）由调用方先拦下；非作答阶段原样返回 */
export function submitAnswer(session: QuizSession, input: string): QuizSession {
  const question = currentQuestion(session);
  if (question === null || phaseOf(session) !== 'answering') return session;
  const text = normalizeText(input).slice(0, LIMITS.answerLength);
  const response: QuizResponse = { input: text, correct: isCorrectAnswer(text, question.answers) };
  return { ...session, responses: [...session.responses, response] };
}

/** 进入下一题；第 1 轮最后一题之后锁定固定错词集（F-032） */
export function advance(session: QuizSession): QuizSession {
  if (phaseOf(session) !== 'answered') return session;
  const index = session.index + 1;
  if (index < session.order.length || session.round > 1) return { ...session, index };
  const lockedIds = session.order.filter(
    (_, position) => session.responses[position]?.correct === false,
  );
  return { ...session, index, lockedIds };
}

/** 本轮已结束且没有答错（F-035 通关） */
export function isRoundPassed(session: QuizSession): boolean {
  return phaseOf(session) === 'finished' && session.responses.every((response) => response.correct);
}

function startRound(
  session: QuizSession,
  round: number,
  ids: readonly EntryId[],
  random: RandomSource,
): QuizSession {
  return { ...session, round, order: shuffle(ids, random), responses: [], index: 0 };
}

/** F-033 重测固定错词集：进入下一轮。只有本轮结束且未通关时可用 */
export function startRetest(session: QuizSession, random: RandomSource): QuizSession {
  if (phaseOf(session) !== 'finished' || isRoundPassed(session) || session.lockedIds.length === 0) {
    return session;
  }
  return startRound(session, session.round + 1, session.lockedIds, random);
}

/** F-034 重新完整测试：回到第 1 轮，清空固定错词集 */
export function restartFull(session: QuizSession, random: RandomSource): QuizSession {
  return {
    ...startRound(
      session,
      1,
      session.questions.map((question) => question.id),
      random,
    ),
    lockedIds: [],
  };
}

/** F-014 重开：重测轮次中重新开始本轮（仍是固定错词集），第 1 轮则重新完整测试 */
export function restartRound(session: QuizSession, random: RandomSource): QuizSession {
  if (session.round > 1 && session.lockedIds.length > 0) {
    return startRound(session, session.round, session.lockedIds, random);
  }
  return restartFull(session, random);
}
