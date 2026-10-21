import { expect, expectAccessible, rootToken, test, VIEWPORTS } from './fixtures';

test.describe('应用外壳', () => {
  test('根路径重定向到测验页', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/#\/quiz$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('测验');
  });

  test('手机尺寸使用底部 Tab Bar，可在页面间切换', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.compact);
    await page.goto('/#/quiz');
    const nav = page.getByRole('navigation', { name: '主导航' });
    await expect(page.getByRole('button', { name: '收起侧边栏' })).toHaveCount(0);

    await nav.getByRole('link', { name: '归档' }).click();

    await expect(page).toHaveURL(/#\/archive$/);
    await expect(nav.getByRole('link', { name: '归档' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('归档');
  });

  test('桌面尺寸使用侧边栏，折叠状态刷新后保留', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.expanded);
    await page.goto('/#/settings');
    await page.getByRole('button', { name: '收起侧边栏' }).click();
    await expect(page.getByRole('button', { name: '展开侧边栏' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.reload();
    await expect(page.getByRole('button', { name: '展开侧边栏' })).toBeVisible();
    // 收起后链接仍有完整名称
    await expect(page.getByRole('link', { name: '设置' })).toHaveAttribute('aria-current', 'page');
  });

  test('窗口跨越断点时导航形态随之切换', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.expanded);
    await page.goto('/#/quiz');
    await expect(page.getByRole('button', { name: '收起侧边栏' })).toBeVisible();
    await page.setViewportSize(VIEWPORTS.compact);
    await expect(page.getByRole('button', { name: '收起侧边栏' })).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-size-class', 'compact');
  });

  test('键盘：首个 Tab 是跳转链接，回车后焦点进入主内容区', async ({ page }) => {
    await page.goto('/#/quiz');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: '跳到主要内容' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page).toHaveURL(/#\/quiz$/);
  });

  test('根据浏览器语言选择界面语言并设置 html lang', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();
    await page.goto('/#/quiz');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Abfrage');
    await context.close();
  });

  for (const path of ['quiz', 'archive', 'words', 'settings'] as const) {
    test(`无障碍：/${path} 无 WCAG 2.2 AA 违规`, async ({ page }) => {
      await page.goto(`/#/${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page);
    });
  }

  test('减少动态效果：弹簧时长归零', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/quiz');
    expect(await rootToken(page, '--spring-snappy-duration')).toBe('0ms');
  });

  test('增强对比度：材质变为不透明', async ({ page }) => {
    await page.emulateMedia({ contrast: 'more' });
    await page.goto('/#/quiz');
    expect(await rootToken(page, '--material-regular-blur')).toBe('0px');
  });
});
