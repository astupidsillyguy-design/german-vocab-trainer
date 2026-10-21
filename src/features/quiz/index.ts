/**
 * 测验：进度（刷新后继续）与测验页；发音按钮也供归档库的词条行使用。
 */
export { useQuizState, useQuizStore } from './context';
export { QuizPage } from './QuizPage';
export { QuizProvider, type QuizProviderProps } from './QuizProvider';
export { SpeakButton, type SpeakButtonProps } from './SpeakButton';
export {
  POOL_SCOPE,
  QUIZ_STATE_KEY,
  QuizStore,
  type QuizState,
  type QuizStoreOptions,
} from './QuizStore';
