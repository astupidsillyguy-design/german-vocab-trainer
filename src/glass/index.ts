/**
 * Liquid Glass 的公共入口（框架无关）。React 绑定位于 src/ui/Glass。
 *
 * WebGL 引擎不在这里静态导入：它通过 loadGlassEngine() 动态加载，单独打包，
 * 首屏不下载、不编译着色器，LCP 不受影响。
 */
import type { GlassEngineLoader } from './engine/types';

export {
  GLASS_GROUP_ATTRIBUTE,
  GLASS_MOTION_EVENT,
  GLASS_RENDERED_ATTRIBUTE,
  type GlassEngine,
  type GlassEngineCallbacks,
  type GlassEngineEvent,
  type GlassEngineLoader,
  type GlassEngineStats,
  type GlassGroupHandle,
  type GlassShapeHandle,
  type GroupOptions,
  type ShapeOptions,
} from './engine/types';
export {
  displacementMap,
  displacementScale,
  type DisplacementMap,
  type DisplacementMapOptions,
} from './math/displacementMap';
export { SHAPE_EXPONENT, type ShapeKind } from './math/sdf';
export {
  OPTICS_OVERRIDE_KEYS,
  opticsEqual,
  resolveOptics,
  variantTint,
  type GlassOpticsOverrides,
  type ResolvedOptics,
  type Vec4,
} from './optics';
export {
  detectCapabilities,
  prefersReducedMotion,
  readSystemPreferences,
  REDUCED_MOTION_QUERY,
  subscribeMediaQueries,
  SYSTEM_PREFERENCE_QUERIES,
} from './tier/environment';
export {
  cssTierFor,
  elementTier,
  GLASS_TIER_PREFERENCE_KEY,
  GLASS_TIER_PREFERENCES,
  GLASS_TIERS,
  parseTierPreference,
  resolveGlassTier,
  shouldLoadEngine,
  type GlassCapabilities,
  type GlassEngineStatus,
  type GlassRenderer,
  type GlassSystemPreferences,
  type GlassTier,
  type GlassTierInput,
  type GlassTierPreference,
} from './tier/tier';

export const loadGlassEngine: GlassEngineLoader = (callbacks) =>
  import('./engine/GlassEngine').then((module) => module.createGlassEngine(callbacks));
