/**
 * 应用路由表（hash 路由：静态托管无需服务端重写规则）。
 */

export const APP_ROUTES = [
  { id: 'quiz', path: '/quiz' },
  { id: 'archive', path: '/archive' },
  { id: 'words', path: '/words' },
  { id: 'settings', path: '/settings' },
] as const;

export type RouteId = (typeof APP_ROUTES)[number]['id'];

export const DEFAULT_PATH = APP_ROUTES[0].path;

export const DESIGN_GALLERY_PATH = '/__design';

/**
 * 设计系统页只在开发模式或显式开启时打包。
 * 条件与动态 import 必须写在同一个表达式里，构建时常量折叠才能把整个页面从产物中移除。
 */
export const loadDesignGallery =
  import.meta.env.DEV || import.meta.env.VITE_DESIGN_GALLERY === 'true'
    ? () => import('../gallery/DesignGallery')
    : null;

export function pathFor(id: RouteId): string {
  return APP_ROUTES.find((route) => route.id === id)?.path ?? DEFAULT_PATH;
}

export function hrefFor(path: string): string {
  return `#${path}`;
}

export function routeIdForPath(path: string): RouteId | null {
  return (
    APP_ROUTES.find((route) => path === route.path || path.startsWith(`${route.path}/`))?.id ?? null
  );
}
