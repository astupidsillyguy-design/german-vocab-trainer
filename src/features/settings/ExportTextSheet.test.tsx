import { screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatWordList, type Library } from '../../domain';
import { expectNoAxeViolations } from '../../test/axe';
import { readBlobText, stubDownloads, type DownloadStub } from '../../test/download';
import { makeEntry, TEST_NOW } from '../../test/entries';
import { createTestStore, renderWithProviders } from '../../test/library';
import { ControlledRepository } from '../../test/repositories';
import { ToastRegion } from '../../ui';
import { SettingsPage } from './SettingsPage';
import { wordListFileName } from './ExportTextSheet';

const ARCHIVED_AT = TEST_NOW.toISOString();
const LIBRARY: Library = {
  pool: [makeEntry({ prompt: '帮助', answers: ['helfen'] })],
  archive: [
    makeEntry({
      chapter: 'B1',
      lesson: '第2讲',
      prompt: '桌子',
      answers: ['der Tisch'],
      archivedAt: ARCHIVED_AT,
    }),
    makeEntry({ chapter: 'A1', lesson: '第1讲', prompt: '柜子', archivedAt: ARCHIVED_AT }),
  ],
  // 归档排序：B1 在 A1 之前
  order: [
    { chapter: 'B1', lessons: ['第2讲'] },
    { chapter: 'A1', lessons: ['第1讲'] },
  ],
};

async function openExport(library: Library): Promise<{ user: UserEvent; sheet: HTMLElement }> {
  const user = userEvent.setup();
  const store = createTestStore(new ControlledRepository({ initial: library }));
  await store.load();
  renderWithProviders(
    <>
      <SettingsPage />
      <ToastRegion />
    </>,
    { store, path: '/settings' },
  );
  await user.click(screen.getByRole('button', { name: '导出纯文本…' }));
  return { user, sheet: await screen.findByRole('dialog', { name: '导出纯文本' }) };
}

const preview = (sheet: HTMLElement): HTMLElement =>
  within(sheet).getByRole('textbox', { name: '预览' });

describe('ExportTextSheet（F-056）', () => {
  let downloads: DownloadStub;
  beforeEach(() => {
    downloads = stubDownloads();
  });
  afterEach(() => {
    downloads.restore();
  });

  it('默认导出归档库，按归档排序；可以切换到待测库', async () => {
    const { user, sheet } = await openExport(LIBRARY);
    expect(within(sheet).getByRole('radio', { name: '归档库' })).toBeChecked();
    expect(preview(sheet)).toHaveValue(formatWordList(LIBRARY.archive, LIBRARY.order));
    expect(preview(sheet)).toHaveAttribute('readonly');
    expect(within(sheet).getByText('共 2 词')).toBeInTheDocument();
    const text = (preview(sheet) as HTMLTextAreaElement).value;
    expect(text.indexOf('桌子')).toBeLessThan(text.indexOf('柜子'));

    await user.click(within(sheet).getByRole('radio', { name: '待测库' }));
    expect(preview(sheet)).toHaveValue(formatWordList(LIBRARY.pool));
    expect(within(sheet).getByText('共 1 词')).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('下载 .txt：内容与预览相同，文件名带词库与时间', async () => {
    const { user, sheet } = await openExport(LIBRARY);
    await user.click(within(sheet).getByRole('radio', { name: '待测库' }));
    await user.click(within(sheet).getByRole('button', { name: '下载 .txt' }));
    expect(downloads.downloads).toHaveLength(1);
    const [download] = downloads.downloads;
    expect(download?.filename).toMatch(/^german-vocab-trainer-pool-.+\.txt$/u);
    expect(download?.blob.type).toBe('text/plain;charset=utf-8');
    expect(await readBlobText(download?.blob ?? new Blob())).toBe(formatWordList(LIBRARY.pool));
    expect(await screen.findByText('已开始下载')).toBeInTheDocument();
  });

  it('复制到剪贴板；失败时提示手动复制', async () => {
    const { user, sheet } = await openExport(LIBRARY);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(within(sheet).getByRole('button', { name: '复制' }));
    expect(writeText).toHaveBeenCalledWith(formatWordList(LIBRARY.archive, LIBRARY.order));
    expect(await screen.findByText('已复制到剪贴板')).toBeInTheDocument();

    writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    await user.click(within(sheet).getByRole('button', { name: '复制' }));
    expect(await screen.findByText('无法复制，请手动选择文本后复制')).toBeInTheDocument();
  });

  it('词库为空时说明原因并禁用复制与下载', async () => {
    const { sheet } = await openExport({ ...LIBRARY, archive: [], order: [] });
    expect(within(sheet).getByText('归档库中还没有词。')).toBeInTheDocument();
    expect(within(sheet).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '复制' })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: '下载 .txt' })).toBeDisabled();
  });

  it('文件名包含词库与导出时间', () => {
    expect(wordListFileName('archive', TEST_NOW)).toBe(
      'german-vocab-trainer-archive-2025-01-15T08-30-00Z.txt',
    );
  });
});
