import { useEffect, useState, type ReactNode } from 'react';
import { useLibraryStore } from '../library';
import { QuizContext } from './context';
import { QuizStore } from './QuizStore';

export interface QuizProviderProps {
  /** 测试中可注入（例如固定的随机数）；默认使用当前词库创建 */
  readonly store?: QuizStore;
  readonly children: ReactNode;
}

/** 注入测验进度并开始读取保存的进度。必须放在 LibraryProvider 内部 */
export function QuizProvider({ store, children }: QuizProviderProps) {
  const library = useLibraryStore();
  const [quiz] = useState(() => store ?? new QuizStore({ library }));
  useEffect(() => {
    void quiz.load();
  }, [quiz]);
  return <QuizContext value={quiz}>{children}</QuizContext>;
}
