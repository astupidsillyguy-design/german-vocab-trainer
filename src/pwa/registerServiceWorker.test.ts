import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerServiceWorker,
  SKIP_WAITING_MESSAGE,
  UPDATE_CHECK_INTERVAL_MS,
  type RegistrationLike,
  type WorkerContainerLike,
  type WorkerLike,
} from './registerServiceWorker';

type Listener = () => void;

class FakeWorker implements WorkerLike {
  state: ServiceWorkerState = 'installing';
  readonly postMessage = vi.fn<(message: unknown) => void>();
  readonly #listeners = new Set<Listener>();

  addEventListener(_type: 'statechange', listener: Listener): void {
    this.#listeners.add(listener);
  }

  become(state: ServiceWorkerState): void {
    this.state = state;
    for (const listener of this.#listeners) listener();
  }
}

class FakeRegistration implements RegistrationLike {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  readonly update = vi.fn<() => Promise<unknown>>(() => Promise.resolve());
  readonly #listeners = new Set<Listener>();

  addEventListener(_type: 'updatefound', listener: Listener): void {
    this.#listeners.add(listener);
  }

  /** 浏览器发现新脚本并开始安装 */
  startInstalling(): FakeWorker {
    const worker = new FakeWorker();
    this.installing = worker;
    for (const listener of this.#listeners) listener();
    return worker;
  }
}

class FakeContainer implements WorkerContainerLike {
  controller: unknown = null;
  readonly registration = new FakeRegistration();
  readonly register = vi.fn<(url: string) => Promise<RegistrationLike>>(() =>
    Promise.resolve(this.registration),
  );
  readonly #listeners = new Set<Listener>();

  addEventListener(_type: 'controllerchange', listener: Listener): void {
    this.#listeners.add(listener);
  }

  /** 新的 Service Worker 接管页面 */
  takeControl(): void {
    this.controller = {};
    for (const listener of this.#listeners) listener();
  }
}

interface Setup {
  readonly container: FakeContainer;
  readonly onUpdateReady: ReturnType<typeof vi.fn<(apply: () => void) => void>>;
  readonly reload: ReturnType<typeof vi.fn<() => void>>;
  readonly clock: { current: number };
}

async function setup(configure?: (container: FakeContainer) => void): Promise<Setup> {
  const container = new FakeContainer();
  configure?.(container);
  const onUpdateReady = vi.fn<(apply: () => void) => void>();
  const reload = vi.fn<() => void>();
  const clock = { current: 0 };
  await registerServiceWorker({
    container,
    scriptUrl: './sw.js',
    onUpdateReady,
    reload,
    now: () => clock.current,
  });
  return { container, onUpdateReady, reload, clock };
}

describe('registerServiceWorker', () => {
  it('注册指定脚本', async () => {
    const { container } = await setup();
    expect(container.register).toHaveBeenCalledWith('./sw.js');
  });

  describe('首次安装', () => {
    it('安装完成与接管页面都不提示更新，也不刷新', async () => {
      const { container, onUpdateReady, reload } = await setup();
      container.registration.startInstalling().become('installed');
      container.takeControl();
      expect(onUpdateReady).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    it('接管之后再出现新版本，按更新处理', async () => {
      const { container, onUpdateReady, reload } = await setup();
      container.takeControl();

      const worker = container.registration.startInstalling();
      worker.become('installed');
      expect(onUpdateReady).toHaveBeenCalledTimes(1);

      onUpdateReady.mock.calls[0]?.[0]();
      expect(worker.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING_MESSAGE });

      container.takeControl();
      container.takeControl();
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe('已有旧版本在控制页面', () => {
    it('新版本安装完成后提示，用户确认才让它接管', async () => {
      const { container, onUpdateReady, reload } = await setup((c) => {
        c.controller = {};
      });
      const worker = container.registration.startInstalling();
      worker.become('installing');
      expect(onUpdateReady).not.toHaveBeenCalled();
      worker.become('installed');
      expect(onUpdateReady).toHaveBeenCalledTimes(1);
      expect(worker.postMessage).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();

      onUpdateReady.mock.calls[0]?.[0]();
      expect(worker.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING_MESSAGE });
      container.takeControl();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('其他标签页确认更新时，本页也刷新，避免继续请求已清理的旧文件', async () => {
      const { container, reload } = await setup((c) => {
        c.controller = {};
      });
      container.takeControl();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('打开页面时已有上次没确认的新版本，立即提示', async () => {
      const waiting = new FakeWorker();
      const { onUpdateReady } = await setup((c) => {
        c.controller = {};
        c.registration.waiting = waiting;
      });
      expect(onUpdateReady).toHaveBeenCalledTimes(1);
      onUpdateReady.mock.calls[0]?.[0]();
      expect(waiting.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING_MESSAGE });
    });
  });

  it('没有旧版本控制页面时，等待中的版本不算更新', async () => {
    const { onUpdateReady } = await setup((c) => {
      c.registration.waiting = new FakeWorker();
    });
    expect(onUpdateReady).not.toHaveBeenCalled();
  });
});

describe('回到前台时检查更新', () => {
  let visibility: DocumentVisibilityState = 'visible';

  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });

  afterEach(() => {
    visibility = 'visible';
  });

  function changeVisibility(next: DocumentVisibilityState): void {
    visibility = next;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('距上次检查不足间隔时不检查，超过后检查一次', async () => {
    const { container, clock } = await setup();
    const { update } = container.registration;

    clock.current = UPDATE_CHECK_INTERVAL_MS - 1;
    changeVisibility('visible');
    expect(update).not.toHaveBeenCalled();

    clock.current = UPDATE_CHECK_INTERVAL_MS;
    changeVisibility('visible');
    expect(update).toHaveBeenCalledTimes(1);

    clock.current = UPDATE_CHECK_INTERVAL_MS + 1;
    changeVisibility('visible');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('页面隐藏时不检查', async () => {
    const { container, clock } = await setup();
    clock.current = UPDATE_CHECK_INTERVAL_MS * 2;
    changeVisibility('hidden');
    expect(container.registration.update).not.toHaveBeenCalled();
  });

  it('离线时检查失败不会抛出未处理的错误', async () => {
    const { container, clock } = await setup();
    container.registration.update.mockRejectedValue(new Error('offline'));
    clock.current = UPDATE_CHECK_INTERVAL_MS;
    changeVisibility('visible');
    await Promise.resolve();
    expect(container.registration.update).toHaveBeenCalledTimes(1);
  });
});
