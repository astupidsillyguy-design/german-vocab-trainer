import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_LIBRARY, type Library } from '../../domain';
import type { LibraryStore } from '../../storage';
import { expectNoAxeViolations } from '../../test/axe';
import { readBlobText, stubDownloads, type DownloadStub } from '../../test/download';
import { makeEntry } from '../../test/entries';
import { LEGACY_SCHRANK, legacyExportFile, seedLegacyStorage } from '../../test/legacy';
import { createTestStore, renderWithProviders } from '../../test/library';
import { ControlledRepository } from '../../test/repositories';
import { ToastRegion } from '../../ui';
import { LEGACY_EXPORTER_FILE_NAME, legacyConsoleSnippet } from './legacyExporter';
import { LEGACY_FILE_MAX_BYTES } from './LegacyImportSheet';
import { SettingsPage } from './SettingsPage';

/** 现有词库：柜子与旧版待测库中的同一个词重复 */
const CURRENT: Library = {
  pool: [makeEntry({ chapter: 'A1', lesson: LEGACY_SCHRANK.lesson, prompt: '柜子' })],
  archive: [],
  order: [],
};

interface Rendered {
  readonly user: UserEvent;
  readonly store: LibraryStore;
  readonly sheet: HTMLElement;
}

async function openImport(library: Library): Promise<Rendered> {
  const user = userEvent.setup();
  const store = createTestStore(new ControlledRepository({ initial: library, kind: 'indexeddb' }));
  await store.load();
  renderWithProviders(
    <>
      <SettingsPage />
      <ToastRegion />
    </>,
    { store, path: '/settings' },
  );
  await user.click(screen.getByRole('button', { name: '导入旧版数据…' }));
  return { user, store, sheet: await screen.findByRole('dialog', { name: '导入旧版数据' }) };
}

const prompts = (entries: Library['pool']): string[] => entries.map(({ prompt }) => prompt);
const importButton = (sheet: HTMLElement): HTMLElement =>
  within(sheet).getByRole('button', { name: '导入' });

function fileInput(sheet: HTMLElement): HTMLInputElement {
  const input = sheet.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('找不到文件选择控件');
  return input;
}

const jsonFile = (content: string, name = 'legacy.json'): File =>
  new File([content], name, { type: 'application/json' });

/** 预览分组中某一行的数值 */
function previewValue(sheet: HTMLElement, title: string): string {
  const group = within(sheet).getByRole('region', { name: '预览' });
  const row = within(group).getByText(title).closest('li');
  return row?.textContent.replace(title, '') ?? '';
}

describe('LegacyImportSheet：本机的旧版数据（F-005）', () => {
  beforeEach(() => {
    seedLegacyStorage();
  });

  it('词库已有内容时不自动导入，打开后预选本机数据并预览', async () => {
    const { sheet } = await openImport(CURRENT);
    expect(await screen.findByText('发现旧版数据')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '已选择' })).toBeDisabled();
    expect(previewValue(sheet, '待测库')).toBe('2 词');
    expect(previewValue(sheet, '归档库')).toBe('1 词 · 1 个章节');
    expect(previewValue(sheet, '接收同步前的备份')).toBe('2 词');
    expect(within(sheet).getByText(/个名词去掉了不带冠词的答案/u)).toBeInTheDocument();
    expect(within(sheet).getByRole('radio', { name: '合并' })).toBeChecked();
    expect(importButton(sheet)).toBeEnabled();
    await expectNoAxeViolations();
  });

  it('合并：跳过已有的词，备份进入快照历史，可以撤销', async () => {
    const { user, store, sheet } = await openImport(CURRENT);
    await user.click(importButton(sheet));
    expect(await screen.findByText('已导入旧版数据')).toBeInTheDocument();
    expect(screen.getByText('新增 待测 1 词 · 归档 1 词，跳过 1 个已有的词')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '导入旧版数据' })).not.toBeInTheDocument();
    });
    const { library } = store.getState();
    expect(prompts(library.pool)).toEqual(['柜子', '帮助']);
    expect(prompts(library.archive)).toEqual(['桌子']);
    const history = screen.getByRole('region', { name: '快照历史' });
    expect(within(history).getByText('旧版接收同步前的备份')).toBeInTheDocument();
    expect(within(history).getByText('导入数据前')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(await screen.findByText('已撤销导入')).toBeInTheDocument();
    expect(prompts(store.getState().library.pool)).toEqual(['柜子']);
    expect(store.getState().library.archive).toEqual([]);
  });

  it('替换：用旧版数据替换现有词库', async () => {
    const { user, store, sheet } = await openImport(CURRENT);
    await user.click(within(sheet).getByRole('radio', { name: '替换' }));
    expect(within(sheet).getByText(/用旧版数据替换现有的待测库与归档库/u)).toBeInTheDocument();
    await user.click(importButton(sheet));
    expect(await screen.findByText('新增 待测 2 词 · 归档 1 词')).toBeInTheDocument();
    const { library } = store.getState();
    expect(prompts(library.pool)).toEqual(['柜子', '帮助']);
    expect(library.pool[0]?.id).not.toBe(CURRENT.pool[0]?.id);
    expect(library.order).toEqual([{ chapter: 'A1', lessons: [LEGACY_SCHRANK.lesson] }]);
  });
});

describe('LegacyImportSheet：导出文件', () => {
  it('没有本机数据时只能选择文件；导入到空词库不需要撤销', async () => {
    const { user, store, sheet } = await openImport(EMPTY_LIBRARY);
    expect(within(sheet).queryByText('本机的旧版数据')).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('region', { name: '预览' })).not.toBeInTheDocument();
    expect(importButton(sheet)).toBeDisabled();

    await user.upload(fileInput(sheet), jsonFile(legacyExportFile()));
    expect(await within(sheet).findByText('已选择：legacy.json')).toBeInTheDocument();
    expect(previewValue(sheet, '待测库')).toBe('2 词');
    expect(within(sheet).queryByRole('radiogroup', { name: '导入方式' })).not.toBeInTheDocument();

    await user.click(importButton(sheet));
    expect(await screen.findByText('新增 待测 2 词 · 归档 1 词')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '撤销' })).not.toBeInTheDocument();
    expect(prompts(store.getState().library.pool)).toEqual(['柜子', '帮助']);
    expect(store.getState().snapshots.map(({ reason }) => reason)).toEqual(['legacy-backup']);
  });

  it('文件无效时说明原因，选择有效文件后恢复', async () => {
    const { user, sheet } = await openImport(EMPTY_LIBRARY);
    await user.upload(fileInput(sheet), jsonFile('{坏', 'broken.json'));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('这个文件不是有效的 JSON。');
    expect(importButton(sheet)).toBeDisabled();

    await user.upload(fileInput(sheet), jsonFile('{"theme":"dark"}', 'other.json'));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('这个文件中没有旧版数据。');

    const huge = jsonFile('{}', 'huge.json');
    Object.defineProperty(huge, 'size', { value: LEGACY_FILE_MAX_BYTES + 1 });
    await user.upload(fileInput(sheet), huge);
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      '这个文件太大，不是旧版导出的数据。',
    );

    await user.upload(fileInput(sheet), jsonFile(legacyExportFile()));
    expect(await within(sheet).findByText('已选择：legacy.json')).toBeInTheDocument();
    expect(within(sheet).queryByRole('alert')).not.toBeInTheDocument();
    expect(importButton(sheet)).toBeEnabled();
  });

  it('选择文件后仍可切换回本机数据', async () => {
    seedLegacyStorage({ pool: [LEGACY_SCHRANK] });
    const { user, sheet } = await openImport(CURRENT);
    await user.upload(fileInput(sheet), jsonFile(legacyExportFile()));
    expect(await within(sheet).findByText('已选择：legacy.json')).toBeInTheDocument();
    expect(previewValue(sheet, '待测库')).toBe('2 词');
    await user.click(within(sheet).getByRole('button', { name: '使用' }));
    expect(previewValue(sheet, '待测库')).toBe('1 词');
    expect(within(sheet).queryByText('已选择：legacy.json')).not.toBeInTheDocument();
  });
});

describe('LegacyImportSheet：从原版导出', () => {
  let downloads: DownloadStub;
  beforeEach(() => {
    downloads = stubDownloads();
  });
  afterEach(() => {
    downloads.restore();
  });

  it('下载导出工具、复制控制台代码', async () => {
    const { user, sheet } = await openImport(EMPTY_LIBRARY);
    await user.click(within(sheet).getByRole('button', { name: '如何从原版导出数据？' }));
    await user.click(within(sheet).getByRole('button', { name: '下载导出工具' }));
    const [download] = downloads.downloads;
    expect(download?.filename).toBe(LEGACY_EXPORTER_FILE_NAME);
    expect(download?.blob.type).toBe('text/html;charset=utf-8');
    const html = await readBlobText(download?.blob ?? new Blob());
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('导出德语词汇背记的旧版数据');

    const snippet = legacyConsoleSnippet();
    expect(within(sheet).getByRole('textbox', { name: '控制台代码' })).toHaveValue(snippet);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(within(sheet).getByRole('button', { name: '复制代码' }));
    expect(writeText).toHaveBeenCalledWith(snippet);
    expect(await screen.findByText('已复制代码')).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
