type Listener = () => void;

/**
 * 把“有新版本”从入口（注册 Service Worker 的地方）传到界面（弹出通知的组件）。
 * 快照是让新版本接管的函数；没有新版本时为 null。
 */
export class UpdateChannel {
  readonly #listeners = new Set<Listener>();
  #apply: (() => void) | null = null;

  offer(apply: () => void): void {
    this.#apply = apply;
    for (const listener of this.#listeners) listener();
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): (() => void) | null => this.#apply;
}

export const updateChannel = new UpdateChannel();
