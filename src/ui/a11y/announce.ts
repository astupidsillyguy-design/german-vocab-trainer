/**
 * 读屏播报（礼貌模式）：拖动排序这类没有焦点变化、也没有可见提示的结果，通过全局 live region 读出。
 * React Aria 的 announce 属于私有 API，因此自己维护一个区域：首次播报时创建，之后复用。
 */
const REGION_ATTRIBUTE = 'data-announcer';
/**
 * 先清空、稍后再写入：同一句话连续出现时读屏也会再次播报；
 * 区域刚创建时也要留出时间让辅助技术注册它，否则第一条消息可能被忽略。
 */
export const ANNOUNCE_DELAY_MS = 100;

let region: HTMLElement | null = null;
let timer: number | null = null;

function ensureRegion(): HTMLElement {
  if (region?.isConnected === true) return region;
  const element = document.createElement('div');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  element.setAttribute(REGION_ATTRIBUTE, '');
  element.className = 'visually-hidden';
  document.body.append(element);
  region = element;
  return element;
}

export function announce(message: string): void {
  if (typeof document === 'undefined') return;
  const element = ensureRegion();
  element.textContent = '';
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    element.textContent = message;
  }, ANNOUNCE_DELAY_MS);
}
