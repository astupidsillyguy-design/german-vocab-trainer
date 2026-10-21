import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readPairingLink } from '../../shared/pairing';
import { SyncSheetContext, type OpenSyncOptions, type SyncSheetControls } from './context';
import type { SyncEnvironmentFactory } from './environment';

/** 面板与传输层（MQTT、WebRTC、二维码）按需加载，不增加首屏体积 */
const SyncSheet = lazy(() =>
  import('./SyncSheet').then((module) => ({ default: module.SyncSheet })),
);

export interface SyncProviderProps {
  readonly children: ReactNode;
  /** 测试时注入内存信令与直连；省略时使用公共 MQTT 与 WebRTC */
  readonly environment?: SyncEnvironmentFactory;
}

interface SheetState {
  /** 每次打开加一：面板重新挂载，从头开始（关闭动画期间保留原来的内容） */
  readonly serial: number;
  readonly isOpen: boolean;
  readonly code: string | null;
}

/** 用系统相机扫描配对二维码打开应用时，地址中带有配对码：直接打开面板并连接 */
function initialSheet(): SheetState {
  const link = readPairingLink(window.location.href);
  return link === null
    ? { serial: 0, isOpen: false, code: null }
    : { serial: 1, isOpen: true, code: link.code };
}

/** 设备同步（F-070 – F-081）：面板的打开入口，以及打开应用时地址中的配对码 */
export function SyncProvider({ children, environment }: SyncProviderProps) {
  const [sheet, setSheet] = useState(initialSheet);

  const open = useCallback((options: OpenSyncOptions = {}) => {
    setSheet((current) =>
      current.isOpen
        ? current
        : { serial: current.serial + 1, isOpen: true, code: options.code ?? null },
    );
  }, []);

  const onOpenChange = useCallback((isOpen: boolean) => {
    setSheet((current) => ({ ...current, isOpen }));
  }, []);

  // 去掉地址中的配对码：刷新页面不会再次连接，分享出去的地址也不带它
  useEffect(() => {
    const link = readPairingLink(window.location.href);
    if (link !== null) window.history.replaceState(window.history.state, '', link.cleanUrl);
  }, []);

  const controls = useMemo<SyncSheetControls>(() => ({ open }), [open]);

  return (
    <SyncSheetContext value={controls}>
      {children}
      {sheet.serial > 0 && (
        <Suspense fallback={null}>
          <SyncSheet
            key={sheet.serial}
            isOpen={sheet.isOpen}
            onOpenChange={onOpenChange}
            initialCode={sheet.code}
            {...(environment === undefined ? {} : { environment })}
          />
        </Suspense>
      )}
    </SyncSheetContext>
  );
}
