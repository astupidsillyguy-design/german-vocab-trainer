/**
 * 把词库事件转换为通知：保存失败（常驻，可重试）、恢复保存、存储不可用、发现无法识别的数据。
 */
import { useEffect, useEffectEvent, useRef } from 'react';
import { useLocation } from 'wouter';
import { useI18n } from '../../i18n';
import type { LibraryEvent, LibraryStore } from '../../storage';
import { toast } from '../../ui';

export function useLibraryNotifications(store: LibraryStore, reviewPath: string): void {
  const { messages } = useI18n();
  const [, navigate] = useLocation();
  /** 同一时刻只保留一条“未能保存”通知 */
  const failureToast = useRef<string | null>(null);

  const dismissFailure = (): void => {
    if (failureToast.current === null) return;
    toast.dismiss(failureToast.current);
    failureToast.current = null;
  };

  const handleEvent = useEffectEvent((event: LibraryEvent): void => {
    const text = messages.data;
    switch (event.type) {
      case 'save-failed':
        dismissFailure();
        failureToast.current = toast.error({
          title: text.saveFailed,
          description: text.saveFailedReason[event.error.kind],
          timeoutMs: null,
          action: {
            label: text.retry,
            onAction: () => {
              void store.retry();
            },
          },
        });
        break;
      case 'save-recovered':
        dismissFailure();
        toast.success({ title: text.saveRecovered });
        break;
      case 'storage-unavailable':
        toast.show({
          title: text.storageUnavailable,
          description: text.storageUnavailableReason[event.error.kind],
          timeoutMs: null,
        });
        break;
      case 'quarantined':
        toast.show({
          title: text.quarantined(event.count),
          description: text.quarantinedDescription,
          action: {
            label: text.review,
            onAction: () => {
              navigate(reviewPath);
            },
          },
        });
        break;
    }
  });

  useEffect(
    () =>
      store.onEvent((event) => {
        handleEvent(event);
      }),
    [store],
  );
}
