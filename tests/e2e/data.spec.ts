import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { LIBRARY_KEY, STORE } from '../../src/storage/constants';
import { expect, expectAccessible, test } from './fixtures';
import { seed, type SeedRecord } from './seed';

/**
 * 数据底座（F-001 / F-002 / F-007）：直接写入 IndexedDB 模拟旧数据、损坏数据与快照，
 * 验证加载隔离、导出、清除、快照恢复与撤销、空间不足时的提示与重试。
 */

const CREATED_AT = '2025-01-15T08:30:00.000Z';
const SNAPSHOT_ID = '11111111-1111-4111-8111-111111111111';

function entry(serial: number, prompt: string, answer: string) {
  return {
    id: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    chapter: 'A1',
    lesson: '第30讲',
    prompt,
    answers: [answer],
    verbForm: null,
    linkedForms: [],
    createdAt: CREATED_AT,
    archivedAt: null,
  };
}

async function openSettings(page: Page): Promise<void> {
  await page.goto('/#/settings');
  await expect(page.getByRole('region', { name: '数据' })).toBeVisible();
}

const SNAPSHOT_RECORDS: readonly SeedRecord[] = [
  { store: STORE.library, key: LIBRARY_KEY.pool, value: [entry(1, '柜子', 'der Schrank')] },
  {
    store: STORE.snapshots,
    value: {
      id: SNAPSHOT_ID,
      createdAt: CREATED_AT,
      reason: 'replace-pool',
      counts: { pool: 2, archive: 0 },
    },
  },
  {
    store: STORE.snapshotData,
    value: {
      id: SNAPSHOT_ID,
      library: {
        pool: [entry(2, '桌子', 'der Tisch'), entry(3, '椅子', 'der Stuhl')],
        archive: [],
        order: [],
      },
    },
  },
];

test.describe('数据底座', () => {
  test('损坏的数据被隔离：提示、计数、原样导出与清除', async ({ page }) => {
    await openSettings(page);
    await seed(page, [
      {
        store: STORE.library,
        key: LIBRARY_KEY.pool,
        value: [entry(1, '柜子', 'der Schrank'), { broken: true }],
      },
      { store: STORE.library, key: LIBRARY_KEY.order, value: 'not-an-order' },
    ]);
    await page.reload();

    await expect(page.getByText('发现 2 条无法识别的数据')).toBeVisible();
    const data = page.getByRole('region', { name: '数据' });
    await expect(data.getByText('待测 1 词 · 归档 0 词')).toBeVisible();
    const quarantine = page.getByRole('region', { name: '无法识别的数据' });
    await expect(quarantine.getByText('2 条记录')).toBeVisible();
    await expectAccessible(page);

    const downloadPromise = page.waitForEvent('download');
    await quarantine.getByRole('button', { name: '导出为 JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^german-vocab-trainer-unrecognized-.+\.json$/u);
    const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as {
      readonly records: readonly { readonly raw: unknown }[];
    };
    expect(exported.records.map(({ raw }) => raw)).toEqual(
      expect.arrayContaining([{ broken: true }, 'not-an-order']),
    );

    await quarantine.getByRole('button', { name: '清除…' }).click();
    const dialog = page.getByRole('alertdialog', { name: '清除无法识别的数据？' });
    await dialog.getByRole('button', { name: '清除', exact: true }).click();
    await expect(page.getByText('已清除无法识别的数据')).toBeVisible();
    await expect(quarantine).toBeHidden();

    // 清理后的集合已写回：再次加载不会重复隔离
    await page.reload();
    await expect(data.getByText('待测 1 词 · 归档 0 词')).toBeVisible();
    await expect(page.getByRole('region', { name: '无法识别的数据' })).toBeHidden();
    await expect(page.getByText(/无法识别的数据$/u)).toBeHidden();
  });

  test('恢复快照后可以撤销，结果在刷新后保持', async ({ page }) => {
    await openSettings(page);
    await seed(page, SNAPSHOT_RECORDS);
    await page.reload();

    const data = page.getByRole('region', { name: '数据' });
    const history = page.getByRole('region', { name: '快照历史' });
    await expect(data.getByText('待测 1 词 · 归档 0 词')).toBeVisible();

    await history.getByRole('button', { name: /^恢复“替换待测库前”/u }).click();
    await page
      .getByRole('alertdialog', { name: '恢复到此快照？' })
      .getByRole('button', { name: '恢复', exact: true })
      .click();
    await expect(page.getByText('已恢复快照')).toBeVisible();
    await expect(data.getByText('待测 2 词 · 归档 0 词')).toBeVisible();
    await expect(history.getByText('恢复快照前')).toBeVisible();

    await page.getByRole('button', { name: '撤销' }).click();
    await expect(page.getByText('已撤销恢复')).toBeVisible();
    await expect(data.getByText('待测 1 词 · 归档 0 词')).toBeVisible();

    await page.reload();
    await expect(data.getByText('待测 1 词 · 归档 0 词')).toBeVisible();
    await expect(history.getByRole('button', { name: /^恢复/u })).toHaveCount(2);
  });

  test('空间不足：常驻提示与“未保存”状态，重试后保存成功', async ({ page }) => {
    await openSettings(page);
    await seed(page, SNAPSHOT_RECORDS);
    await page.reload();
    const data = page.getByRole('region', { name: '数据' });
    await expect(data.getByText('已保存')).toBeVisible();

    // 模拟浏览器在写入时报告配额不足
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- 以原来的 this 调用
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args) {
        if (Reflect.get(globalThis, '__gvtFailPut') === true) {
          throw new DOMException('quota', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
      Reflect.set(globalThis, '__gvtFailPut', true);
    });

    await page.getByRole('button', { name: /^恢复“替换待测库前”/u }).click();
    await page
      .getByRole('alertdialog', { name: '恢复到此快照？' })
      .getByRole('button', { name: '恢复', exact: true })
      .click();
    await expect(page.getByText('更改未能保存')).toBeVisible();
    await expect(page.getByText(/设备存储空间不足/u)).toBeVisible();
    await expect(data.getByText('未保存')).toBeVisible();
    // 修改仍保留在页面中
    await expect(data.getByText('待测 2 词 · 归档 0 词')).toBeVisible();

    await page.evaluate(() => {
      Reflect.set(globalThis, '__gvtFailPut', false);
    });
    await page.getByRole('region', { name: '通知' }).getByRole('button', { name: '重试' }).click();
    await expect(page.getByText('更改已保存')).toBeVisible();
    await expect(data.getByText('已保存')).toBeVisible();

    await page.reload();
    await expect(data.getByText('待测 2 词 · 归档 0 词')).toBeVisible();
  });
});
