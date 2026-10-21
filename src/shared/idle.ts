/** 没有 requestIdleCallback（Safari）时，首屏之后延迟这么久再执行 */
const FALLBACK_DELAY_MS = 200;
/** 页面持续繁忙时，空闲任务最迟在这个时间后执行 */
const IDLE_TIMEOUT_MS = 2000;
/** 页面加载完成后，再等这么久才开始后台工作，让首屏的渲染与第一批交互先完成 */
const SETTLE_DELAY_MS = 3000;

/**
 * 在浏览器空闲时执行一次任务，用于预加载等不影响首屏的工作。
 * 返回取消函数（组件卸载时调用）。
 */
export function runWhenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => {
      cancelIdleCallback(handle);
    };
  }
  const handle = setTimeout(task, FALLBACK_DELAY_MS);
  return () => {
    clearTimeout(handle);
  };
}

/**
 * 页面加载完成后执行（已经完成则立即执行），让非必需的工作不与首屏争抢网络与主线程。
 * 返回取消函数。
 */
export function runAfterLoad(task: () => void): () => void {
  if (document.readyState === 'complete') {
    task();
    return () => undefined;
  }
  window.addEventListener('load', task, { once: true });
  return () => {
    window.removeEventListener('load', task);
  };
}

/**
 * 首屏稳定之后的后台工作（预加载其他页面与语言、注册离线缓存）：
 * 先等页面加载完成，再等一小会儿让第一批交互完成，最后等浏览器空闲。
 * 返回取消函数。
 */
export function runWhenSettled(task: () => void): () => void {
  const cancels: (() => void)[] = [];
  cancels.push(
    runAfterLoad(() => {
      const timer = setTimeout(() => {
        cancels.push(runWhenIdle(task));
      }, SETTLE_DELAY_MS);
      cancels.push(() => {
        clearTimeout(timer);
      });
    }),
  );
  return () => {
    for (const cancel of cancels.splice(0)) cancel();
  };
}
