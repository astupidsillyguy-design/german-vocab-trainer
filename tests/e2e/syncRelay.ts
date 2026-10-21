import type { Browser, Page } from '@playwright/test';
import { BROADCAST_CHANNEL_PREFIX } from '../../src/sync/constants';

/**
 * 设备同步的端到端测试：两台“设备”是两个独立的浏览器上下文（各自的 IndexedDB），
 * 信令经测试进程转发，点对点直连使用真实的 WebRTC。
 *
 * 应用在开发模式下读取 window.__gvtSyncTest，改用 BroadcastChannel 信令、不用 STUN。
 * BroadcastChannel 只在同一个上下文内互通，因此这里替换同步信令使用的频道（按名称前缀区分；
 * 词库的跨标签页通知等其他频道保持原生实现），把消息转发到另一台设备的页面。
 */

declare global {
  interface Window {
    /** 测试进程注入：把同步频道的消息交给测试进程转发 */
    __gvtRelayPost?: (name: string, data: unknown) => Promise<void>;
    /** 页面内：收到另一台设备转发来的消息 */
    __gvtRelayDeliver?: (name: string, data: unknown) => void;
  }
}

/** 在页面脚本之前运行（序列化后注入页面，不能引用外部变量） */
function installRelay(prefix: string): void {
  // 类型声明在应用代码中（src/features/sync/defaultEnvironment.ts）
  Object.assign(window, { __gvtSyncTest: { signaling: 'broadcast', iceServers: [] } });
  const Native = window.BroadcastChannel;
  const relayed = new Set<RelayChannel>();

  const deliver = (name: string, data: unknown, from: RelayChannel | null): void => {
    for (const channel of relayed) {
      if (channel === from || channel.name !== name) continue;
      setTimeout(() => {
        if (relayed.has(channel)) channel.onmessage?.(new MessageEvent('message', { data }));
      });
    }
  };

  /** 只实现信令用到的部分：onmessage、postMessage、close */
  class RelayChannel {
    readonly name: string;
    onmessage: ((event: MessageEvent) => unknown) | null = null;

    constructor(name: string) {
      this.name = name;
      relayed.add(this);
    }

    postMessage(data: unknown): void {
      if (!relayed.has(this)) return;
      deliver(this.name, data, this);
      void window.__gvtRelayPost?.(this.name, data);
    }

    close(): void {
      relayed.delete(this);
    }
  }

  window.__gvtRelayDeliver = (name, data) => {
    deliver(name, data, null);
  };
  // 以 new 调用时返回的对象即为实例：同步频道用转发实现，其他频道用原生实现
  function PatchedChannel(name: string): BroadcastChannel | RelayChannel {
    return name.startsWith(prefix) ? new RelayChannel(name) : new Native(name);
  }
  Object.defineProperty(window, 'BroadcastChannel', {
    value: PatchedChannel,
    configurable: true,
    writable: true,
  });
}

export interface SyncDevices {
  readonly first: Page;
  readonly second: Page;
  /** 第二台设备的控制台错误与未捕获异常（第一台由 fixtures 自动检查） */
  readonly secondErrors: readonly string[];
  readonly close: () => Promise<void>;
}

/** 让 page 成为第一台设备，再新建一个独立上下文作为第二台设备；需在打开页面之前调用 */
export async function createSyncDevices(browser: Browser, page: Page): Promise<SyncDevices> {
  const context = await browser.newContext();
  const second = await context.newPage();
  const secondErrors: string[] = [];
  second.on('console', (message) => {
    if (message.type() === 'error') secondErrors.push(message.text());
  });
  second.on('pageerror', (error) => {
    secondErrors.push(error.message);
  });

  const link = async (from: Page, to: Page): Promise<void> => {
    await from.exposeBinding('__gvtRelayPost', async (_source, name: string, data: unknown) => {
      if (to.isClosed()) return;
      await to.evaluate(
        ([channel, message]) => {
          window.__gvtRelayDeliver?.(channel, message);
        },
        [name, data] as const,
      );
    });
    await from.addInitScript(installRelay, BROADCAST_CHANNEL_PREFIX);
  };
  await link(page, second);
  await link(second, page);

  return {
    first: page,
    second,
    secondErrors,
    close: () => context.close(),
  };
}
