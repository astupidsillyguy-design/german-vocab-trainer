/**
 * 存储层：IndexedDB 仓库、坏数据隔离、快照与多标签页通知。只依赖领域层，与 React 无关。
 */
import { createChangeChannel } from './channel';
import { IndexedDbRepository } from './IndexedDbRepository';
import { LibraryStore } from './LibraryStore';

export { createChangeChannel, type ChangeChannel } from './channel';
export { CHANGE_CHANNEL_NAME, DB_NAME, DB_VERSION, LIBRARY_KEY, STORE } from './constants';
export { StorageError, toStorageError, type StorageErrorKind } from './errors';
export {
  IndexedDbRepository,
  upgradeDatabase,
  type IndexedDbRepositoryOptions,
} from './IndexedDbRepository';
export { readLegacyStorage } from './legacy';
export { MemoryRepository } from './MemoryRepository';
export {
  LibraryStore,
  type LibraryEvent,
  type LibraryState,
  type LibraryStoreOptions,
  type PersistenceStatus,
  type RestoreOptions,
  type UpdateOptions,
  type UpdateResult,
} from './LibraryStore';
export {
  QUARANTINE_SOURCES,
  readCollection,
  readLibrary,
  readOrder,
  type QuarantineDraft,
  type QuarantineRecord,
  type QuarantineSource,
} from './records';
export type {
  LibraryRepository,
  LoadResult,
  SaveRequest,
  SnapshotRead,
  StorageKind,
} from './repository';

/** 申请持久化存储：浏览器在空间紧张时不会自动清除本站数据（尽力而为，失败不影响使用） */
function requestPersistentStorage(): void {
  if (!('storage' in navigator)) return;
  navigator.storage.persist().catch(() => undefined);
}

/** 应用使用的词库：IndexedDB + 多标签页通知 */
export function createLibraryStore(): LibraryStore {
  return new LibraryStore({
    openRepository: () => IndexedDbRepository.open(),
    channel: createChangeChannel(),
    onFirstSave: requestPersistentStorage,
  });
}
