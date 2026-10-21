import type { Page } from '@playwright/test';
import { DB_NAME } from '../../src/storage/constants';

export interface SeedRecord {
  readonly store: string;
  readonly key?: string;
  readonly value: unknown;
}

/** 在页面中直接写入 IndexedDB（应用已创建数据库，这里不触发升级） */
export async function seed(page: Page, records: readonly SeedRecord[]): Promise<void> {
  await page.evaluate(
    async ({ name, records: items }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(new Error(request.error?.message ?? 'open failed'));
        };
      });
      const stores = [...new Set(items.map((item) => item.store))];
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(stores, 'readwrite');
        for (const item of items) {
          const store = transaction.objectStore(item.store);
          if (item.key === undefined) store.put(item.value);
          else store.put(item.value, item.key);
        }
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(new Error(transaction.error?.message ?? 'write failed'));
        };
      });
      database.close();
    },
    { name: DB_NAME, records },
  );
}
