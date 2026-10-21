import { afterEach, describe, expect, it, vi } from 'vitest';
import { setMediaQuery, setReducedMotion } from '../../test/viewport';
import {
  detectCapabilities,
  isChromium,
  prefersReducedMotion,
  readSystemPreferences,
  REDUCED_MOTION_QUERY,
  subscribeMediaQueries,
  SYSTEM_PREFERENCE_QUERIES,
} from './environment';
import {
  cssTierFor,
  elementTier,
  GLASS_TIER_PREFERENCES,
  parseTierPreference,
  resolveGlassTier,
  shouldLoadEngine,
  type GlassCapabilities,
  type GlassSystemPreferences,
  type GlassTierInput,
} from './tier';

const FULL: GlassCapabilities = { webgl2: true, backdropFilter: true, svgBackdropFilter: true };
const SAFARI: GlassCapabilities = { webgl2: true, backdropFilter: true, svgBackdropFilter: false };
const NONE: GlassSystemPreferences = {
  reducedTransparency: false,
  highContrast: false,
  forcedColors: false,
};

function input(overrides: Partial<GlassTierInput> = {}): GlassTierInput {
  return { capabilities: FULL, system: NONE, preference: 'auto', ...overrides };
}

describe('档位决策', () => {
  it('偏好解析：未知值回退为 auto', () => {
    for (const preference of GLASS_TIER_PREFERENCES)
      expect(parseTierPreference(preference)).toBe(preference);
    expect(parseTierPreference(null)).toBe('auto');
    expect(parseTierPreference('webgl')).toBe('auto');
  });

  it('auto：引擎就绪前先用 CSS 最佳档，就绪后升级为 webgl', () => {
    expect(resolveGlassTier(input(), 'idle')).toBe('refraction');
    expect(resolveGlassTier(input(), 'ready')).toBe('webgl');
    expect(resolveGlassTier(input(), 'lost')).toBe('refraction');
    expect(resolveGlassTier(input(), 'failed')).toBe('refraction');
    expect(resolveGlassTier(input({ capabilities: SAFARI }), 'idle')).toBe('blur');
  });

  it.each(Object.keys(NONE) as (keyof GlassSystemPreferences)[])(
    '系统偏好 %s 强制不透明，且不加载引擎',
    (key) => {
      const system = { ...NONE, [key]: true };
      expect(resolveGlassTier(input({ system }), 'ready')).toBe('opaque');
      expect(shouldLoadEngine(input({ system }))).toBe(false);
    },
  );

  it('不支持 backdrop-filter 时不透明', () => {
    const capabilities = { webgl2: true, backdropFilter: false, svgBackdropFilter: false };
    expect(resolveGlassTier(input({ capabilities }), 'ready')).toBe('opaque');
  });

  it('用户偏好：refraction / blur / opaque 都不使用引擎', () => {
    expect(resolveGlassTier(input({ preference: 'refraction' }), 'ready')).toBe('refraction');
    expect(
      resolveGlassTier(input({ preference: 'refraction', capabilities: SAFARI }), 'ready'),
    ).toBe('blur');
    expect(resolveGlassTier(input({ preference: 'blur' }), 'ready')).toBe('blur');
    expect(resolveGlassTier(input({ preference: 'opaque' }), 'ready')).toBe('opaque');
    for (const preference of ['refraction', 'blur', 'opaque'] as const)
      expect(shouldLoadEngine(input({ preference }))).toBe(false);
  });

  it('没有 WebGL2 时不加载引擎', () => {
    expect(shouldLoadEngine(input({ capabilities: { ...FULL, webgl2: false } }))).toBe(false);
    expect(shouldLoadEngine(input())).toBe(true);
  });

  it('固定元素（renderer = css）在 webgl 档退到 CSS 最佳档，其它档不变', () => {
    expect(elementTier('webgl', 'css', FULL)).toBe('refraction');
    expect(elementTier('webgl', 'css', SAFARI)).toBe('blur');
    expect(elementTier('webgl', 'auto', FULL)).toBe('webgl');
    expect(elementTier('opaque', 'css', FULL)).toBe('opaque');
    expect(cssTierFor(FULL)).toBe('refraction');
  });
});

describe('环境探测', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Chromium 内核识别（iOS Chrome 是 WebKit）', () => {
    expect(
      isChromium('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'),
    ).toBe(true);
    expect(
      isChromium('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/153.0.0.0 Safari/537.36'),
    ).toBe(true);
    expect(isChromium('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148')).toBe(
      false,
    );
    expect(
      isChromium('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'),
    ).toBe(false);
  });

  it('能力探测：SVG 背景滤镜只在 Chromium 上启用', () => {
    vi.stubGlobal('CSS', { supports: () => true });
    vi.stubGlobal('WebGL2RenderingContext', {});
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/126.0');
    expect(detectCapabilities()).toEqual(FULL);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Version/17.0 Safari/605.1.15');
    expect(detectCapabilities()).toEqual(SAFARI);
  });

  it('能力探测：不支持 backdrop-filter、没有 WebGL2', () => {
    vi.stubGlobal('CSS', { supports: () => false });
    vi.stubGlobal('WebGL2RenderingContext', undefined);
    expect(detectCapabilities()).toEqual({
      webgl2: false,
      backdropFilter: false,
      svgBackdropFilter: false,
    });
  });

  it('系统偏好读取与订阅', () => {
    expect(readSystemPreferences()).toEqual(NONE);
    expect(prefersReducedMotion()).toBe(false);
    const listener = vi.fn();
    const unsubscribe = subscribeMediaQueries(
      [SYSTEM_PREFERENCE_QUERIES.highContrast, REDUCED_MOTION_QUERY],
      listener,
    );
    setMediaQuery(SYSTEM_PREFERENCE_QUERIES.highContrast, true);
    expect(readSystemPreferences().highContrast).toBe(true);
    setReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setMediaQuery(SYSTEM_PREFERENCE_QUERIES.highContrast, false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
