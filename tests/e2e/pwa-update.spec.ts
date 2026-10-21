import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createStaticServer } from '../../scripts/static-server.ts';
import { expect, test } from './fixtures';

const UPDATE_TIMEOUT_MS = 60_000;

/** 两个真正的 Service Worker 版本：验证等待、用户确认、刷新与旧缓存清理。 */
test('子目录部署：新版本等待确认；刷新后换用新页面并清理旧缓存', async ({ page }) => {
  test.setTimeout(UPDATE_TIMEOUT_MS);
  const siteRoot = await mkdtemp(join(tmpdir(), 'gvt-pwa-update-'));
  const root = join(siteRoot, 'course', 'app');
  await mkdir(root, { recursive: true });
  await cp(resolve('dist'), root, { recursive: true });
  const server = createStaticServer(siteRoot);
  await new Promise<void>((done) => {
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('静态服务器没有端口');
  const url = `http://127.0.0.1:${String(address.port)}/course/app/#/quiz`;

  try {
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '测验' })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe(
      new URL('./', url).href,
    );
    const originalCaches = await page.evaluate(() => caches.keys());
    expect(originalCaches).toHaveLength(1);

    const html = await readFile(join(root, 'index.html'), 'utf8');
    await writeFile(
      join(root, 'index.html'),
      html.replace('</head>', '<meta name="test-build" content="next"></head>'),
    );
    const worker = await readFile(join(root, 'sw.js'), 'utf8');
    const nextWorker = worker.replace(/"version":"([^"]+)"/u, '"version":"$1-next"');
    expect(nextWorker).not.toBe(worker);
    await writeFile(join(root, 'sw.js'), nextWorker);

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await expect(page.getByText('有新版本可用', { exact: true })).toBeVisible();
    // 安装完成也不能擅自刷新当前页面。
    await expect(page.locator('meta[name="test-build"]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => caches.keys())).toHaveLength(2);

    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(page.locator('meta[name="test-build"]')).toHaveAttribute('content', 'next');
    await expect(page.getByRole('heading', { level: 1, name: '测验' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual([`${originalCaches[0] ?? ''}-next`]);
  } finally {
    await page.close();
    server.closeAllConnections();
    await new Promise<void>((done, reject) => {
      server.close((error) => {
        if (error === undefined) done();
        else reject(error);
      });
    });
    await rm(siteRoot, { recursive: true, force: true });
  }
});
