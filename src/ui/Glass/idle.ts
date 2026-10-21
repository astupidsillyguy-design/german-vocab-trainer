/** 浏览器空闲时执行（Safari 没有 requestIdleCallback，退化为短延时）。返回取消函数。 */
const IDLE_TIMEOUT_MS = 2000;
const FALLBACK_DELAY_MS = 200;

export function scheduleIdle(
  callback: () => void,
  timeoutMs: number = IDLE_TIMEOUT_MS,
): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(callback, { timeout: timeoutMs });
    return () => {
      cancelIdleCallback(handle);
    };
  }
  const handle = setTimeout(callback, FALLBACK_DELAY_MS);
  return () => {
    clearTimeout(handle);
  };
}
