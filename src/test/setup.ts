/**
 * Vitest 全局初始化：jest-dom 断言 + jsdom 缺失的浏览器 API。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { toastQueue } from '../ui';
import { resetViewport } from './viewport';

beforeEach(() => {
  resetViewport();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-size-class');
});

afterEach(() => {
  cleanup();
  // 通知队列是全局单例，避免上一个测试的通知泄漏到下一个
  toastQueue.clear();
});

class NoopResizeObserver implements ResizeObserver {
  observe(): void {
    /* jsdom 不做布局，无需回调 */
  }
  unobserve(): void {
    /* 同上 */
  }
  disconnect(): void {
    /* 同上 */
  }
}

// jsdom 没有 ResizeObserver；类型声明认为它总是存在，因此用 `in` 判断
if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: NoopResizeObserver,
    writable: true,
    configurable: true,
  });
}

// jsdom 不做布局，没有 scrollIntoView；保留调用即可
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: () => undefined,
    writable: true,
    configurable: true,
  });
}

// jsdom 未实现 canvas（调用 getContext 会在控制台报 “Not implemented”）。
// 返回 null 与“不支持 2D / WebGL”的浏览器行为一致；需要画布的测试自行 mock。
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => null,
  writable: true,
  configurable: true,
});
