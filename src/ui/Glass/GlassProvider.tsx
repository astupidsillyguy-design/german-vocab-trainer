import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { GLASS_TIER_ATTRIBUTE } from '../../design/tokens';
import {
  detectCapabilities,
  GLASS_TIER_PREFERENCE_KEY,
  loadGlassEngine,
  parseTierPreference,
  prefersReducedMotion,
  readSystemPreferences,
  REDUCED_MOTION_QUERY,
  resolveGlassTier,
  shouldLoadEngine,
  subscribeMediaQueries,
  SYSTEM_PREFERENCE_QUERIES,
  type GlassCapabilities,
  type GlassEngine,
  type GlassEngineLoader,
  type GlassEngineStatus,
  type GlassTierPreference,
} from '../../glass';
import { readPreference, writePreference } from '../../shared/preferences';
import { GlassContext, type GlassContextValue } from './GlassContext';
import { scheduleIdle } from './idle';

export interface GlassProviderProps {
  readonly children: ReactNode;
  /** 覆盖浏览器能力探测（测试与截图用） */
  readonly capabilities?: GlassCapabilities;
  /** 覆盖引擎加载器（测试用）；默认在浏览器空闲时动态加载 WebGL 引擎 */
  readonly loadEngine?: GlassEngineLoader;
}

const SYSTEM_QUERIES = Object.values(SYSTEM_PREFERENCE_QUERIES);
const MOTION_QUERIES = [REDUCED_MOTION_QUERY];

/** 订阅媒体查询，返回 read() 的最新结果 */
function useMediaState<T>(queries: readonly string[], read: () => T): T {
  const [value, setValue] = useState(read);
  useEffect(
    () =>
      subscribeMediaQueries(queries, () => {
        setValue(read());
      }),
    [queries, read],
  );
  return value;
}

/**
 * 决定玻璃档位、按需加载 WebGL 引擎，并把档位写到根元素的 data-glass-tier 上。
 *
 * 首屏始终先用 CSS 档渲染；浏览器空闲时才下载并编译 WebGL 引擎，成功后无缝升级。
 * 上下文丢失时立即退回 CSS 档，恢复后再升级回来；引擎报告渲染开销超支时永久退回 CSS 档。
 */
export function GlassProvider({ children, capabilities, loadEngine }: GlassProviderProps) {
  const [detected] = useState(() => capabilities ?? detectCapabilities());
  const system = useMediaState(SYSTEM_QUERIES, readSystemPreferences);
  const reducedMotion = useMediaState(MOTION_QUERIES, prefersReducedMotion);
  const [preference, setPreferenceState] = useState<GlassTierPreference>(() =>
    parseTierPreference(readPreference(GLASS_TIER_PREFERENCE_KEY)),
  );
  const [engine, setEngine] = useState<GlassEngine | null>(null);
  const [status, setStatus] = useState<GlassEngineStatus>('idle');
  const loader = loadEngine ?? loadGlassEngine;
  const input = { capabilities: detected, system, preference };
  const wantsEngine = shouldLoadEngine(input);

  useEffect(() => {
    if (!wantsEngine || engine !== null || status === 'failed') return undefined;
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      loader({
        reducedMotion: prefersReducedMotion(),
        // 在引擎的整个生命周期内有效：本次 effect 被清理（例如引擎就绪后依赖变化）不影响后续通知；
        // 被取消的加载会立即释放引擎，不会再发出通知；Provider 卸载后 React 会忽略状态更新
        onStatusChange: (next) => {
          if (next === 'degraded') {
            // 设备太慢：释放引擎（见下方 effect 的清理），本次会话不再尝试
            setEngine(null);
            setStatus('failed');
          } else {
            setStatus(next);
          }
        },
      }).then(
        (created) => {
          if (cancelled) {
            created?.dispose();
            return;
          }
          setEngine(created);
          setStatus(created === null ? 'failed' : 'ready');
        },
        (error: unknown) => {
          console.warn('Liquid Glass：加载 WebGL 引擎失败，使用 CSS 玻璃。', error);
          if (!cancelled) setStatus('failed');
        },
      );
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [wantsEngine, engine, status, loader]);

  // 引擎只创建一次，随 Provider 卸载释放
  useEffect(() => () => engine?.dispose(), [engine]);

  useEffect(() => {
    engine?.setReducedMotion(reducedMotion);
  }, [engine, reducedMotion]);

  const tier = resolveGlassTier(input, status);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute(GLASS_TIER_ATTRIBUTE, tier);
    return () => {
      root.removeAttribute(GLASS_TIER_ATTRIBUTE);
    };
  }, [tier]);

  const setPreference = useCallback((next: GlassTierPreference) => {
    setPreferenceState(next);
    writePreference(GLASS_TIER_PREFERENCE_KEY, next);
  }, []);

  const value = useMemo<GlassContextValue>(
    () => ({
      tier,
      capabilities: detected,
      engine: tier === 'webgl' ? engine : null,
      engineStatus: status,
      preference,
      setPreference,
    }),
    [tier, detected, engine, status, preference, setPreference],
  );

  return <GlassContext value={value}>{children}</GlassContext>;
}
