import type { Page } from '@playwright/test';
import { LIBRARY_KEY, STORE } from '../../src/storage/constants';
import { VIEWPORTS, expect, expectAccessible, test } from './fixtures';
import { seed } from './seed';

/**
 * 归档库（F-040 / F-042–F-048 / F-050–F-055）：浏览与搜索、测本课与组合测试、
 * 管理模式下的编辑 / 重命名 / 删除与撤销、键盘与拖动排序，以及手机宽度下的布局。
 */

const ARCHIVED_AT = '2025-03-02T08:30:00.000Z';
/** 拖动时分段移动指针，让排序手势经过阈值并逐步计算落点 */
const DRAG_STEPS = 20;

function archived(serial: number, chapter: string, lesson: string, prompt: string, answer: string) {
  return {
    id: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    chapter,
    lesson,
    prompt,
    answers: [answer],
    verbForm: null,
    linkedForms: [],
    createdAt: ARCHIVED_AT,
    archivedAt: ARCHIVED_AT,
  };
}

const ARCHIVE = [
  archived(1, 'A1', '第1讲', '柜子', 'der Schrank'),
  archived(2, 'A1', '第1讲', '桌子', 'der Tisch'),
  archived(3, 'A1', '第2讲', '猫', 'die Katze'),
  archived(4, 'A2', '第5讲', '工作', 'die Arbeit'),
  archived(5, 'B1', '第9讲', '窗户', 'das Fenster'),
];

async function openArchive(page: Page): Promise<void> {
  await page.goto('/#/archive');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('归档');
  await seed(page, [{ store: STORE.library, key: LIBRARY_KEY.archive, value: ARCHIVE }]);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: '共 5 个归档词汇' })).toBeVisible();
}

function chapter(page: Page, name: string) {
  return page
    .getByRole('heading', { level: 2, name: new RegExp(`^${name}`, 'u') })
    .getByRole('button');
}

function lesson(page: Page, name: string) {
  return page
    .getByRole('heading', { level: 3, name: new RegExp(`^${name}`, 'u') })
    .getByRole('button');
}

async function openLesson(page: Page, chapterName: string, lessonName: string): Promise<void> {
  await chapter(page, chapterName).click();
  await lesson(page, lessonName).click();
}

/** 章节标题的第一行是章节名，第二行是“N 个课时 · N 词” */
async function chapterOrder(page: Page): Promise<string[]> {
  const titles = await page.getByRole('heading', { level: 2 }).allInnerTexts();
  return titles.map((title) => title.split('\n')[0]?.trim() ?? '');
}

/** React Aria 的复选框把原生 input 视觉隐藏，像用户一样点它的标签 */
async function toggleCheckbox(page: Page, name: string): Promise<void> {
  await page
    .locator('label')
    .filter({ has: page.getByRole('checkbox', { name, exact: true }) })
    .click();
}

function toast(page: Page, text: string) {
  return page.getByRole('listitem').filter({ hasText: text });
}

test.describe('归档库', () => {
  test('浏览：统计、逐级展开、搜索与无障碍', async ({ page }) => {
    await openArchive(page);
    await expect(page.getByRole('status')).toHaveText('共 5 个归档词汇 · 分布在 3 个章节');
    expect(await chapterOrder(page)).toEqual(['A1', 'A2', 'B1']);

    await openLesson(page, 'A1', '第1讲');
    await expect(page.getByText('der Schrank')).toBeVisible();
    await expect(page.getByText('柜子')).toBeVisible();
    await expectAccessible(page);

    // 章节一次只展开一个
    await chapter(page, 'A2').click();
    await expect(chapter(page, 'A1')).toHaveAttribute('aria-expanded', 'false');

    const search = page.getByRole('searchbox', { name: '搜索归档库' });
    await search.fill('猫');
    await expect(page.getByText('die Katze')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('找到 1 个词');
    expect(await chapterOrder(page)).toEqual(['A1']);

    await search.fill('Haus');
    await expect(page.getByRole('heading', { name: '没有找到相关内容' })).toBeVisible();
    await expectAccessible(page);
  });

  test('测本课：转到测验页，只出这个课时的词', async ({ page }) => {
    await openArchive(page);
    await chapter(page, 'A1').click();
    await page.getByRole('button', { name: '测本课：第2讲' }).click();
    await expect(page).toHaveURL(/#\/quiz$/u);
    await expect(page.getByRole('textbox', { name: '你的答案' })).toBeVisible();
    await expect(page.getByText('猫', { exact: true })).toBeVisible();
  });

  test('组合测试：只选 1 个课时也可以开始', async ({ page }) => {
    await openArchive(page);
    await page.getByRole('button', { name: '组合测试' }).click();
    const start = page.getByRole('button', { name: '开始组合测试' });
    await expect(start).toBeDisabled();

    await chapter(page, 'A1').click();
    await toggleCheckbox(page, '选择 第2讲');
    await expect(page.getByText('已选 1 个课时')).toBeVisible();
    // 部分选中的章节：原生复选框的 indeterminate 状态
    await expect(page.getByRole('checkbox', { name: '选择 A1', exact: true })).toHaveJSProperty(
      'indeterminate',
      true,
    );
    await expectAccessible(page);

    await start.click();
    await expect(page).toHaveURL(/#\/quiz$/u);
    await expect(page.getByText('猫', { exact: true })).toBeVisible();
  });

  test('管理：双击编辑词条、重命名章节、删除后撤销，刷新后保留', async ({ page }) => {
    await openArchive(page);
    await page.getByRole('button', { name: '管理' }).click();
    await expect(page.getByRole('paragraph').filter({ hasText: /^编辑模式/u })).toBeVisible();
    await openLesson(page, 'A1', '第1讲');

    // 编辑模式下双击整行即可修改
    await page.getByText('der Schrank').dblclick();
    const editor = page.getByRole('dialog', { name: '编辑词条' });
    await editor.getByRole('textbox', { name: '德语' }).fill('der Kleiderschrank');
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(editor).toBeHidden();
    await expect(toast(page, '已保存修改')).toBeVisible();
    await expect(page.getByText('der Kleiderschrank')).toBeVisible();
    // 双击打开的面板关闭后，焦点落到这个词条的编辑按钮，而不是回到页面开头
    await expect(page.getByRole('button', { name: '编辑“der Kleiderschrank”' })).toBeFocused();

    await page.getByRole('button', { name: '重命名章节“A1”' }).click();
    const rename = page.getByRole('dialog', { name: '重命名章节' });
    await rename.getByRole('textbox', { name: '名称' }).fill('A1 Start');
    await rename.getByRole('button', { name: '保存' }).click();
    await expect(toast(page, '已重命名为“A1 Start”')).toBeVisible();
    // 焦点落到新名称的改名按钮上，键盘用户不会迷失位置
    await expect(page.getByRole('button', { name: '重命名章节“A1 Start”' })).toBeFocused();

    await page.getByRole('button', { name: '改为删除模式' }).click();
    await expect(page.getByRole('paragraph').filter({ hasText: /^删除模式/u })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: '删除“der Tisch”' }).click();
    const confirm = page.getByRole('alertdialog', { name: '删除这个词？' });
    await confirm.getByRole('button', { name: '删除', exact: true }).click();
    const removed = toast(page, '已删除 1 个词');
    await expect(removed).toBeVisible();
    await expect(page.getByText('der Tisch')).toBeHidden();
    await expect(page.getByRole('button', { name: '删除“der Kleiderschrank”' })).toBeFocused();

    await removed.getByRole('button', { name: '撤销' }).click();
    await expect(page.getByText('der Tisch')).toBeVisible();

    await page.getByRole('button', { name: '完成' }).click();
    await expect(page.getByRole('button', { name: '管理' })).toBeFocused();

    await page.reload();
    await expect(chapter(page, 'A1 Start')).toBeVisible();
    await openLesson(page, 'A1 Start', '第1讲');
    await expect(page.getByText('der Kleiderschrank')).toBeVisible();
    await expect(page.getByText('der Tisch')).toBeVisible();
  });

  test('排序：方向键与拖动都能调整章节顺序，刷新后保留', async ({ page }) => {
    await openArchive(page);

    const firstHandle = page.getByRole('button', { name: '调整章节“A1”的位置' });
    await firstHandle.focus();
    await page.keyboard.press('End');
    await expect.poll(() => chapterOrder(page)).toEqual(['A2', 'B1', 'A1']);
    await expect(firstHandle).toBeFocused();

    const handle = page.getByRole('button', { name: '调整章节“B1”的位置' });
    const target = page.getByRole('button', { name: '调整章节“A2”的位置' });
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (from === null || to === null) throw new Error('排序把手不可见');
    const x = from.x + from.width / 2;
    await page.mouse.move(x, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, to.y, { steps: DRAG_STEPS });
    await page.mouse.up();
    await expect.poll(() => chapterOrder(page)).toEqual(['B1', 'A2', 'A1']);

    await page.reload();
    await expect.poll(() => chapterOrder(page)).toEqual(['B1', 'A2', 'A1']);
  });

  test('手机宽度：各模式下内容都不横向溢出', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.compact);
    await openArchive(page);
    await openLesson(page, 'A1', '第1讲');

    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: '管理' }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: '改为删除模式' }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: '完成' }).click();

    await page.getByRole('button', { name: '组合测试' }).click();
    await expect(page.getByRole('button', { name: '开始组合测试' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expectAccessible(page);
  });
});
