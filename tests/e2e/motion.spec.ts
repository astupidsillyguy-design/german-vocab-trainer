import type { Locator, Page } from '@playwright/test';
import { expect, test, VIEWPORTS } from './fixtures';

const GALLERY = '/#/__design';
/** 拖完停顿一会儿再松手：速度归零，只按位置判断落点 */
const SETTLE_PAUSE_MS = 150;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface DragOptions {
  readonly steps?: number;
  /** 松手前停顿；0 表示“甩”出去 */
  readonly pauseMs?: number;
}

async function boxOf(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box === null) throw new Error('元素不可见');
  return box;
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = await boxOf(locator);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(
  page: Page,
  from: Point,
  to: Point,
  { steps = 8, pauseMs = 0 }: DragOptions = {},
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  if (pauseMs > 0) await page.waitForTimeout(pauseMs);
  await page.mouse.up();
}

/**
 * 快速一甩：在页面内按动画帧派发指针事件，松手紧跟最后一次移动。
 * 不经过 CDP 往返，机器繁忙时也不会因为松手延迟而被判定为“停顿后松手”（速度归零）。
 */
async function flick(locator: Locator, delta: Point, steps = 4): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate(
    async (element, { dx, dy, count }) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const init = (clientX: number, clientY: number): PointerEventInit => ({
        pointerId: 99,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      element.dispatchEvent(new PointerEvent('pointerdown', init(x, y)));
      for (let step = 1; step <= count; step += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const progress = step / count;
        window.dispatchEvent(
          new PointerEvent('pointermove', init(x + dx * progress, y + dy * progress)),
        );
      }
      window.dispatchEvent(new PointerEvent('pointerup', init(x + dx, y + dy)));
    },
    { dx: delta.x, dy: delta.y, count: steps },
  );
}

/** 等待所有有限次数的动画播完（入场动画、弹簧之外的 CSS 过渡） */
async function waitForAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function inlineScale(locator: Locator): Promise<string> {
  return locator.evaluate((element: HTMLElement) => element.style.scale);
}

test.describe('动效：设计页', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GALLERY);
    await expect(page.getByRole('heading', { level: 1, name: '设计系统' })).toBeVisible();
  });

  test('玻璃球：拖到哪一侧就吸附到那一角，方向键也能移动', async ({ page }) => {
    const puck = page.getByTestId('motion-puck');
    const arena = await boxOf(page.getByTestId('motion-arena'));
    await expect(puck).toHaveAttribute('data-corner', 'topLeft');
    const start = await centerOf(puck);
    await drag(
      page,
      start,
      { x: arena.x + arena.width - 10, y: arena.y + arena.height - 10 },
      { steps: 10, pauseMs: SETTLE_PAUSE_MS },
    );
    await expect(puck).toHaveAttribute('data-corner', 'bottomRight');
    await expect(puck).toHaveAccessibleName(/右下角/);

    await puck.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(puck).toHaveAttribute('data-corner', 'bottomLeft');
  });

  test('玻璃球：轻轻一甩也能飞到对角（按速度投射），并显示松手速度', async ({ page }) => {
    const puck = page.getByTestId('motion-puck');
    const arena = await boxOf(page.getByTestId('motion-arena'));
    // 只移动四分之一：按位置仍离左上角最近，靠速度投射才能到右下角
    await flick(puck, { x: arena.width / 4, y: arena.height / 4 });
    await expect(puck).toHaveAttribute('data-corner', 'bottomRight');
    await expect(page.getByTestId('motion-velocity')).not.toHaveText(/ 0 /);
  });

  test('玻璃球：飞行途中可以抓住并拖回', async ({ page }) => {
    const puck = page.getByTestId('motion-puck');
    const arena = await boxOf(page.getByTestId('motion-arena'));
    await flick(puck, { x: arena.width / 4, y: 0 });
    // 立刻在当前位置抓住，慢慢拖回起点附近再松手
    const midway = await centerOf(puck);
    await drag(
      page,
      midway,
      { x: arena.x + 10, y: arena.y + 10 },
      { steps: 10, pauseMs: SETTLE_PAUSE_MS },
    );
    await expect(puck).toHaveAttribute('data-corner', 'topLeft');
  });

  test('水滴：合拢后彼此靠近；拖开松手后弹回原位', async ({ page }) => {
    const first = page.getByTestId('motion-droplet-start');
    const before = await boxOf(first);
    const toggle = page.getByRole('button', { name: '合拢' });
    await toggle.click();
    await expect(page.getByRole('button', { name: '分开' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(async () => (await boxOf(first)).x).toBeGreaterThan(before.x);

    await page.getByRole('button', { name: '分开' }).click();
    await expect.poll(async () => Math.abs((await boxOf(first)).x - before.x)).toBeLessThan(1);
    const center = await centerOf(first);
    await drag(page, center, { x: center.x, y: center.y + 60 }, { pauseMs: SETTLE_PAUSE_MS });
    await expect.poll(async () => Math.abs((await boxOf(first)).y - before.y)).toBeLessThan(1);
  });

  test('按压：玻璃按钮放大、实心按钮缩小，松开后弹回并清除样式', async ({ page }) => {
    const glass = page.getByRole('button', { name: '玻璃', exact: true });
    const center = await centerOf(glass);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await expect.poll(async () => Number(await inlineScale(glass))).toBeGreaterThan(1);
    await page.mouse.up();
    await expect.poll(() => inlineScale(glass)).toBe('');

    const filled = page.getByRole('button', { name: '实心', exact: true });
    const point = await centerOf(filled);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await expect.poll(async () => Number((await inlineScale(filled)) || '1')).toBeLessThan(1);
    await page.mouse.up();
    await expect.poll(() => inlineScale(filled)).toBe('');
  });

  test('分段控件：按住选中块拖到另一段，松手即选中', async ({ page }) => {
    const group = page.getByRole('radiogroup', { name: '覆盖方式' });
    const from = await centerOf(group.getByRole('radio', { name: '整库覆盖' }));
    const to = await centerOf(group.getByRole('radio', { name: '按课时' }));
    await drag(page, from, to, { pauseMs: SETTLE_PAUSE_MS });
    await expect(group.getByRole('radio', { name: '按课时' })).toBeChecked();
    await expect(group).not.toHaveAttribute('data-dragging');
  });

  test('开关：按住滑块拖到另一侧切换，迟到的点击不会切回', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: '答对后自动朗读' });
    await expect(toggle).toBeChecked();
    await toggle.scrollIntoViewIfNeeded();
    const track = await toggle.evaluate((input) => {
      const element = input.closest('label')?.querySelector('[aria-hidden="true"]');
      if (!(element instanceof HTMLElement)) throw new Error('缺少轨道');
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const y = track.y + track.height / 2;
    await drag(
      page,
      { x: track.x + track.width - track.height / 2, y },
      { x: track.x + track.height / 2, y },
      { pauseMs: SETTLE_PAUSE_MS },
    );
    await expect(toggle).not.toBeChecked();
  });

  test('Sheet（手机）：上拉标题栏到全屏档，下拉回中档，向下一甩关闭', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.compact);
    await page.getByRole('button', { name: '打开 Sheet' }).click();
    const sheet = page.getByRole('dialog', { name: '设备同步' });
    await expect(sheet).toBeVisible();
    await waitForAnimations(page);
    const handle = sheet.getByRole('button', { name: '调整面板高度' });
    await expect(handle).toHaveAttribute('aria-expanded', 'false');

    const title = sheet.getByRole('heading', { name: '设备同步' });
    const from = await centerOf(title);
    await drag(page, from, { x: from.x, y: from.y - 250 }, { steps: 10, pauseMs: SETTLE_PAUSE_MS });
    await expect(handle).toHaveAttribute('aria-expanded', 'true');
    await waitForAnimations(page);

    const top = await centerOf(title);
    await drag(page, top, { x: top.x, y: top.y + 250 }, { steps: 10, pauseMs: SETTLE_PAUSE_MS });
    await expect(handle).toHaveAttribute('aria-expanded', 'false');
    await expect(sheet).toBeVisible();
    await waitForAnimations(page);

    await flick(title, { x: 0, y: 160 });
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('button', { name: '打开 Sheet' })).toBeFocused();
  });

  test('通知（手机）：位于顶部，向上滑走关闭', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.compact);
    await page.getByRole('button', { name: '错误', exact: true }).click();
    const region = page.getByRole('region', { name: '通知' });
    await expect(region).toHaveAttribute('data-placement', 'top');
    const message = region.getByText('拼写有误');
    await expect(message).toBeVisible();
    await waitForAnimations(page);
    // 顶部只有很短的可滑动距离，使用视口内的短甩；负坐标会让 Firefox 自动化丢失松手事件。
    await flick(message, { x: 0, y: -24 }, 2);
    await expect(message).toHaveCount(0);
  });

  test('通知（桌面）：关闭时先播放退场动画再移除', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.expanded);
    await page.getByRole('button', { name: '错误', exact: true }).click();
    const region = page.getByRole('region', { name: '通知' });
    await expect(region).toHaveAttribute('data-placement', 'bottom-end');
    await expect(region.getByText('拼写有误')).toBeVisible();
    await page.evaluate(() => {
      new MutationObserver((records) => {
        if (
          records.some(
            (record) =>
              record.target instanceof Element && record.target.hasAttribute('data-exiting'),
          )
        ) {
          document.documentElement.dataset.exitSeen = 'true';
        }
      }).observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-exiting'],
      });
    });
    await region.getByRole('button', { name: '关闭通知' }).click();
    await expect(region.getByText('拼写有误')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-exit-seen', 'true');
  });

  test('减少动态效果：按下不缩放，手势仍然跟手', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const glass = page.getByRole('button', { name: '玻璃', exact: true });
    const point = await centerOf(glass);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.waitForTimeout(SETTLE_PAUSE_MS);
    expect(await inlineScale(glass)).toBe('');
    await page.mouse.up();

    const group = page.getByRole('radiogroup', { name: '覆盖方式' });
    const from = await centerOf(group.getByRole('radio', { name: '整库覆盖' }));
    const to = await centerOf(group.getByRole('radio', { name: '按课时' }));
    await drag(page, from, to, { pauseMs: SETTLE_PAUSE_MS });
    await expect(group.getByRole('radio', { name: '按课时' })).toBeChecked();
  });
});

test.describe('动效：应用导航', () => {
  test('Tab Bar（手机）：按住横向拖到另一项，松手即切换页面', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.compact);
    await page.goto('/#/quiz');
    const nav = page.getByRole('navigation', { name: '主导航' });
    const from = await centerOf(nav.getByRole('link', { name: '测验' }));
    const to = await centerOf(nav.getByRole('link', { name: '设置' }));
    await drag(page, from, to, { steps: 12, pauseMs: SETTLE_PAUSE_MS });
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(nav.getByRole('link', { name: '设置' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('设置');
  });

  test('侧边栏（桌面）：选中指示块滑到新的当前项', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.expanded);
    await page.goto('/#/quiz');
    const nav = page.getByRole('navigation', { name: '主导航' });
    const indicator = nav.locator('[data-selection-indicator]');
    await expect(indicator).not.toHaveAttribute('data-hidden');
    const settings = nav.getByRole('link', { name: '设置' });
    await settings.click();
    await expect(settings).toHaveAttribute('aria-current', 'page');
    const target = await boxOf(settings);
    await expect.poll(async () => Math.abs((await boxOf(indicator)).y - target.y)).toBeLessThan(2);
  });

  test('页面切换使用视图过渡，结束后清除方向标记', async ({ page }) => {
    await page.addInitScript(() => {
      if (typeof document.startViewTransition !== 'function') return;
      const original = document.startViewTransition.bind(document);
      let count = 0;
      document.startViewTransition = (update) => {
        count += 1;
        document.documentElement.dataset.viewTransitions = String(count);
        return original(update);
      };
    });
    await page.setViewportSize(VIEWPORTS.compact);
    await page.goto('/#/quiz');
    const supported = await page.evaluate(() => typeof document.startViewTransition === 'function');
    test.skip(!supported, '浏览器不支持 View Transitions，直接切换');
    const nav = page.getByRole('navigation', { name: '主导航' });
    await nav.getByRole('link', { name: '归档' }).click();
    await expect(page).toHaveURL(/#\/archive$/);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-view-transitions', '1');
    await expect(html).not.toHaveAttribute('data-nav-direction');
    // 点击当前页不再触发
    await nav.getByRole('link', { name: '归档' }).click();
    await expect(html).toHaveAttribute('data-view-transitions', '1');
  });
});
