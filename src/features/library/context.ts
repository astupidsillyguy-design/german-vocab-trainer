/**
 * 词库在 React 中的访问入口：store 通过 Context 注入，状态用 useSyncExternalStore 订阅。
 */
import { createContext, use, useSyncExternalStore } from 'react';
import type { LibraryState, LibraryStore } from '../../storage';

export const LibraryContext = createContext<LibraryStore | null>(null);

export function useLibraryStore(): LibraryStore {
  const store = use(LibraryContext);
  if (store === null) throw new Error('useLibraryStore 必须在 <LibraryProvider> 内部使用');
  return store;
}

export function useLibraryState(): LibraryState {
  const store = useLibraryStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
