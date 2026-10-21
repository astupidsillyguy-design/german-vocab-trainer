/**
 * 业务页面之间的跳转（例如“保存并测试”后进入测验页）。
 * 路由表属于应用外壳，业务层只按目的地跳转，由外壳决定路径并播放页面切换动画。
 */
import { createContext, use } from 'react';

export const APP_DESTINATIONS = ['quiz', 'archive', 'words', 'settings'] as const;
export type AppDestination = (typeof APP_DESTINATIONS)[number];

export interface AppNavigation {
  readonly navigate: (destination: AppDestination) => void;
}

export const AppNavigationContext = createContext<AppNavigation | null>(null);

export function useAppNavigation(): AppNavigation {
  const navigation = use(AppNavigationContext);
  if (navigation === null) {
    throw new Error('useAppNavigation 必须在应用外壳的 NavigationProvider 内部使用');
  }
  return navigation;
}
