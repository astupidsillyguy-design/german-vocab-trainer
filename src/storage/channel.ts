/**
 * 多标签页协同：一个标签页保存词库后通知其他标签页重新读取，避免两边各自覆盖对方的修改。
 */
import { newId } from '../domain';
import { CHANGE_CHANNEL_NAME } from './constants';
import { isRawRecord } from './records';

export interface ChangeChannel {
  post(): void;
  subscribe(listener: () => void): () => void;
  close(): void;
}

const MESSAGE_TYPE = 'library-changed';

export function createChangeChannel(
  name: string = CHANGE_CHANNEL_NAME,
  origin: string = newId(),
): ChangeChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(name);
  const listeners = new Set<() => void>();
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const { data } = event;
    // 消息来自同源页面，仍按外部数据对待
    if (!isRawRecord(data) || data.type !== MESSAGE_TYPE || data.origin === origin) return;
    for (const listener of listeners) listener();
  });
  return {
    post: () => {
      channel.postMessage({ type: MESSAGE_TYPE, origin });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => {
      listeners.clear();
      channel.close();
    },
  };
}
