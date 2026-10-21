import { createContext, use } from 'react';

export interface OpenSyncOptions {
  /** 打开后自动连接的对方配对码（例如用系统相机扫描二维码打开了应用） */
  readonly code?: string;
}

export interface SyncSheetControls {
  readonly open: (options?: OpenSyncOptions) => void;
}

export const SyncSheetContext = createContext<SyncSheetControls | null>(null);

/** 打开“设备同步”面板（归档页与设置页的入口） */
export function useSyncSheet(): SyncSheetControls {
  const controls = use(SyncSheetContext);
  if (controls === null) throw new Error('useSyncSheet 必须在 <SyncProvider> 内部使用');
  return controls;
}
