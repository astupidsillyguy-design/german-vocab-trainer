import { useBeforeUnloadWarning } from '../../shared/useBeforeUnloadWarning';
import type { PersistenceStatus } from '../../storage';

/** 还有修改没写入存储时，关闭或刷新页面前由浏览器弹出确认（F-007） */
export function useUnsavedChangesGuard(persistence: PersistenceStatus): void {
  useBeforeUnloadWarning(persistence !== 'saved');
}
