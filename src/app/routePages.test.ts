import { describe, expect, it } from 'vitest';
import { preloadRoutePages, ROUTE_PAGES } from './routePages';
import { APP_ROUTES } from './routes';

describe('routePages', () => {
  it('每个路由都有页面', () => {
    expect(Object.keys(ROUTE_PAGES).sort()).toEqual(APP_ROUTES.map((route) => route.id).sort());
  });

  it('预加载完成后，各页面的代码可被重复取用', async () => {
    await expect(preloadRoutePages()).resolves.toHaveLength(APP_ROUTES.length);
    const again = Object.values(ROUTE_PAGES).map((page) => page.preload());
    await expect(Promise.all(again)).resolves.toHaveLength(APP_ROUTES.length);
  });
});
