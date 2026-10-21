/** 与 scripts/pwa/service-worker.js 约定的消息：让等待中的新版本立即接管 */
export const SKIP_WAITING_MESSAGE = 'SKIP_WAITING';

const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;

/** 常驻使用的页面（安装到主屏幕后很少重新打开）至少隔这么久才检查一次新版本 */
export const UPDATE_CHECK_INTERVAL_MS = SECONDS_PER_HOUR * MS_PER_SECOND;

/** 只列出用到的部分，真实的 ServiceWorker、ServiceWorkerRegistration、ServiceWorkerContainer 都满足 */
export interface WorkerLike {
  readonly state: ServiceWorkerState;
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'statechange', listener: () => void) => void;
}

export interface RegistrationLike {
  readonly waiting: WorkerLike | null;
  readonly installing: WorkerLike | null;
  addEventListener: (type: 'updatefound', listener: () => void) => void;
  update: () => Promise<unknown>;
}

export interface WorkerContainerLike {
  readonly controller: unknown;
  register: (scriptUrl: string) => Promise<RegistrationLike>;
  addEventListener: (type: 'controllerchange', listener: () => void) => void;
}

export interface RegisterOptions {
  readonly container: WorkerContainerLike;
  readonly scriptUrl: string;
  /** 新版本已下载完成、等待接管时调用；`apply` 让它接管，页面随后自动刷新 */
  readonly onUpdateReady: (apply: () => void) => void;
  readonly reload: () => void;
  readonly now?: () => number;
}

/**
 * 注册 Service Worker，并处理版本更新：
 * - 新版本下载好后不立即替换，而是通知用户，由用户选择何时刷新（不会在做题中途换掉代码）；
 * - 接管后刷新页面，避免旧页面继续请求已被清理的旧版本文件；
 * - 页面回到前台时按间隔检查更新。
 * 第一次安装时的接管不需要刷新，也不算“更新”。
 */
export async function registerServiceWorker({
  container,
  scriptUrl,
  onUpdateReady,
  reload,
  now = Date.now,
}: RegisterOptions): Promise<RegistrationLike> {
  const registration = await container.register(scriptUrl);

  const offer = (worker: WorkerLike): void => {
    onUpdateReady(() => {
      worker.postMessage({ type: SKIP_WAITING_MESSAGE });
    });
  };

  // 页面打开时已有上次没有确认的新版本
  if (registration.waiting !== null && container.controller !== null) offer(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (worker === null) return;
    worker.addEventListener('statechange', () => {
      // 没有旧版本在控制页面时是首次安装，不需要提示
      if (worker.state === 'installed' && container.controller !== null) offer(worker);
    });
  });

  let isControlled = container.controller !== null;
  let isReloading = false;
  container.addEventListener('controllerchange', () => {
    if (!isControlled) {
      isControlled = true;
      return;
    }
    if (isReloading) return;
    isReloading = true;
    reload();
  });

  let lastCheck = now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) {
      return;
    }
    lastCheck = now();
    registration.update().catch(() => {
      // 离线时检查失败是正常的，下次回到前台再试
    });
  });

  return registration;
}
