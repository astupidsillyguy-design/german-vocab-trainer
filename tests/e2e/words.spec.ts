import type { Page } from '@playwright/test';
import { expect, expectAccessible, test, VIEWPORTS } from './fixtures';

/**
 * 词表页（F-060–F-068）：粘贴 → 逐行预览 → 保存并测试 → 撤销；草稿跨刷新保留；
 * 点击有问题的行定位到编辑器；纯键盘完成保存。
 */

const LIST = [
  '# A1',
  '## Ein Apartment im Studentenwohnheim',
  'das Apartment (小型、单人居住的)公寓住房',
  'die Musik mst Sg, 音乐',
  '* endlich Adv. 总算，终于',
  'einziehen 搬入',
  'eingezogen einziehen的二分词',
].join('\n');

const editor = (page: Page) => page.getByRole('textbox', { name: '词表' });

/** 关闭通知并等它离场（手机上通知在顶部，会盖住导航栏中的按钮） */
async function dismissNotice(page: Page, text: string): Promise<void> {
  const notice = page.getByRole('listitem').filter({ hasText: text });
  await notice.getByRole('button', { name: '关闭通知' }).click();
  await expect(notice).toHaveCount(0);
}

async function openWords(page: Page): Promise<void> {
  await page.goto('/#/words');
  await expect(editor(page)).toBeVisible();
}

test.describe('词表页', () => {
  test('粘贴词表后逐行预览，保存后开始测验，并可撤销', async ({ page }) => {
    await openWords(page);
    await editor(page).fill(LIST);
    await expect(page.getByText('5 个词条 · 1 个章节 · 1 个课时')).toBeVisible();
    await expect(page.getByText('所有行都已识别。')).toBeVisible();
    const group = page.getByRole('region', { name: 'A1 · Ein Apartment im Studentenwohnheim' });
    await expect(group.getByText('(小型、单人居住的)公寓住房')).toBeVisible();
    await expect(group.getByText('二分词', { exact: true })).toBeVisible();
    await expect(page.getByText('未保存')).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: '保存并测试' }).click();
    await expect(page).toHaveURL(/#\/quiz$/u);
    await expect(page.getByRole('listitem').filter({ hasText: '已保存 5 个词条' })).toBeVisible();
    await dismissNotice(page, '已保存 5 个词条');

    // 刷新后待测库仍在（已写入 IndexedDB）
    await page.goto('/#/words');
    await expect(editor(page)).toHaveValue(/das Apartment \(小型、单人居住的\)公寓住房/u);
    await expect(page.getByText('未保存')).toHaveCount(0);

    await page.getByRole('button', { name: '保存并测试' }).click();
    await expect(page).toHaveURL(/#\/quiz$/u);
  });

  test('通知中的“撤销”恢复之前的待测库', async ({ page }) => {
    await openWords(page);
    await editor(page).fill('der Tisch 桌子\ndas Bett 床');
    await page.getByRole('button', { name: '保存并测试' }).click();
    await dismissNotice(page, '已保存 2 个词条');

    await page.goto('/#/words');
    await editor(page).fill('der Stuhl 椅子');
    await page.getByRole('button', { name: '保存并测试' }).click();
    const notice = page.getByRole('listitem').filter({ hasText: '已保存 1 个词条' });
    await notice.getByRole('button', { name: '撤销' }).click();
    await expect(page.getByText('已恢复之前的待测库')).toBeVisible();

    await page.goto('/#/words');
    await expect(editor(page)).toHaveValue(/der Tisch 桌子/u);
  });

  test('草稿在刷新后保留；放弃修改后恢复为待测库内容', async ({ page }) => {
    await openWords(page);
    await editor(page).fill('der Tisch 桌子\nkaputt');
    await expect(page.getByText('1 行未识别')).toBeVisible();
    // 防抖写入 sessionStorage
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('gvt.session.draft.word-list')))
      .toContain('kaputt');

    await page.reload();
    await expect(editor(page)).toHaveValue('der Tisch 桌子\nkaputt');
    await expect(page.getByText('未保存')).toBeVisible();

    await page.getByRole('button', { name: '放弃修改' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '放弃修改' }).click();
    await expect(editor(page)).toHaveValue('');
    await expect(page.getByText('未保存')).toHaveCount(0);
  });

  test('点击有问题的行：编辑器选中该行并滚到可见位置', async ({ page }) => {
    await openWords(page);
    const lines = Array.from(
      { length: 120 },
      (_, index) => `das Wort${String(index)} 词${String(index)}`,
    );
    lines.splice(100, 0, 'kaputt');
    await editor(page).fill(lines.join('\n'));
    await page.getByRole('radio', { name: '有问题（1）' }).click();
    await page.getByRole('button', { name: /kaputt/u }).click();

    await expect(editor(page)).toBeFocused();
    const state = await editor(page).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return {
        selected: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
        scrollTop: textarea.scrollTop,
      };
    });
    expect(state.selected).toBe('kaputt');
    expect(state.scrollTop).toBeGreaterThan(0);
    await expect(editor(page)).toBeInViewport();
  });

  test('一个词条都没识别出时提示错误，留在本页', async ({ page }) => {
    await openWords(page);
    await editor(page).fill('kaputt\n---');
    await page.getByRole('button', { name: '保存并测试' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '未能识别到有效词汇' })).toBeVisible();
    await expect(editor(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/#\/words$/u);
  });

  test('纯键盘：在编辑器中输入，按 Ctrl+Enter 保存', async ({ page }) => {
    await openWords(page);
    await editor(page).focus();
    await page.keyboard.type('der Tisch 桌子');
    await page.keyboard.press('Control+Enter');
    await expect(page).toHaveURL(/#\/quiz$/u);
  });
});

test.describe('词表页布局', () => {
  test('宽屏：编辑器在左侧并固定在视口内，预览在右侧', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.expanded);
    await openWords(page);
    const many = Array.from({ length: 80 }, (_, index) => `das Wort${String(index)} 词`).join('\n');
    await editor(page).fill(many);
    await expect(page.getByText('80 个词条 · 1 个章节 · 1 个课时')).toBeVisible();

    const editorBox = await editor(page).boundingBox();
    const previewBox = await page.getByRole('region', { name: '预览' }).boundingBox();
    expect(editorBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    if (editorBox === null || previewBox === null) return;
    expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(previewBox.x);

    await page.mouse.wheel(0, 2000);
    await expect(editor(page)).toBeInViewport();
    // 主操作在导航栏中，滚动后仍然可见
    await expect(page.getByRole('button', { name: '保存并测试' })).toBeInViewport();
    await expectAccessible(page);
  });

  test('宽屏第一次使用：格式说明默认展开，粘贴后自动收起，让预览靠近编辑器', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.expanded);
    await openWords(page);
    const help = page.getByRole('button', { name: /格式说明/u });
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await editor(page).fill(LIST);
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('5 个词条 · 1 个章节 · 1 个课时')).toBeInViewport();
  });

  test('手机：单栏，格式说明（默认收起）、编辑器、预览自上而下', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.compact);
    await openWords(page);
    await editor(page).fill(LIST);
    const helpButton = page.getByRole('button', { name: /格式说明/u });
    await expect(helpButton).toHaveAttribute('aria-expanded', 'false');
    const helpBox = await helpButton.boundingBox();
    const editorBox = await editor(page).boundingBox();
    const previewBox = await page.getByRole('region', { name: '预览' }).boundingBox();
    if (helpBox === null || editorBox === null || previewBox === null) throw new Error('缺少元素');
    expect(helpBox.y).toBeLessThan(editorBox.y);
    expect(editorBox.y).toBeLessThan(previewBox.y);
    await expectAccessible(page);
  });
});
