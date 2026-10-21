/**
 * 全局通知队列（与 React 无关，可在任何模块中调用 `toast.success(...)`）。
 *
 * 采用先进先出：同时最多显示 MAX_VISIBLE 条，其余排队；
 * 带“撤销”等操作的通知停留更久，并且绝不会因为新通知到来而被挤掉。
 */

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastAction {
  readonly label: string;
  readonly onAction: () => void;
}

export interface ToastOptions {
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
  readonly action?: ToastAction;
  /** 自动关闭时间；`null` 表示需要手动关闭。省略时按是否带操作取默认值 */
  readonly timeoutMs?: number | null;
}

export interface ToastRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly tone: ToastTone;
  readonly action: ToastAction | undefined;
  readonly timeoutMs: number | null;
}

export const TOAST_MAX_VISIBLE = 3;
export const TOAST_TIMEOUT_MS = 4000;
/** 带操作时给足阅读并点击“撤销”的时间（WCAG 2.2.1 可调时限） */
export const TOAST_TIMEOUT_WITH_ACTION_MS = 6000;

type Listener = () => void;

interface ToastQueueOptions {
  readonly maxVisible?: number;
}

export class ToastQueue {
  readonly #maxVisible: number;
  readonly #listeners = new Set<Listener>();
  #queue: readonly ToastRecord[] = [];
  #visible: readonly ToastRecord[] = [];
  #sequence = 0;

  constructor({ maxVisible = TOAST_MAX_VISIBLE }: ToastQueueOptions = {}) {
    this.#maxVisible = maxVisible;
  }

  show(options: ToastOptions): string {
    this.#sequence += 1;
    const id = `toast-${String(this.#sequence)}`;
    const defaultTimeout =
      options.action === undefined ? TOAST_TIMEOUT_MS : TOAST_TIMEOUT_WITH_ACTION_MS;
    const record: ToastRecord = {
      id,
      title: options.title,
      description: options.description,
      tone: options.tone ?? 'neutral',
      action: options.action,
      timeoutMs: options.timeoutMs === undefined ? defaultTimeout : options.timeoutMs,
    };
    this.#commit([...this.#queue, record]);
    return id;
  }

  dismiss(id: string): void {
    if (!this.#queue.some((record) => record.id === id)) return;
    this.#commit(this.#queue.filter((record) => record.id !== id));
  }

  clear(): void {
    if (this.#queue.length === 0) return;
    this.#commit([]);
  }

  /** 正在显示的通知（不含排队中的）。返回值在两次变更之间保持引用稳定，可直接用于 useSyncExternalStore。 */
  getSnapshot = (): readonly ToastRecord[] => this.#visible;

  /** 排队等待显示的数量 */
  get pendingCount(): number {
    return this.#queue.length - this.#visible.length;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #commit(next: readonly ToastRecord[]): void {
    this.#queue = next;
    this.#visible = next.slice(0, this.#maxVisible);
    for (const listener of this.#listeners) listener();
  }
}

/** 应用唯一的通知队列，由 <ToastRegion> 渲染。 */
export const toastQueue = new ToastQueue();

type ToneShortcutOptions = Omit<ToastOptions, 'tone'>;

export const toast = {
  show: (options: ToastOptions): string => toastQueue.show(options),
  success: (options: ToneShortcutOptions): string =>
    toastQueue.show({ ...options, tone: 'success' }),
  error: (options: ToneShortcutOptions): string => toastQueue.show({ ...options, tone: 'danger' }),
  dismiss: (id: string): void => {
    toastQueue.dismiss(id);
  },
};
