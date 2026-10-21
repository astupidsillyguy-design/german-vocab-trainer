import { expect, test, VIEWPORTS } from './fixtures';
import { PREVIEW_URL } from './servers';

/**
 * 性能预算（生产构建）：LCP < 2 秒；点击导航到下一帧绘制 < 100 ms。
 */
const LCP_BUDGET_MS = 2000;
const INTERACTION_BUDGET_MS = 100;

test.use({ baseURL: PREVIEW_URL });

test.describe('性能（生产构建）', () => {
  test('LCP 低于 2 秒', async ({ page }) => {
    await page.goto('/#/quiz');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            resolve(entries.at(-1)?.startTime ?? 0);
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        }),
    );
    expect(lcp).toBeLessThan(LCP_BUDGET_MS);
  });

  test('导航点击到下一帧绘制低于 100 ms', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.compact);
    await page.goto('/#/quiz');
    const link = page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '词表' });
    await expect(link).toBeVisible();
    const elapsed = await link.evaluate(
      (element) =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          (element as HTMLElement).click();
          requestAnimationFrame(() => {
            setTimeout(() => {
              resolve(performance.now() - start);
            }, 0);
          });
        }),
    );
    expect(elapsed).toBeLessThan(INTERACTION_BUDGET_MS);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('词表');
  });
});
