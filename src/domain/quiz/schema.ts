/**
 * 持久化的测验会话（刷新后继续，F-011）：逐字段校验，并检查字段之间的一致性。
 * 校验不通过时丢弃会话、重新开始，不影响词库本身。
 */
import {
  array,
  boolean,
  literal,
  nullable,
  number,
  object,
  parse,
  refine,
  string,
  type Schema,
} from '../../shared/schema';
import { LIMITS } from '../limits';
import {
  answersSchema,
  entryIdSchema,
  groupNameSchema,
  promptSchema,
  timestampSchema,
  uuidSchema,
  verbFormSchema,
} from '../schemas';
import { QUIZ_SESSION_VERSION, QUIZ_SOURCES, type QuizSession } from './session';

const ENTRY_LIMIT = { max: LIMITS.entriesPerCollection };
/** 一次最多可以组合的课时数 */
const SECTION_LIMIT = { max: LIMITS.chapters * LIMITS.lessonsPerChapter };
/** 轮次上限：远超实际使用，只为拒绝异常数据 */
const MAX_ROUND = 10_000;

const questionSchema = object({
  id: entryIdSchema,
  chapter: groupNameSchema,
  lesson: groupNameSchema,
  prompt: promptSchema,
  answers: answersSchema,
  verbForm: verbFormSchema,
});

const shapeSchema = object({
  version: literal(QUIZ_SESSION_VERSION),
  id: uuidSchema,
  scope: object({
    source: literal(...QUIZ_SOURCES),
    sections: array(
      object({ chapter: groupNameSchema, lesson: nullable(groupNameSchema) }),
      SECTION_LIMIT,
    ),
  }),
  startedAt: timestampSchema,
  questions: array(questionSchema, { min: 1, ...ENTRY_LIMIT }),
  round: number({ min: 1, max: MAX_ROUND, integer: true }),
  lockedIds: array(entryIdSchema, ENTRY_LIMIT),
  order: array(entryIdSchema, { min: 1, ...ENTRY_LIMIT }),
  responses: array(
    object({ input: string({ max: LIMITS.answerLength }), correct: boolean() }),
    ENTRY_LIMIT,
  ),
  index: number({ min: 0, max: LIMITS.entriesPerCollection, integer: true }),
});

function isConsistent(session: QuizSession): boolean {
  const ids = new Set(session.questions.map((question) => question.id));
  const answered = session.responses.length;
  return (
    ids.size === session.questions.length &&
    session.order.every((id) => ids.has(id)) &&
    new Set(session.order).size === session.order.length &&
    session.lockedIds.every((id) => ids.has(id)) &&
    session.index <= session.order.length &&
    answered <= session.order.length &&
    (answered === session.index || answered === session.index + 1)
  );
}

export const quizSessionSchema: Schema<QuizSession> = refine(shapeSchema, isConsistent);

export function parseQuizSession(value: unknown): QuizSession | null {
  const result = parse(quizSessionSchema, value);
  return result.ok ? result.value : null;
}
