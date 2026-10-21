import { lazy, type ComponentType } from 'react';
import { QuizPage } from '../features/quiz';
import type { RouteId } from './routes';

export interface RoutePage {
  readonly Component: ComponentType;
  /** 提前下载页面代码；已经加载时立即完成 */
  readonly preload: () => Promise<unknown>;
}

type PageLoader = () => Promise<{ readonly default: ComponentType }>;

function lazyPage(load: PageLoader): RoutePage {
  return { Component: lazy(load), preload: load };
}

/**
 * 各路由的页面。测验是默认入口，随主包加载以保证首屏最快；
 * 其余页面按需下载（动态 import 在模块系统里有缓存，重复调用 preload 不会重复下载）。
 */
export const ROUTE_PAGES = {
  quiz: { Component: QuizPage, preload: () => Promise.resolve() },
  archive: lazyPage(() =>
    import('../features/archive').then((module) => ({ default: module.ArchivePage })),
  ),
  words: lazyPage(() =>
    import('../features/words').then((module) => ({ default: module.WordsPage })),
  ),
  settings: lazyPage(() =>
    import('../features/settings').then((module) => ({ default: module.SettingsPage })),
  ),
} as const satisfies Record<RouteId, RoutePage>;

/** 下载全部页面；个别失败（离线等）不影响其余，真正进入该页面时会再次尝试 */
export function preloadRoutePages(): Promise<unknown> {
  return Promise.allSettled(Object.values(ROUTE_PAGES).map((page) => page.preload()));
}
