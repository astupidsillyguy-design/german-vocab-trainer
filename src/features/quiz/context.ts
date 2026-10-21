/**
 * 测验进度在 React 中的访问入口。
 */
import { createContext, use, useSyncExternalStore } from 'react';
import type { QuizState, QuizStore } from './QuizStore';

export const QuizContext = createContext<QuizStore | null>(null);

export function useQuizStore(): QuizStore {
  const store = use(QuizContext);
  if (store === null) throw new Error('useQuizStore 必须在 <QuizProvider> 内部使用');
  return store;
}

export function useQuizState(): QuizState {
  const store = useQuizStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
