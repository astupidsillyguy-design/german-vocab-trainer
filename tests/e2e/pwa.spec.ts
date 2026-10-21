import { expect, expectAccessible, test, VIEWPORTS } from './fixtures';
import { PREVIEW_URL } from './servers';

/**
 * 离线与安装、安全响应头（F-094、F-095）。
 * 都在生产构建的预览服务器上验证：开发服务器没有 Service Worker、CSP 与 manifest。
 */
test.use({ baseURL: PREVIEW_URL });

const MAIN_ROUTES = [
  { path: '/#/quiz', heading: '测验' },
  { path: '/#/archive', heading: '归档' },
  { path: '/#/words', heading: '词表' },
  { path: '/#/settings', heading: '设置' },
] as const;

test.describe('首屏资源预加载', () => {
  test('默认拉丁字体提前请求且可下载', async ({ page, request }) => {
    await page.goto('/#/quiz');
    const font = page.locator('link[rel="preload"][as="font"]');
    await expect(font).toHaveCount(1);
    await expect(font).toHaveAttribute('crossorigin', '');
    const href = await font.getAttribute('href');
    expect(href).toMatch(/inter-latin-wght-normal-[\w-]+\.woff2$/u);
    const response = await request.get(new URL(href ?? '', page.url()).href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('font/woff2');
  });

  test('主包尚未下载时就请求已保存的语言文案', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gvt.pref.locale', 'de');
    });
    const localeRequest = page.waitForRequest(/\/assets\/de-[\w-]+\.js$/u);
    // 暂停主包：只有独立预加载器先请求了文案，主包才会放行。
    await page.route(/\/assets\/index-[\w-]+\.js$/u, async (route) => {
      await localeRequest;
      await route.continue();
    });
    await page.goto('/#/quiz');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { level: 1, name: 'Abfrage' })).toBeVisible();
    await expect(page.locator('link[rel="modulepreload"][href*="/de-"]')).toHaveCount(1);
  });
});

test.describe('安装到主屏幕', () => {
  test('声明 manifest 与 iOS 图标，图标都能下载', async ({ page, request }) => {
    await page.goto('/#/quiz');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).not.toBeNull();
    const manifestUrl = new URL(manifestHref ?? '', page.url());
    const response = await request.get(manifestUrl.href);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = (await response.json()) as {
      display: string;
      start_url: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);

    const iconUrls = [
      ...manifest.icons.map((icon) => new URL(icon.src, manifestUrl).href),
      new URL(
        (await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')) ?? '',
        page.url(),
      ).href,
    ];
    for (const url of iconUrls) {
      const icon = await request.get(url);
      expect(icon.ok(), url).toBe(true);
      expect(icon.headers()['content-type']).toBe('image/png');
    }
  });

  test('图标使用品牌主色渐变与白色字形', async ({ page }) => {
    await page.goto('/#/quiz');
    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    const center = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('无法创建画布');
      context.drawImage(image, 0, 0);
      const corner = context.getImageData(2, 2, 1, 1).data;
      const crossbar = context.getImageData(image.width / 2, image.height * 0.617, 1, 1).data;
      return { width: image.width, corner: [...corner], crossbar: [...crossbar] };
    }, href ?? '');
    expect(center.width).toBe(180);
    // 左上角是浅靛蓝渐变（不透明），横杠是白色
    expect(center.corner[3]).toBe(255);
    expect(center.corner[2]).toBeGreaterThan(200);
    expect(center.crossbar).toEqual([255, 255, 255, 255]);
  });
});

test.describe('安全响应头', () => {
  test('完整 CSP 与其他加固响应头', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    const policy = headers['content-security-policy'] ?? '';
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('unsafe-eval');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['permissions-policy']).toContain('camera=(self)');
  });

  test('页面里的 CSP 也生效：内联脚本被拦截', async ({ page, consoleErrors }) => {
    await page.goto('/#/quiz');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const executed = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true;';
      document.head.append(script);
      return 'injected' in window || '__injected' in window;
    });
    expect(executed).toBe(false);
    // 违规会记录为控制台错误；这里是故意触发的，取走以免被自动断言当作失败
    await expect.poll(() => consoleErrors.length).toBeGreaterThan(0);
    expect(consoleErrors.join('\n')).toMatch(/Content[- ]Security[- ]Policy/iu);
    consoleErrors.length = 0;
  });
});

test.describe('各页面在 CSP 下正常工作（无控制台错误）', () => {
  for (const viewport of ['compact', 'expanded'] as const) {
    test(`${viewport}：依次访问全部页面并通过无障碍检查`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS[viewport]);
      for (const { path, heading } of MAIN_ROUTES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await expectAccessible(page);
      }
    });
  }

  test('按需加载的设备同步面板可以打开', async ({ page }) => {
    await page.goto('/#/archive');
    await page.getByRole('button', { name: '从其他设备同步' }).click();
    await expect(page.getByRole('dialog', { name: '设备同步' })).toBeVisible();
  });
});

test.describe('离线', () => {
  test('Service Worker 接管后，断网也能打开应用、切换页面与语言', async ({ page, context }) => {
    await page.goto('/#/quiz');
    await page.evaluate(() => navigator.serviceWorker.ready);
    // 首次安装由 clients.claim() 接管当前页面
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '测验' })).toBeVisible();

    // 按需下载的页面与语言文案也来自缓存
    await page.goto('/#/archive');
    await expect(page.getByRole('heading', { level: 1, name: '归档' })).toBeVisible();
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { level: 1, name: '设置' })).toBeVisible();
    await page.getByRole('radio', { name: 'Deutsch' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();

    await context.setOffline(false);
  });

  test('预缓存清单包含全部页面代码与语言文案', async ({ page, request }) => {
    const response = await request.get('/sw.js');
    expect(response.headers()['content-type']).toContain('javascript');
    const source = await response.text();
    const precache = JSON.parse(/"precache":(\[.*?\])/u.exec(source)?.[1] ?? '[]') as string[];
    for (const pattern of [
      /^index\.html$/u,
      /^manifest\.webmanifest$/u,
      /^assets\/archive-.*\.js$/u,
      /^assets\/words-.*\.js$/u,
      /^assets\/settings-.*\.js$/u,
      /^assets\/(zh-CN|en|de|ja)-.*\.js$/u,
      /^assets\/inter-latin-wght-normal-.*\.woff2$/u,
    ]) {
      expect(
        precache.some((file) => pattern.test(file)),
        String(pattern),
      ).toBe(true);
    }
    expect(precache).not.toContain('sw.js');
    expect(precache).not.toContain('_headers');
    await page.goto('/');
  });
});
