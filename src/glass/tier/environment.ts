/**
 * 浏览器能力与系统偏好探测。只做廉价的同步检查：
 * WebGL2 上下文的真实可用性（驱动黑名单、软件渲染）留给引擎初始化时判断，不阻塞首屏。
 */
import type { GlassCapabilities, GlassSystemPreferences } from './tier';

/**
 * Chromium 内核（Chrome、Edge、Opera、Samsung Internet、无头模式的 HeadlessChrome……）；
 * iOS 上的 Chrome 是 WebKit，UA 为 CriOS，不匹配
 */
const CHROMIUM_UA = /\b(?:Headless)?Chrome\/\d+/;

export const SYSTEM_PREFERENCE_QUERIES = {
  reducedTransparency: '(prefers-reduced-transparency: reduce)',
  highContrast: '(prefers-contrast: more)',
  forcedColors: '(forced-colors: active)',
} as const satisfies Record<keyof GlassSystemPreferences, string>;

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function isChromium(userAgent: string): boolean {
  return CHROMIUM_UA.test(userAgent);
}

function cssSupports(property: string, value: string): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports(property, value)
    : false;
}

export function detectCapabilities(): GlassCapabilities {
  const backdropFilter =
    cssSupports('backdrop-filter', 'blur(1px)') ||
    cssSupports('-webkit-backdrop-filter', 'blur(1px)');
  return {
    webgl2: typeof WebGL2RenderingContext !== 'undefined',
    backdropFilter,
    svgBackdropFilter:
      backdropFilter &&
      cssSupports('backdrop-filter', 'url(#a) blur(1px)') &&
      typeof navigator !== 'undefined' &&
      isChromium(navigator.userAgent),
  };
}

function matches(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function readSystemPreferences(): GlassSystemPreferences {
  return {
    reducedTransparency: matches(SYSTEM_PREFERENCE_QUERIES.reducedTransparency),
    highContrast: matches(SYSTEM_PREFERENCE_QUERIES.highContrast),
    forcedColors: matches(SYSTEM_PREFERENCE_QUERIES.forcedColors),
  };
}

export function prefersReducedMotion(): boolean {
  return matches(REDUCED_MOTION_QUERY);
}

/** 订阅一组媒体查询的变化；返回取消订阅函数。 */
export function subscribeMediaQueries(
  queries: readonly string[],
  listener: () => void,
): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const lists = queries.map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener('change', listener);
  return () => {
    for (const list of lists) list.removeEventListener('change', listener);
  };
}
