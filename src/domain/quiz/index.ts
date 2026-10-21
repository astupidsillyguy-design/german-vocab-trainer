/**
 * 测验：判分、答错对比与会话（轮次）规则。
 */
export { diffAnswer, type AnswerDiff, type DiffKind, type DiffPart } from './diff';
export { isBlankAnswer, isCorrectAnswer } from './grade';
export { parseQuizSession, quizSessionSchema } from './schema';
export {
  QUIZ_SESSION_VERSION,
  QUIZ_SOURCES,
  advance,
  createQuizSession,
  currentQuestion,
  currentResponse,
  hasSameQuestions,
  isRoundPassed,
  isSameScope,
  phaseOf,
  questionMap,
  restartFull,
  restartRound,
  shuffle,
  startRetest,
  submitAnswer,
  tallyOf,
  wrongAnswers,
  type QuizContext,
  type QuizPhase,
  type QuizQuestion,
  type QuizResponse,
  type QuizScope,
  type QuizSection,
  type QuizSession,
  type QuizSource,
  type QuizTally,
  type RandomSource,
  type WrongAnswer,
} from './session';
