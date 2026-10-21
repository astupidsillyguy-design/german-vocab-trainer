import { useMemo, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { RouterProvider } from 'react-aria-components';
import { useLocation } from 'wouter';
import { AppNavigationContext, type AppNavigation } from '../features/navigation';
import { navigationDirection, runViewTransition } from '../motion';
import { pathFor } from './routes';

const HASH_PREFIX = '#';

/** 链接的 href 是 "#/quiz" 形式的 hash 地址；wouter 的 hash 路由使用去掉 # 的路径 */
export function pathFromHref(href: string): string {
  return href.startsWith(HASH_PREFIX) ? href.slice(HASH_PREFIX.length) : href;
}

interface NavigationProviderProps {
  readonly children: ReactNode;
}

/**
 * 应用内导航：所有 React Aria 链接（Tab Bar、侧边栏、按钮式链接）的点击都经过这里，
 * 以视图过渡（View Transitions）切换页面——同级交叉淡化，进入下一级/返回时内容区推入/退出。
 * 新页面在过渡回调中用 flushSync 同步渲染，浏览器才能拍到切换后的画面。
 * 修饰键点击、中键新标签页等仍由浏览器原生处理（React Aria 判断）。
 */
export function NavigationProvider({ children }: NavigationProviderProps) {
  const [location, navigate] = useLocation();
  const go = useMemo(
    () =>
      (to: string): void => {
        if (to === location) return;
        runViewTransition(
          () => {
            flushSync(() => {
              navigate(to);
            });
          },
          navigationDirection(location, to),
        );
      },
    [location, navigate],
  );
  const appNavigation = useMemo<AppNavigation>(
    () => ({
      navigate: (destination) => {
        go(pathFor(destination));
      },
    }),
    [go],
  );
  return (
    <RouterProvider
      navigate={(href) => {
        go(pathFromHref(href));
      }}
    >
      <AppNavigationContext value={appNavigation}>{children}</AppNavigationContext>
    </RouterProvider>
  );
}
