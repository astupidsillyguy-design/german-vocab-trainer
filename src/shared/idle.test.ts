import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAfterLoad, runWhenIdle, runWhenSettled } from './idle';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('runWhenIdle', () => {
  it('支持 requestIdleCallback 时交给浏览器调度，并带超时上限', () => {
    const request = vi.fn<(task: () => void, options?: { timeout: number }) => number>(() => 7);
    const cancel = vi.fn<(handle: number) => void>();
    vi.stubGlobal('requestIdleCallback', request);
    vi.stubGlobal('cancelIdleCallback', cancel);
    const task = vi.fn();

    const dispose = runWhenIdle(task);

    expect(request).toHaveBeenCalledWith(task, { timeout: expect.any(Number) as number });
    dispose();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it('没有 requestIdleCallback 时延迟执行，可取消', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const task = vi.fn();

    runWhenIdle(task);
    expect(task).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(task).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    runWhenIdle(cancelled)();
    vi.runAllTimers();
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe('runAfterLoad', () => {
  it('页面已加载完成时立即执行', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    const task = vi.fn();
    runAfterLoad(task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('页面还在加载时，等 load 事件后只执行一次', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const task = vi.fn();
    runAfterLoad(task);
    expect(task).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    window.dispatchEvent(new Event('load'));
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('返回的取消函数在 load 之前调用后，任务不再执行', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const task = vi.fn();
    runAfterLoad(task)();
    window.dispatchEvent(new Event('load'));
    expect(task).not.toHaveBeenCalled();
  });
});

describe('runWhenSettled', () => {
  const SETTLE_MS = 3000;

  it('加载完成后再等一段时间、并等到空闲才执行', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const task = vi.fn();

    runWhenSettled(task);
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(task).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(task).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('在任何阶段取消都不会再执行', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');

    const duringDelay = vi.fn();
    runWhenSettled(duringDelay)();
    vi.runAllTimers();
    expect(duringDelay).not.toHaveBeenCalled();

    const duringIdle = vi.fn();
    const dispose = runWhenSettled(duringIdle);
    vi.advanceTimersByTime(SETTLE_MS);
    dispose();
    vi.runAllTimers();
    expect(duringIdle).not.toHaveBeenCalled();
  });
});
