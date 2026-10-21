import type { Locator, Page } from '@playwright/test';
import { LIBRARY_KEY, STORE } from '../../src/storage/constants';
import { expect, expectAccessible, test } from './fixtures';
import { seed } from './seed';
import { createSyncDevices, type SyncDevices } from './syncRelay';

/**
 * 设备同步（F-070 – F-081）：两台设备（两个独立的浏览器上下文）通过真实的 WebRTC 直连，
 * 配对、推送、预览确认、写入与撤销、拒绝、按课时同步与断开。
 */

const ARCHIVED_AT = '2025-03-02T08:30:00.000Z';
/** 建立 WebRTC 直连（收集候选地址、握手）：Firefox、WebKit 与较慢的机器上可能需要十几秒 */
const CONNECT_TIMEOUT_MS = 30_000;
/** 总预算还要覆盖两台设备的加载、播种、无障碍检查与收发操作，不能与握手预算相同。 */
const SYNC_TEST_TIMEOUT_MS = 60_000;

function archived(serial: number, lesson: string, prompt: string, answer: string) {
  return {
    id: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    chapter: 'A1',
    lesson,
    prompt,
    answers: [answer],
    verbForm: null,
    linkedForms: [],
    createdAt: ARCHIVED_AT,
    archivedAt: ARCHIVED_AT,
  };
}

/** 接收方（第一台设备）原有的归档库 */
const RECEIVER_ARCHIVE = [
  archived(1, '第1讲', '柜子', 'der Schrank'),
  archived(2, '第1讲', '桌子', 'der Tisch'),
];

/** 发送方（第二台设备）的归档库 */
const SENDER_ARCHIVE = [
  archived(11, '第1讲', '猫', 'die Katze'),
  archived(12, '第1讲', '狗', 'der Hund'),
  archived(13, '第1讲', '鸟', 'der Vogel'),
  archived(14, '第2讲', '工作', 'die Arbeit'),
  archived(15, '第2讲', '学习', 'das Lernen'),
];

async function openArchive(page: Page, archive: readonly unknown[]): Promise<void> {
  await page.goto('/#/archive');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('归档');
  await seed(page, [{ store: STORE.library, key: LIBRARY_KEY.archive, value: archive }]);
  await page.reload();
  await expect(archiveStats(page, archive.length)).toBeVisible();
}

function archiveStats(page: Page, entries: number): Locator {
  return page.getByRole('status').filter({ hasText: `共 ${String(entries)} 个归档词汇` });
}

async function openSync(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '设备同步', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '设备同步' });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** 两台设备打开同步面板并完成配对：第一台接收，第二台输入第一台的配对码 */
async function pair(devices: SyncDevices): Promise<{ receiver: Locator; sender: Locator }> {
  await openArchive(devices.first, RECEIVER_ARCHIVE);
  await openArchive(devices.second, SENDER_ARCHIVE);

  const receiver = await openSync(devices.first);
  await receiver.getByRole('button', { name: /从其他设备接收/u }).click();
  const codeLabel = receiver.getByRole('img', { name: /本机配对码/u });
  await expect(codeLabel).toBeVisible();
  const code = ((await codeLabel.getAttribute('aria-label')) ?? '').replace(/\D/gu, '');
  expect(code).toMatch(/^\d{6}$/u);

  const sender = await openSync(devices.second);
  await sender.getByRole('button', { name: /发送到其他设备/u }).click();
  const field = sender.getByRole('textbox', { name: '对方的配对码' });
  await expect(field).toBeEnabled();
  await field.fill(code);
  await sender.getByRole('button', { name: '连接' }).click();

  await expect(receiver.getByText(/^已连接到 /u)).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });
  await expect(sender.getByText(/^已连接到 /u)).toBeVisible();
  return { receiver, sender };
}

test.describe('设备同步', () => {
  test.describe.configure({ timeout: SYNC_TEST_TIMEOUT_MS });
  let devices: SyncDevices;

  test.beforeEach(async ({ browser, page }) => {
    devices = await createSyncDevices(browser, page);
  });

  test.afterEach(async () => {
    await devices.close();
    expect(devices.secondErrors, '第二台设备不应有控制台错误').toEqual([]);
  });

  test('推送整个归档库：预览后接收，关闭面板后仍可撤销', async () => {
    const { receiver, sender } = await pair(devices);
    await expectAccessible(devices.first);

    await sender.getByRole('button', { name: '推送 5 个词' }).click();
    await expect(receiver.getByText('收到 5 个词 · 2 个课时')).toBeVisible();
    await expect(receiver.getByText('新课时 · 2 词')).toBeVisible();
    await expect(sender.getByText('已送达，等待对方确认…')).toBeVisible();
    await expectAccessible(devices.first);

    await receiver.getByRole('button', { name: '接收并覆盖' }).click();
    await expect(receiver.getByText('已接收 5 个词')).toBeVisible();
    await expect(sender.getByText('对方已接收 5 个词')).toBeVisible();

    // 关闭面板即断开：对方得知，本机归档库已是对方的内容
    await devices.first.keyboard.press('Escape');
    await expect(receiver).toBeHidden();
    await expect(sender.getByText('对方已断开连接')).toBeVisible();
    await expect(archiveStats(devices.first, SENDER_ARCHIVE.length)).toBeVisible();

    const toast = devices.first.getByRole('listitem').filter({ hasText: '已接收 5 个词' });
    await toast.getByRole('button', { name: '撤销' }).click();
    await expect(archiveStats(devices.first, RECEIVER_ARCHIVE.length)).toBeVisible();
    // 发送方的词库不受影响
    await devices.second.keyboard.press('Escape');
    await expect(archiveStats(devices.second, SENDER_ARCHIVE.length)).toBeVisible();
  });

  test('按课时推送；接收方拒绝后词库不变', async () => {
    const { receiver, sender } = await pair(devices);

    await sender.getByRole('radio', { name: '按课时' }).check();
    // React Aria 的复选框：可见的是 label，原生 input 只用于无障碍
    await sender
      .locator('label')
      // has 中的定位器相对 label 查找，因此从页面而不是面板开始写
      .filter({ has: devices.second.getByRole('checkbox', { name: /^第2讲/u }) })
      .click();
    await expect(sender.getByRole('checkbox', { name: /^第2讲/u })).toBeChecked();
    await expect(sender.getByText('已选 1 个课时 · 2 个词')).toBeVisible();
    await expectAccessible(devices.second);
    await sender.getByRole('button', { name: '推送 2 个词' }).click();

    await expect(receiver.getByText('覆盖所选课时')).toBeVisible();
    await expect(receiver.getByText('收到 2 个词 · 1 个课时')).toBeVisible();
    await receiver.getByRole('button', { name: '拒绝' }).click();
    await expect(receiver.getByText('已拒绝这次同步')).toBeVisible();
    await expect(sender.getByText('对方拒绝了这次同步')).toBeVisible();

    await sender.getByRole('button', { name: '断开连接' }).click();
    await expect(receiver.getByText('对方已断开连接')).toBeVisible();
    await devices.first.keyboard.press('Escape');
    await expect(archiveStats(devices.first, RECEIVER_ARCHIVE.length)).toBeVisible();
  });
});
