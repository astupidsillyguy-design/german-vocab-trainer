import type { Page } from '@playwright/test';
import { expect, expectAccessible, test, VIEWPORTS } from './fixtures';

/**
 * 测验页（F-010–F-029）：保存词表后开始；回车提交、再回车下一题（焦点一直在输入框）；
 * 答错时字母级对比；刷新后从当前题继续；空答案轻提示；特殊字符键不抢焦点；
 * 错题浮层键盘可达；重开可撤销；手机布局不溢出。
 */

const ANSWERS: Readonly<Record<string, string>> = {
  柜子: 'der Schrank',
  '总算 [Adv.]': 'endlich',
  女孩: 'das Mädchen',
};

const LIST = [
  '# A1',
  '## Lektion 1',
  'der Schrank 柜子',
  'endlich Adv. 总算',
  'das Mädchen 女孩',
].join('\n');

const LIST_SIZE = Object.keys(ANSWERS).length;

const answerInput = (page: Page) => page.getByRole('textbox', { name: '你的答案' });

/**
 * 保存词表并开始测验。手机上通知在顶部、会盖住导航栏，因此默认关掉它；
 * 关通知会把焦点移到通知上，检查自动聚焦的测试保留通知（宽屏上它在右下角，不挡内容）。
 */
async function startQuiz(page: Page, { dismissNotice = true } = {}): Promise<void> {
  await page.goto('/#/words');
  await page.getByRole('textbox', { name: '词表' }).fill(LIST);
  await page.getByRole('button', { name: '保存并测试' }).click();
  await expect(page).toHaveURL(/#\/quiz$/u);
  await expect(answerInput(page)).toBeVisible();
  if (!dismissNotice) return;
  const notice = page.getByRole('listitem').filter({ hasText: '已保存 3 个词条' });
  await notice.getByRole('button', { name: '关闭通知' }).click();
  await expect(notice).toHaveCount(0);
}

/** 当前题面（输入框的 aria-describedby 指向它） */
async function currentPrompt(page: Page): Promise<string> {
  const id = await answerInput(page).getAttribute('aria-describedby');
  if (id === null) throw new Error('输入框缺少题面说明');
  const text = await page.locator(`[id="${id.split(' ')[0] ?? ''}"]`).textContent();
  return text?.trim() ?? '';
}

async function correctAnswer(page: Page): Promise<string> {
  const prompt = await currentPrompt(page);
  const answer = ANSWERS[prompt];
  if (answer === undefined) throw new Error(`未知题面：${prompt}`);
  return answer;
}

test.describe('测验页', () => {
  test('纯键盘作答：回车提交、回车下一题，焦点一直在输入框；最后查看结果', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.expanded);
    await startQuiz(page, { dismissNotice: false });
    const input = answerInput(page);
    await expect(input).toBeFocused();
    await expect(page.getByRole('progressbar', { name: '本轮进度' })).toHaveAttribute(
      'aria-valuetext',
      '第 1 / 3 题',
    );
    await expectAccessible(page);

    // 第一题故意答错：字母级对比
    const first = await correctAnswer(page);
    await input.pressSequentially(`${first}x`);
    await input.press('Enter');
    await expect(page.getByText('拼写有误')).toBeVisible();
    await expect(page.locator('[data-kind="extra"]').first()).toHaveText('x');
    await expect(page.getByText(`答错了。正确答案：${first}`)).toBeAttached();
    await expect(input).toHaveAttribute('readonly', '');
    await expect(input).toBeFocused();
    await expectAccessible(page);
    await input.press('Enter');

    for (const position of [2, 3]) {
      await expect(page.getByRole('progressbar', { name: '本轮进度' })).toHaveAttribute(
        'aria-valuetext',
        `第 ${String(position)} / 3 题`,
      );
      await expect(input).toHaveValue('');
      await expect(input).toBeFocused();
      await input.pressSequentially(await correctAnswer(page));
      await input.press('Enter');
      await expect(page.getByText('答对啦！')).toBeVisible();
      await input.press('Enter');
    }

    // 结果页：焦点移到结果标题（读屏从这里读起），错题集列出答错的词
    const heading = page.getByRole('heading', { name: '本轮完成' });
    await expect(heading).toBeFocused();
    await expect(page.getByText('2 / 3')).toBeVisible();
    const review = page.getByRole('region', { name: '错题集' });
    await expect(review.getByText(first, { exact: true })).toBeVisible();
    await expect(review.locator('del')).toHaveText(`${first}x`);
    await expectAccessible(page);

    // Tab 进入“重测首轮错词”，回车开始第 2 轮
    await page.keyboard.press('Tab');
    const retest = page.getByRole('button', { name: '重测首轮错词（1 词）' });
    await expect(retest).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/错词重测 · 第 2 轮 · 固定 1 个词/u)).toBeVisible();
    await expect(input).toBeFocused();
    await input.pressSequentially(await correctAnswer(page));
    await input.press('Enter');
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: '全部通关！' })).toBeVisible();
    await expect(
      page.getByText('恭喜！第 1 轮的 1 个错词已在一次重测中全部答对，本单元完全通关。'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '一键归档已通关单元（3 词）' })).toBeVisible();
  });

  test('刷新后从当前题继续', async ({ page }) => {
    await startQuiz(page);
    const input = answerInput(page);
    const prompt = await currentPrompt(page);
    await input.fill(await correctAnswer(page));
    await input.press('Enter');
    await expect(page.getByText('答对啦！')).toBeVisible();

    // 已作答但还没进入下一题：刷新后仍显示反馈
    await page.reload();
    await expect(page.getByText('答对啦！')).toBeVisible();
    expect(await currentPrompt(page)).toBe(prompt);
    await page.getByRole('button', { name: '下一题' }).click();

    await page.reload();
    await expect(page.getByRole('progressbar', { name: '本轮进度' })).toHaveAttribute(
      'aria-valuetext',
      '第 2 / 3 题',
    );
    await expect(page.getByText('答对 1')).toBeVisible();
  });

  test('手机：空答案轻提示；特殊字符键插在光标处且不抢焦点；布局不横向溢出', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.compact);
    await startQuiz(page);
    const input = answerInput(page);
    // 手机上不自动聚焦，避免键盘突然弹出
    await expect(input).not.toBeFocused();

    await page.getByRole('button', { name: '提交核对' }).click();
    await expect(page.getByText('请先输入答案。')).toBeVisible();
    await expect(page.getByText('答错 0')).toBeVisible();

    await input.fill('das Mdchen');
    await input.evaluate((element: HTMLInputElement) => {
      element.setSelectionRange(5, 5);
    });
    await page
      .getByRole('group', { name: '特殊字符' })
      .getByRole('button', { name: 'ä', exact: true })
      .click();
    await expect(input).toHaveValue('das Mädchen');
    await expect(input).toBeFocused();
    expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(6);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectAccessible(page);
  });

  test('错题浮层：键盘打开，Esc 关闭后焦点回到按钮', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.expanded);
    await startQuiz(page);
    const input = answerInput(page);
    await input.fill('der Tisch');
    await input.press('Enter');
    const trigger = page.getByRole('button', { name: '答错 1' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '本轮答错的词' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('der Tisch')).toBeVisible();
    await expect(dialog.getByText(await correctAnswer(page), { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('重开后可以在通知中撤销', async ({ page }) => {
    await startQuiz(page);
    const input = answerInput(page);
    await input.fill(await correctAnswer(page));
    await input.press('Enter');
    await expect(page.getByText('答对 1')).toBeVisible();

    await page.getByRole('button', { name: '重开' }).click();
    await expect(page.getByText('答对 0')).toBeVisible();
    const notice = page.getByRole('listitem').filter({ hasText: '已重新开始' });
    await notice.getByRole('button', { name: '撤销' }).click();
    await expect(page.getByText('答对 1')).toBeVisible();
    await expect(page.getByText('答对啦！')).toBeVisible();
  });

  test('首轮满分：一键归档，通知中撤销；刷新后仍显示已归档，可以去归档页', async ({ page }) => {
    await startQuiz(page);
    const input = answerInput(page);
    for (let position = 0; position < LIST_SIZE; position += 1) {
      await input.fill(await correctAnswer(page));
      await input.press('Enter');
      await input.press('Enter');
    }
    await expect(page.getByRole('heading', { name: '全部通关！' })).toBeVisible();
    await expect(page.getByText('100%')).toBeVisible();
    await expect(page.getByRole('region', { name: '错题集' })).toHaveCount(0);
    await expectAccessible(page);

    const archive = page.getByRole('button', { name: '一键归档已通关单元（3 词）' });
    await archive.click();
    const note = page.getByText('本单元 3 个词已在归档库中。');
    await expect(note).toBeVisible();
    const notice = page.getByRole('listitem').filter({ hasText: '已归档 3 个词' });
    await notice.getByRole('button', { name: '撤销' }).click();
    await expect(page.getByText('已撤销归档')).toBeVisible();
    await expect(archive).toBeVisible();

    // 归档通知在写入存储完成后才出现：等它出现再刷新
    await expect(notice).toHaveCount(0);
    await archive.click();
    await expect(note).toBeVisible();
    await expect(notice).toBeVisible();
    await page.reload();
    await expect(note).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: '查看归档库' }).click();
    await expect(page).toHaveURL(/#\/archive$/u);
  });

  test('待测库为空时引导去词表页', async ({ page }) => {
    await page.goto('/#/quiz');
    await expect(page.getByRole('heading', { name: '还没有待测的词' })).toBeVisible();
    await page.getByRole('button', { name: '去词表页' }).click();
    await expect(page).toHaveURL(/#\/words$/u);
  });
});
