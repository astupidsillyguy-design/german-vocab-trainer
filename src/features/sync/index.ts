/**
 * 设备直连同步（F-070 – F-081）的界面：入口、面板与写入词库。传输层见 src/sync。
 */
export { useSyncSheet, type OpenSyncOptions, type SyncSheetControls } from './context';
export type { SyncEnvironment, SyncEnvironmentFactory } from './environment';
export { SyncProvider, type SyncProviderProps } from './SyncProvider';
