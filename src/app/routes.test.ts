import { describe, expect, it } from 'vitest';
import { APP_ROUTES, DEFAULT_PATH, hrefFor, routeIdForPath } from './routes';

describe('routes', () => {
  it('默认进入测验页', () => {
    expect(DEFAULT_PATH).toBe('/quiz');
  });

  it.each(APP_ROUTES.map((route) => [route.path, route.id] as const))('%s → %s', (path, id) => {
    expect(routeIdForPath(path)).toBe(id);
    expect(routeIdForPath(`${path}/detail`)).toBe(id);
  });

  it('未知路径与前缀相似的路径不匹配', () => {
    expect(routeIdForPath('/')).toBeNull();
    expect(routeIdForPath('/quizzes')).toBeNull();
    expect(routeIdForPath('/__design')).toBeNull();
  });

  it('生成 hash 链接', () => {
    expect(hrefFor('/archive')).toBe('#/archive');
  });
});
