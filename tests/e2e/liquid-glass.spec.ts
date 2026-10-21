import type { Locator, Page } from '@playwright/test';
// 同时引入 window.__gvtGlass 的全局类型声明
import type { GlassEngineStats } from '../../src/glass/engine/types';
import { expect, expectAccessible, test } from './fixtures';

/**
 * Liquid Glass 的端到端验证：档位决策、WebGL 渲染结果（读取画布像素）、形状融合、
 * 按需渲染（失焦 / 隐藏 / 滚出视口 / 减少动态效果时不绘制）、上下文丢失降级与恢复。
 *
 * WebGL 档的用例依赖开发模式下的调试接口 window.__gvtGlass，并只在 Chromium 上断言像素：
 * 其它浏览器的档位由能力决定（WebKit 没有 SVG 背景滤镜，CSS 档为 blur）。
 * CI / 沙盒没有 GPU（SwiftShader 软件渲染），引擎默认会拒绝启用，因此这些用例通过
 * window.__gvtGlassForceWebgl 跳过软件渲染器检测与帧开销降级，只验证功能。
 */
const GALLERY = '/#/__design';
const ENGINE_TIMEOUT = 15_000;
/** 观察“没有新帧”所等待的时间：远大于 30fps 的帧间隔 */
const QUIET_MS = 600;
const CHANNEL_MAX = 255;

interface Pixel {
  readonly alpha: number;
  readonly luminance: number;
}

function html(page: Page): Locator {
  return page.locator('html');
}

function lab(page: Page) {
  return {
    stage: page.getByRole('group', { name: '玻璃预览' }),
    group: page.getByTestId('glass-lab-group'),
    card: page.getByTestId('glass-lab-card'),
    pill: page.getByTestId('glass-lab-pill'),
  };
}

async function openLab(page: Page): Promise<ReturnType<typeof lab>> {
  await page.goto(GALLERY);
  const parts = lab(page);
  await parts.stage.scrollIntoViewIfNeeded();
  return parts;
}

async function expectWebgl(page: Page): Promise<void> {
  await expect(html(page)).toHaveAttribute('data-glass-tier', 'webgl', { timeout: ENGINE_TIMEOUT });
  await expect(lab(page).group).toHaveAttribute('data-glass-rendered', '');
}

/** 跳过软件渲染器检测与帧开销降级（仅开发模式有效） */
async function forceWebgl({ page }: { readonly page: Page }): Promise<void> {
  await page.addInitScript(() => {
    window.__gvtGlassForceWebgl = true;
  });
}

function stats(page: Page): Promise<GlassEngineStats> {
  return page.evaluate(() => {
    const debug = window.__gvtGlass;
    if (debug === undefined) throw new Error('缺少调试接口 window.__gvtGlass');
    return debug.stats();
  });
}

/** 玻璃实验室中的采样点（读取时按当前布局计算，不受滚动影响） */
type Probe = 'cardCenter' | 'cardTopEdge' | 'canvasCorner' | 'gap';

/** 读取玻璃组画布在各采样点处的像素 */
function readPixels(page: Page, probes: readonly Probe[]): Promise<Pixel[]> {
  return page.evaluate(
    ({ probes: targets, channelMax }) => {
      const query = (testId: string): DOMRect => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (element === null) throw new Error(`缺少 ${testId}`);
        return element.getBoundingClientRect();
      };
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="glass-lab-group"] > canvas',
      );
      const context = canvas?.getContext('2d');
      if (canvas === null || context === null || context === undefined)
        throw new Error('缺少玻璃画布');
      const rect = canvas.getBoundingClientRect();
      const card = query('glass-lab-card');
      const pill = query('glass-lab-pill');
      const points = {
        cardCenter: { x: card.left + card.width / 2, y: card.top + card.height / 2 },
        cardTopEdge: { x: card.left + card.width / 2, y: card.top + 2 },
        canvasCorner: { x: rect.left + 2, y: rect.top + 2 },
        gap: { x: (card.right + pill.left) / 2, y: pill.top + pill.height / 2 },
      };
      const scale = canvas.width / rect.width;
      return targets.map((probe) => {
        const { x, y } = points[probe];
        const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(
          Math.round((x - rect.left) * scale),
          Math.round((y - rect.top) * scale),
          1,
          1,
        ).data;
        return { alpha: a / channelMax, luminance: (r + g + b) / (3 * channelMax) };
      });
    },
    { probes, channelMax: CHANNEL_MAX },
  );
}

async function gapAlpha(page: Page): Promise<number | undefined> {
  return (await readPixels(page, ['gap']))[0]?.alpha;
}

/** 调整滑块后把舞台滚回视口（窄屏上滑块与舞台不在同一屏，滚出视口的组不会重绘） */
async function setSlider(page: Page, name: string, key: 'Home' | 'End'): Promise<void> {
  await page.getByRole('slider', { name }).focus();
  await page.keyboard.press(key);
  await lab(page).stage.scrollIntoViewIfNeeded();
}

/** 等待若干帧后断言计数不再变化 */
async function expectQuiet(page: Page, counter: 'frames' | 'groupDraws'): Promise<void> {
  // 让进行中的帧与过渡收尾
  await page.waitForTimeout(QUIET_MS);
  const before = (await stats(page))[counter];
  await page.waitForTimeout(QUIET_MS);
  expect((await stats(page))[counter]).toBe(before);
}

test.describe('Liquid Glass：WebGL 档', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL 像素断言只在 Chromium 上运行');
  test.beforeEach(forceWebgl);

  test('引擎空闲时加载并升级；玻璃画在画布上：内部不透明、外围透明、边缘有菲涅尔高光', async ({
    page,
  }) => {
    await openLab(page);
    await expectWebgl(page);
    await expect(page.getByTestId('glass-tier')).toHaveText('当前档位：WebGL 折射');
    await expect(page.locator('[data-glass-wallpaper]')).toHaveAttribute('data-glass-rendered', '');

    const [center, corner, edge] = await readPixels(page, [
      'cardCenter',
      'canvasCorner',
      'cardTopEdge',
    ]);
    expect(center?.alpha).toBeGreaterThan(0.9);
    expect(corner?.alpha).toBeLessThan(0.05);
    expect(edge?.luminance).toBeGreaterThan(center?.luminance ?? 1);
  });

  test('固定元素（导航）在 WebGL 档仍使用 CSS 折射', async ({ page }) => {
    await openLab(page);
    await expectWebgl(page);
    const navigationGlass = page
      .getByRole('navigation', { name: '主导航' })
      .locator('[data-tier]')
      .first();
    await expect(navigationGlass).toHaveAttribute('data-tier', 'refraction');
    await expect(lab(page).card).toHaveAttribute('data-tier', 'webgl');
  });

  test('形状融合：融合半径为 0 时间隙透明（只有投影），调大后被玻璃“粘连”填满', async ({
    page,
  }) => {
    await openLab(page);
    await expectWebgl(page);
    await setSlider(page, '融合半径', 'Home');
    await expect.poll(() => gapAlpha(page)).toBeLessThan(0.3);
    await setSlider(page, '融合半径', 'End');
    await expect.poll(() => gapAlpha(page)).toBeGreaterThan(0.9);
  });

  test('按需渲染：窗口失焦、页面隐藏时不再绘制，恢复后继续', async ({ page }) => {
    await openLab(page);
    await expectWebgl(page);
    await expect.poll(async () => (await stats(page)).flowing).toBe(true);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expectQuiet(page, 'frames');
    expect((await stats(page)).flowing).toBe(false);

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(async () => (await stats(page)).flowing).toBe(true);

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expectQuiet(page, 'frames');

    const before = (await stats(page)).frames;
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(before);
  });

  test('滚出视口的玻璃组不参与绘制', async ({ page }) => {
    await openLab(page);
    await expectWebgl(page);
    await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
    await expect.poll(async () => (await stats(page)).visibleGroups).toBe(0);
    await expectQuiet(page, 'groupDraws');
    // 壁纸仍在流动：绘制循环没有停，只是跳过了不可见的组
    expect((await stats(page)).flowing).toBe(true);
  });

  test('WebGL 上下文丢失：立即退回 CSS 档，恢复后重新升级', async ({ page }) => {
    await openLab(page);
    await expectWebgl(page);
    await page.evaluate(() => window.__gvtGlass?.loseContext());
    await expect(html(page)).toHaveAttribute('data-glass-tier', 'refraction');
    await expect(lab(page).group.locator('canvas')).toHaveCount(0);
    await expect(page.locator('[data-glass-wallpaper]')).not.toHaveAttribute('data-glass-rendered');

    await page.evaluate(() => window.__gvtGlass?.restoreContext());
    await expectWebgl(page);
  });

  test('WebGL 档无 WCAG 2.2 AA 违规', async ({ page }) => {
    await openLab(page);
    await expectWebgl(page);
    await expectAccessible(page);
  });
});

test.describe('Liquid Glass：减少动态效果', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', '依赖 WebGL 调试接口');
  test.use({ reducedMotion: 'reduce' });
  test.beforeEach(forceWebgl);

  test('壁纸静止，没有持续绘制', async ({ page }) => {
    await openLab(page);
    await expectWebgl(page);
    expect((await stats(page)).flowing).toBe(false);
    await expectQuiet(page, 'frames');
  });
});

test.describe('Liquid Glass：降级', () => {
  test('没有 WebGL2：使用 CSS 档，Chromium 上用 SVG 位移贴图做边缘折射', async ({
    page,
    browserName,
  }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'WebGL2RenderingContext');
    });
    const { card } = await openLab(page);
    if (browserName !== 'chromium') {
      await expect(html(page)).not.toHaveAttribute('data-glass-tier', 'webgl');
      return;
    }
    await expect(html(page)).toHaveAttribute('data-glass-tier', 'refraction');
    await expect(card).toHaveAttribute('data-refraction', '');
    const filterId = await card.evaluate(
      (element) =>
        /url\(#([^)]+)\)/.exec(element.style.getPropertyValue('--glass-refraction'))?.[1],
    );
    expect(filterId).toMatch(/^glass-refraction-/);
    await expect(page.locator(`[id="${filterId ?? ''}"] feDisplacementMap`)).toHaveCount(1);
    const backdrop = await card.evaluate(
      (element) => getComputedStyle(element, '::before').backdropFilter,
    );
    expect(backdrop).toContain('url(');
    expect(backdrop).toContain('blur(');
    // 页面加载后不应偷偷加载引擎
    await page.waitForTimeout(QUIET_MS);
    expect(await page.evaluate(() => window.__gvtGlass)).toBeUndefined();
  });

  test('应用内选择“不透明”：玻璃改为实色，刷新后保留', async ({ page }) => {
    const { card } = await openLab(page);
    await page
      .getByRole('radiogroup', { name: '渲染档位' })
      .getByRole('radio', { name: '不透明' })
      .click();
    await expect(html(page)).toHaveAttribute('data-glass-tier', 'opaque');
    await expect(page.getByTestId('glass-tier')).toHaveText('当前档位：不透明');
    await expect(card).toHaveAttribute('data-tier', 'opaque');
    await expect(page.locator('[data-glass-wallpaper] canvas')).toHaveCount(0);
    const tint = await card.evaluate(
      (element) => getComputedStyle(element, '::before').backgroundColor,
    );
    expect(tint).toMatch(/^rgb\(/);

    await page.reload();
    await lab(page).stage.scrollIntoViewIfNeeded();
    await expect(html(page)).toHaveAttribute('data-glass-tier', 'opaque');
    await expect(
      page.getByRole('radiogroup', { name: '渲染档位' }).getByRole('radio', { name: '不透明' }),
    ).toBeChecked();
    await expectAccessible(page);
  });

  test('增强对比度：玻璃不透明，不加载引擎', async ({ page }) => {
    await page.emulateMedia({ contrast: 'more' });
    await openLab(page);
    await expect(html(page)).toHaveAttribute('data-glass-tier', 'opaque');
    await page.waitForTimeout(QUIET_MS);
    expect(await page.evaluate(() => window.__gvtGlass)).toBeUndefined();
    await expectAccessible(page);
  });

  test('强制颜色模式：玻璃使用系统颜色', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', '只有 Chromium 支持模拟强制颜色');
    await page.emulateMedia({ forcedColors: 'active' });
    const { card } = await openLab(page);
    await expect(html(page)).toHaveAttribute('data-glass-tier', 'opaque');
    const blur = await card.evaluate(
      (element) => getComputedStyle(element, '::before').backdropFilter,
    );
    expect(blur).not.toContain('blur(1');
  });
});
