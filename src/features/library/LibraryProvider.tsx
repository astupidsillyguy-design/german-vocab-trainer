import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { LibraryStore } from '../../storage';
import { LibraryContext } from './context';
import { useLegacyMigration } from './useLegacyMigration';
import { useLibraryNotifications } from './useLibraryNotifications';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

export interface LibraryProviderProps {
  readonly store: LibraryStore;
  /** 通知中“查看”无法识别的数据或旧版数据时跳转的页面（设置） */
  readonly reviewPath: string;
  readonly children: ReactNode;
}

/**
 * 注入词库并开始加载。必须放在 Router 与 I18nProvider 内部（通知需要跳转与文案）。
 */
export function LibraryProvider({ store, reviewPath, children }: LibraryProviderProps) {
  const { persistence } = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useLibraryNotifications(store, reviewPath);
  useUnsavedChangesGuard(persistence);
  // 同一组件内的 Effect 按声明顺序执行：先订阅事件再加载，不会错过加载过程中的通知
  useEffect(() => {
    void store.load();
  }, [store]);
  useLegacyMigration(store, reviewPath);
  return <LibraryContext value={store}>{children}</LibraryContext>;
}
