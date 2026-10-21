import { BookOpenText, Archive, PencilLine, Settings } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
} from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { componentGeometry } from '../design/tokens';
import { useI18n, type Messages } from '../i18n';
import { runWhenSettled } from '../shared/idle';
import { readPreference, writePreference } from '../shared/preferences';
import { GlassWallpaper, Sidebar, Spinner, TabBar, ToastRegion, useSizeClass } from '../ui';
import { preloadRoutePages, ROUTE_PAGES } from './routePages';
import { UpdateNotifier } from './UpdateNotifier';
import {
  APP_ROUTES,
  DEFAULT_PATH,
  DESIGN_GALLERY_PATH,
  hrefFor,
  loadDesignGallery,
  routeIdForPath,
  type RouteId,
} from './routes';
import styles from './AppShell.module.css';

const ROUTE_ICONS = {
  quiz: PencilLine,
  archive: Archive,
  words: BookOpenText,
  settings: Settings,
} as const satisfies Record<RouteId, ComponentType<{ size?: number }>>;

const ROUTE_LABELS = {
  quiz: 'quiz',
  archive: 'archive',
  words: 'wordList',
  settings: 'settings',
} as const satisfies Record<RouteId, keyof Messages['nav']>;

const SIDEBAR_COLLAPSED_KEY = 'sidebar.collapsed';

const galleryLoader = loadDesignGallery;
const DesignGallery =
  galleryLoader === null
    ? null
    : lazy(() => galleryLoader().then((module) => ({ default: module.DesignGallery })));

/**
 * 应用外壳：壁纸、主导航（手机 Tab Bar / 平板与桌面侧边栏）、主内容区与通知区域。
 */
export function AppShell() {
  const { messages } = useI18n();
  const sizeClass = useSizeClass();
  const [location] = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(
    () => readPreference(SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const activeId = routeIdForPath(location);
  const navigation = sizeClass === 'compact' ? 'tabBar' : 'sidebar';

  // 首屏稳定之后在空闲时下载其余页面，之后切换页面不再等待网络
  useEffect(
    () =>
      runWhenSettled(() => {
        void preloadRoutePages();
      }),
    [],
  );

  const items = APP_ROUTES.map((route) => {
    const Icon = ROUTE_ICONS[route.id];
    return {
      id: route.id,
      label: messages.nav[ROUTE_LABELS[route.id]],
      href: hrefFor(route.path),
      icon: (
        <Icon
          size={navigation === 'tabBar' ? componentGeometry.iconLg : componentGeometry.iconMd}
        />
      ),
    };
  });

  // hash 路由下 href="#main" 会被当成路由跳转，因此跳转链接直接把焦点交给主内容区
  const skipToContent = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    mainRef.current?.focus();
  };

  return (
    <div
      className={styles.shell}
      data-navigation={navigation}
      data-sidebar={isSidebarCollapsed ? 'collapsed' : 'expanded'}
    >
      <GlassWallpaper />
      <a href="#main" className={styles.skipLink} onClick={skipToContent}>
        {messages.nav.skipToContent}
      </a>

      {navigation === 'tabBar' ? (
        <TabBar label={messages.nav.primary} items={items} activeId={activeId} />
      ) : (
        <Sidebar
          label={messages.nav.primary}
          header={messages.meta.appName}
          sections={[{ id: 'primary', items }]}
          activeId={activeId}
          isCollapsed={isSidebarCollapsed}
          onCollapsedChange={(collapsed) => {
            setSidebarCollapsed(collapsed);
            writePreference(SIDEBAR_COLLAPSED_KEY, String(collapsed));
          }}
        />
      )}

      <main ref={mainRef} id="main" tabIndex={-1} className={styles.main}>
        <div className={styles.content} data-view-transition="main-content">
          <Suspense
            fallback={
              <div className={styles.loading}>
                <Spinner size="lg" />
              </div>
            }
          >
            <Switch>
              {APP_ROUTES.map((route) => {
                const { Component } = ROUTE_PAGES[route.id];
                return (
                  <Route key={route.id} path={route.path}>
                    <Component />
                  </Route>
                );
              })}
              {DesignGallery !== null && (
                <Route path={DESIGN_GALLERY_PATH} component={DesignGallery} />
              )}
              <Route>
                <Redirect to={DEFAULT_PATH} replace />
              </Route>
            </Switch>
          </Suspense>
        </div>
      </main>

      <ToastRegion />
      <UpdateNotifier />
    </div>
  );
}
