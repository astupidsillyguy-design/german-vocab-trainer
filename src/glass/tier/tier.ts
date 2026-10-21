/**
 * 玻璃渲染档位的决策（纯函数）。
 *
 * - `webgl`：完整的 Liquid Glass（折射、色散、菲涅尔、方向高光、形状融合），只折射动态壁纸；
 * - `refraction`：CSS backdrop-filter 模糊 + SVG 位移贴图近似边缘折射（仅 Chromium 渲染正确）；
 * - `blur`：仅 backdrop-filter 模糊；
 * - `opaque`：不透明材质（降低透明度、增强对比度、强制颜色、浏览器不支持 backdrop-filter）。
 */
export const GLASS_TIERS = ['webgl', 'refraction', 'blur', 'opaque'] as const;
export type GlassTier = (typeof GLASS_TIERS)[number];

/** 用户可选的档位：`auto` 由设备能力决定；WebGL 无法强制开启（设备不支持时无从降级）。 */
export const GLASS_TIER_PREFERENCES = ['auto', 'refraction', 'blur', 'opaque'] as const;
export type GlassTierPreference = (typeof GLASS_TIER_PREFERENCES)[number];

/** 偏好设置的存储键 */
export const GLASS_TIER_PREFERENCE_KEY = 'glass.tier';

/** `auto`：可用时用 WebGL；`css`：始终用 CSS（导航栏等固定元素，背后滚过的是页面内容而非壁纸） */
export type GlassRenderer = 'auto' | 'css';

export interface GlassCapabilities {
  /** 浏览器提供 WebGL2；能否真正创建上下文要等引擎初始化才知道 */
  readonly webgl2: boolean;
  readonly backdropFilter: boolean;
  /** backdrop-filter 能引用 SVG 滤镜并正确渲染（目前只有 Chromium） */
  readonly svgBackdropFilter: boolean;
}

export interface GlassSystemPreferences {
  readonly reducedTransparency: boolean;
  readonly highContrast: boolean;
  readonly forcedColors: boolean;
}

/** WebGL 引擎状态：`idle` 未加载，`ready` 可用，`failed` 初始化失败，`lost` 上下文丢失（可恢复） */
export type GlassEngineStatus = 'idle' | 'ready' | 'failed' | 'lost';

export interface GlassTierInput {
  readonly capabilities: GlassCapabilities;
  readonly system: GlassSystemPreferences;
  readonly preference: GlassTierPreference;
}

export function parseTierPreference(value: string | null): GlassTierPreference {
  return GLASS_TIER_PREFERENCES.find((preference) => preference === value) ?? 'auto';
}

function requiresOpaque({ capabilities, system, preference }: GlassTierInput): boolean {
  return (
    preference === 'opaque' ||
    !capabilities.backdropFilter ||
    system.reducedTransparency ||
    system.highContrast ||
    system.forcedColors
  );
}

/** CSS 档能达到的最佳效果 */
export function cssTierFor(capabilities: GlassCapabilities): 'refraction' | 'blur' {
  return capabilities.svgBackdropFilter ? 'refraction' : 'blur';
}

/** 是否值得加载 WebGL 引擎（避免在注定用不上时下载与编译着色器） */
export function shouldLoadEngine(input: GlassTierInput): boolean {
  return input.preference === 'auto' && input.capabilities.webgl2 && !requiresOpaque(input);
}

export function resolveGlassTier(input: GlassTierInput, engine: GlassEngineStatus): GlassTier {
  if (requiresOpaque(input)) return 'opaque';
  if (input.preference === 'blur') return 'blur';
  const css = cssTierFor(input.capabilities);
  if (input.preference === 'refraction') return css;
  return engine === 'ready' && shouldLoadEngine(input) ? 'webgl' : css;
}

/** 单个元素的实际档位：指定 CSS 渲染的元素在 WebGL 档下退到 CSS 的最佳档。 */
export function elementTier(
  tier: GlassTier,
  renderer: GlassRenderer,
  capabilities: GlassCapabilities,
): GlassTier {
  return tier === 'webgl' && renderer === 'css' ? cssTierFor(capabilities) : tier;
}
