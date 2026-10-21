import { useEffect, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n';
import { updateChannel, type UpdateChannel } from '../pwa';
import { toast } from '../ui';

interface UpdateNotifierProps {
  /** 默认使用应用的全局通道，测试时传入独立的通道 */
  readonly channel?: UpdateChannel;
}

/**
 * 新版本下载完成后弹出一条需要手动关闭的通知，点“刷新”才切换到新版本。
 * 本身不渲染任何内容。
 */
export function UpdateNotifier({ channel = updateChannel }: UpdateNotifierProps) {
  const { messages } = useI18n();
  const apply = useSyncExternalStore(channel.subscribe, channel.getSnapshot);
  const text = messages.pwa;

  useEffect(() => {
    if (apply === null) return undefined;
    const id = toast.show({
      title: text.updateReady,
      description: text.updateReadyDescription,
      timeoutMs: null,
      action: { label: text.reload, onAction: apply },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [apply, text]);

  return null;
}
