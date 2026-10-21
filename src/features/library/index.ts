/**
 * 词库的 React 接入：Provider、状态订阅与加载占位。
 */
export { useLibraryState, useLibraryStore } from './context';
export {
  hasLegacyContent,
  importLegacy,
  isLibraryEmpty,
  LEGACY_MIGRATION_KEY,
  migrateLegacyStorage,
  type LegacyImportMode,
  type LegacyImportResult,
  type LegacyMigration,
} from './legacyImport';
export { LibraryLoading, LOADING_INDICATOR_DELAY_MS } from './LibraryLoading';
export { LibraryProvider, type LibraryProviderProps } from './LibraryProvider';
export { snapshotUndoAction, type SnapshotUndoText } from './snapshotUndo';
