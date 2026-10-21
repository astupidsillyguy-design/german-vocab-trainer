import { expect, expectAccessible, rootToken, test, VIEWPORTS } from './fixtures';

const GALLERY = '/#/__design';

test.describe('设计系统页', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GALLERY);
    await expect(page.getByRole('heading', { level: 1, name: '设计系统' })).toBeVisible();
  });

  test('无 WCAG 2.2 AA 违规', async ({ page }) => {
    await expectAccessible(page);
  });

  test('切换界面语言：文案与 html lang 同步更新，刷新后保留', async ({ page }) => {
    const locales = page.getByRole('radiogroup', { name: '界面语言' });
    await locales.getByRole('radio', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Design System');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('radio', { name: '简体中文' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  });

  test('分段控件：方向键移动焦点，空格选中', async ({ page }) => {
    const group = page.getByRole('radiogroup', { name: '覆盖方式' });
    await group.getByRole('radio', { name: '整库覆盖' }).focus();
    await page.keyboard.press('ArrowRight');
    const selective = group.getByRole('radio', { name: '按课时' });
    await expect(selective).toBeFocused();
    await page.keyboard.press('Space');
    await expect(selective).toBeChecked();
  });

  test('开关：空格切换', async ({ page }) => {
    const toggle = page.getByRole('switch').first();
    const before = await toggle.isChecked();
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked({ checked: !before });
  });

  test('警告对话框：破坏性操作默认聚焦取消，Esc 关闭后焦点回到触发按钮', async ({ page }) => {
    const trigger = page.getByRole('button', { name: '删除课时', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog', { name: '永久删除该课时？' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused();

    // 焦点锁定在对话框内
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: '删除' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('确认删除后出现可撤销通知，并被读屏区域收录', async ({ page }) => {
    await page.getByRole('button', { name: '删除课时', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '删除' }).click();
    const region = page.getByRole('region', { name: '通知' });
    await expect(region.getByText('已归档 24 个词')).toBeVisible();
    await expect(region.getByRole('list')).toHaveAttribute('aria-live', 'polite');
    await region.getByRole('button', { name: '关闭通知' }).click();
    await expect(region.getByText('已归档 24 个词')).toHaveCount(0);
  });

  test('错误通知以 alert 角色立即播报', async ({ page }) => {
    await page.getByRole('button', { name: '错误', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('拼写有误');
  });

  test('菜单：键盘打开、方向键导航、Esc 关闭', async ({ page }) => {
    const trigger = page.getByRole('button', { name: '更多操作' });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: '重新开始' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Sheet：手机尺寸从底部升起，把手切换档位，关闭后焦点回归', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.compact);
    const trigger = page.getByRole('button', { name: '打开 Sheet' });
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: '设备同步' });
    await expect(sheet).toBeVisible();

    const handle = sheet.getByRole('button', { name: '调整面板高度' });
    await expect(handle).toHaveAttribute('aria-expanded', 'false');
    await handle.click();
    await expect(handle).toHaveAttribute('aria-expanded', 'true');

    await sheet.getByRole('button', { name: '关闭' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Sheet：宽屏居中呈现，无把手', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.expanded);
    await page.getByRole('button', { name: '打开 Sheet' }).click();
    const sheet = page.getByRole('dialog', { name: '设备同步' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: '调整面板高度' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('浮层打开时无 WCAG 违规', async ({ page }) => {
    await page.getByRole('button', { name: '删除课时', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expectAccessible(page);
  });

  test('减少透明度：材质改为不透明、去除模糊（Chromium）', async ({ page, browserName }) => {
    test.skip(
      browserName !== 'chromium',
      '仅 Chromium 可通过 CDP 模拟 prefers-reduced-transparency',
    );
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    });
    expect(await rootToken(page, '--material-thick-blur')).toBe('0px');
  });

  test('减少动态效果：弹簧时长归零，透明度过渡保留', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await rootToken(page, '--spring-press-duration')).toBe('0ms');
    expect(await rootToken(page, '--fade-standard')).not.toBe('0ms');
  });
});
