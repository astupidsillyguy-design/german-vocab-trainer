import { useCallback, type RefCallback } from 'react';
import { squirclePath } from '../../design/math/squircle';
import { CORNER_SMOOTHING } from '../../design/tokens';

let nativeSupport: boolean | undefined;

/** 浏览器是否原生支持 `corner-shape: squircle`（目前仅新版 Chromium）。 */
export function supportsNativeSquircle(): boolean {
  nativeSupport ??=
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('corner-shape', 'squircle');
  return nativeSupport;
}

/**
 * 不支持原生超椭圆时，按元素实际尺寸生成 `clip-path: path()`，
 * 写入 CSS 变量 `--surface-clip`，由 Surface 的材质层读取。
 * 传入 null 表示不需要超椭圆（例如胶囊形）。
 */
export function useSquircleClip<T extends HTMLElement>(radius: number | null): RefCallback<T> {
  return useCallback(
    (element: T | null) => {
      if (
        !element ||
        radius === null ||
        supportsNativeSquircle() ||
        typeof ResizeObserver === 'undefined'
      ) {
        return undefined;
      }
      const apply = (): void => {
        const path = squirclePath({
          width: element.offsetWidth,
          height: element.offsetHeight,
          radius,
          smoothing: CORNER_SMOOTHING,
        });
        element.style.setProperty('--surface-clip', `path('${path}')`);
      };
      const observer = new ResizeObserver(apply);
      observer.observe(element);
      apply();
      return () => {
        observer.disconnect();
        element.style.removeProperty('--surface-clip');
      };
    },
    [radius],
  );
}
