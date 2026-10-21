import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { LIBRARY_KEY, STORE } from '../../src/storage/constants';
import { expect, expectAccessible, test } from './fixtures';
import { seed } from './seed';

/**
 * 设置（F-026 / F-056 / F-086 / F-096）与旧数据迁移（F-005）：
 * 偏好立即生效并在刷新后保留；纯文本导出；同源自动迁移；导出文件导入；导出工具往返。
 */

const CREATED_AT = '2025-01-15T08:30:00.000Z';
const LESSON = '第30讲: Ein Apartment im Studentenwohnheim';
/** 导出工具在应用同源下的地址（由测试路由提供） */
const EXPORTER_PATH = '/legacy-exporter.html';

/** 原版 localStorage 的键与内容（与原版 HTML 一致）：待测 2 词，归档 1 词，一份接收同步前的备份 */
const LEGACY_STORAGE: Readonly<Record<string, string>> = {
  DE_QUIZ_CUSTOM_VOCAB_V2: JSON.stringify([
    {
      chapter: 'A1',
      lesson: LESSON,
      prompt: '柜子',
      answers: ['der Schrank', 'Schrank'],
      _uid: 'u1',
    },
    { chapter: 'A1', lesson: LESSON, prompt: '帮助', answers: ['helfen'] },
  ]),
  DE_QUIZ_ARCHIVED_VOCAB_V2: JSON.stringify([
    {
      chapter: 'A1',
      lesson: LESSON,
      prompt: '桌子',
      answers: ['der Tisch', 'Tisch'],
      archivedAt: '2025-01-10',
    },
  ]),
  DE_QUIZ_ARCHIVE_ORDER_V1: JSON.stringify({ chapters: ['A1'], lessons: { A1: [LESSON] } }),
  DE_QUIZ_ARCHIVE_BACKUP_V1: JSON.stringify({
    archivedList: [{ chapter: 'A1', lesson: LESSON, prompt: '椅子', answers: ['der Stuhl'] }],
    archiveOrder: { chapters: ['A1'], lessons: { A1: [LESSON] } },
  }),
  DE_QUIZ_ARCHIVE_IMPORTED_A1_33_V1: '1',
};
const LEGACY_COUNTS = '待测 2 词 · 归档 1 词';

function entry(serial: number, prompt: string, answer: string, archivedAt: string | null = null) {
  return {
    id: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    chapter: 'A1',
    lesson: '第30讲',
    prompt,
    answers: [answer],
    verbForm: null,
    linkedForms: [],
    createdAt: CREATED_AT,
    archivedAt,
  };
}

async function openSettings(page: Page): Promise<void> {
  await page.goto('/#/settings');
  await expect(page.getByRole('region', { name: '数据' })).toBeVisible();
}

function writeLegacyStorage(page: Page): Promise<void> {
  return page.evaluate((items) => {
    for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
  }, LEGACY_STORAGE);
}

async function openImportSheet(page: Page) {
  await page.getByRole('button', { name: '导入旧版数据…' }).click();
  const sheet = page.getByRole('dialog', { name: '导入旧版数据' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('设置：偏好', () => {
  test('界面语言立即切换，刷新后保留', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('radio', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectAccessible(page);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
    await page.getByRole('radio', { name: 'Deutsch' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('玻璃效果档位立即生效，刷新后保留', async ({ page }) => {
    await openSettings(page);
    const html = page.locator('html');
    await page.getByRole('radio', { name: '不透明' }).click();
    await expect(html).toHaveAttribute('data-glass-tier', 'opaque');
    await expect(page.getByText(/^当前效果：不透明。/u)).toBeVisible();

    await page.reload();
    await expect(html).toHaveAttribute('data-glass-tier', 'opaque');
    await expect(page.getByRole('radio', { name: '不透明' })).toBeChecked();
    await page.getByRole('radio', { name: '仅模糊' }).click();
    await expect(html).toHaveAttribute('data-glass-tier', 'blur');
  });

  test('关于：显示应用版本', async ({ page }) => {
    await openSettings(page);
    const about = page.getByRole('region', { name: '关于' });
    await expect(about.getByText(/^版本 \d+\.\d+\.\d+/u)).toBeVisible();
  });
});

test.describe('设置：导出纯文本', () => {
  test('按归档排序导出归档库，可以切换到待测库并下载', async ({ page }) => {
    await openSettings(page);
    await seed(page, [
      { store: STORE.library, key: LIBRARY_KEY.pool, value: [entry(1, '帮助', 'helfen')] },
      {
        store: STORE.library,
        key: LIBRARY_KEY.archive,
        value: [entry(2, '桌子', 'der Tisch', CREATED_AT)],
      },
      {
        store: STORE.library,
        key: LIBRARY_KEY.order,
        value: [{ chapter: 'A1', lessons: ['第30讲'] }],
      },
    ]);
    await page.reload();

    await page.getByRole('button', { name: '导出纯文本…' }).click();
    const sheet = page.getByRole('dialog', { name: '导出纯文本' });
    const preview = sheet.getByRole('textbox', { name: '预览' });
    await expect(preview).toHaveValue('# A1\n\n## 第30讲\nder Tisch 桌子');
    await expectAccessible(page);

    await sheet.getByRole('radio', { name: '待测库' }).click();
    await expect(preview).toHaveValue('# A1\n\n## 第30讲\nhelfen 帮助');
    const downloadPromise = page.waitForEvent('download');
    await sheet.getByRole('button', { name: '下载 .txt' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^german-vocab-trainer-pool-.+\.txt$/u);
    expect(await readFile(await download.path(), 'utf8')).toBe('# A1\n\n## 第30讲\nhelfen 帮助');
  });
});

test.describe('旧数据迁移', () => {
  test('同一网址下的原版数据在首次打开时自动迁移，原版数据保持不变', async ({ page }) => {
    await page.goto('/#/settings');
    await writeLegacyStorage(page);
    await page.reload();

    await expect(page.getByText('已迁移旧版数据')).toBeVisible();
    const data = page.getByRole('region', { name: '数据' });
    await expect(data.getByText(LEGACY_COUNTS)).toBeVisible();
    const history = page.getByRole('region', { name: '快照历史' });
    await expect(history.getByText('旧版接收同步前的备份')).toBeVisible();

    await page.reload();
    await expect(data.getByText(LEGACY_COUNTS)).toBeVisible();
    await expect(page.getByText('已迁移旧版数据')).toHaveCount(0);
    await expect(page.getByText('发现旧版数据')).toHaveCount(0);
    const kept = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('DE_QUIZ_')),
    );
    expect(kept.toSorted()).toEqual(Object.keys(LEGACY_STORAGE).toSorted());
  });

  test('词库已有内容时只提示；在设置中选择合并', async ({ page }) => {
    await openSettings(page);
    await seed(page, [
      { store: STORE.library, key: LIBRARY_KEY.pool, value: [entry(1, '你好', 'hallo')] },
    ]);
    await writeLegacyStorage(page);
    await page.reload();

    await expect(page.getByText('发现旧版数据')).toBeVisible();
    await page.getByRole('button', { name: '前往设置' }).click();
    const sheet = await openImportSheet(page);
    await expect(sheet.getByRole('button', { name: '已选择' })).toBeDisabled();
    await expect(sheet.getByRole('radio', { name: '合并' })).toBeChecked();
    await expectAccessible(page);

    await sheet.getByRole('button', { name: '导入', exact: true }).click();
    await expect(page.getByText('新增 待测 2 词 · 归档 1 词')).toBeVisible();
    await expect(
      page.getByRole('region', { name: '数据' }).getByText('待测 3 词 · 归档 1 词'),
    ).toBeVisible();

    await page.getByRole('button', { name: '撤销' }).click();
    await expect(page.getByText('已撤销导入')).toBeVisible();
    await expect(
      page.getByRole('region', { name: '数据' }).getByText('待测 1 词 · 归档 0 词'),
    ).toBeVisible();
  });

  test('导出工具往返：下载工具 → 在原版所在的网址下导出 → 选择文件导入', async ({
    page,
    context,
    baseURL,
  }) => {
    await openSettings(page);
    const sheet = await openImportSheet(page);
    await expect(sheet.getByText('本机的旧版数据')).toHaveCount(0);

    await sheet.getByRole('button', { name: '如何从原版导出数据？' }).click();
    const exporterDownload = page.waitForEvent('download');
    await sheet.getByRole('button', { name: '下载导出工具' }).click();
    const exporterHtml = await readFile(await (await exporterDownload).path(), 'utf8');

    // 模拟用户把导出工具放到原版所在的位置：同一网址下、localStorage 中有原版数据
    const exporterUrl = new URL(EXPORTER_PATH, baseURL).href;
    await context.route(exporterUrl, (route) =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: exporterHtml }),
    );
    const exporter = await context.newPage();
    await exporter.goto(exporterUrl);
    await writeLegacyStorage(exporter);
    await expect(exporter).toHaveTitle('导出德语词汇背记的旧版数据');
    const dataDownload = exporter.waitForEvent('download');
    await exporter.getByRole('button', { name: '导出数据' }).click();
    const exported = await dataDownload;
    expect(exported.suggestedFilename()).toBe('german-vocab-trainer-legacy-data.json');
    await expect(exporter.getByRole('status')).toHaveText(
      /^已导出 5 项数据（待测 2 词，归档 1 词）/u,
    );
    await expectAccessible(exporter);
    await exporter.close();

    await sheet.locator('input[type="file"]').setInputFiles(await exported.path());
    await expect(sheet.getByText('2 词').first()).toBeVisible();
    await sheet.getByRole('button', { name: '导入', exact: true }).click();
    await expect(page.getByText('已导入旧版数据')).toBeVisible();
    await expect(page.getByRole('region', { name: '数据' }).getByText(LEGACY_COUNTS)).toBeVisible();
  });

  test('无效的文件说明原因，不会导入', async ({ page }) => {
    await openSettings(page);
    const sheet = await openImportSheet(page);
    await sheet.locator('input[type="file"]').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"theme":"dark"}'),
    });
    await expect(sheet.getByRole('alert')).toHaveText('这个文件中没有旧版数据。');
    await expect(sheet.getByRole('button', { name: '导入', exact: true })).toBeDisabled();
  });
});
