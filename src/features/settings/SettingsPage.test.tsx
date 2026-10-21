import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Library } from '../../domain';
import { StorageError, type LibraryStore, type QuarantineRecord } from '../../storage';
import { expectNoAxeViolations } from '../../test/axe';
import { readBlobText, stubDownloads, type DownloadStub } from '../../test/download';
import { makeEntry, TEST_NOW } from '../../test/entries';
import { createTestStore, renderWithProviders } from '../../test/library';
import { ControlledRepository } from '../../test/repositories';
import { ToastRegion } from '../../ui';
import { SettingsPage } from './SettingsPage';

const LIBRARY: Library = {
  pool: [makeEntry({ prompt: '柜子' }), makeEntry({ prompt: '桌子', answers: ['der Tisch'] })],
  archive: [makeEntry({ chapter: 'B1', archivedAt: TEST_NOW.toISOString() })],
  order: [{ chapter: 'B1', lessons: ['第30讲'] }],
};

const QUARANTINE: readonly QuarantineRecord[] = [
  {
    id: 'q1',
    source: 'pool',
    issues: ['answers: too_short'],
    raw: { prompt: '坏' },
    foundAt: '2025-01-15T08:30:00.000Z',
  },
  { id: 'q2', source: 'order', issues: ['type'], raw: 'x', foundAt: '2025-01-15T08:30:00.000Z' },
];

async function renderSettings(repository: ControlledRepository): Promise<LibraryStore> {
  const store = createTestStore(repository);
  await store.load();
  renderWithProviders(
    <>
      <SettingsPage />
      <ToastRegion />
    </>,
    { store, path: '/settings' },
  );
  return store;
}

const prompts = (store: LibraryStore): string[] =>
  store.getState().library.pool.map(({ prompt }) => prompt);

describe('SettingsPage：数据', () => {
  it('显示存储方式、保存状态与词汇数量', async () => {
    await renderSettings(new ControlledRepository({ initial: LIBRARY, kind: 'indexeddb' }));
    expect(screen.getByRole('heading', { level: 1, name: '设置' })).toBeInTheDocument();
    const group = screen.getByRole('region', { name: '数据' });
    expect(within(group).getByText('保存在本机浏览器中')).toBeInTheDocument();
    expect(within(group).getByText('已保存')).toBeInTheDocument();
    expect(within(group).getByText('待测 2 词 · 归档 1 词')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '无法识别的数据' })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('从“数据”打开设备同步（F-070）', async () => {
    const user = userEvent.setup();
    await renderSettings(new ControlledRepository({ initial: LIBRARY, kind: 'indexeddb' }));
    await user.click(screen.getByRole('button', { name: '设备同步…' }));
    expect(await screen.findByRole('dialog', { name: '设备同步' })).toBeInTheDocument();
  });

  it('仅内存存储时说明数据不会保留，不显示保存状态', async () => {
    await renderSettings(new ControlledRepository());
    expect(screen.getByText('仅本次会话，关闭页面后丢失')).toBeInTheDocument();
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  });

  it('保存失败时显示“未保存”并可在此重试', async () => {
    const user = userEvent.setup();
    const repository = new ControlledRepository({ kind: 'indexeddb' });
    const store = await renderSettings(repository);
    repository.failure = new StorageError('quota');
    await act(() => store.update((library) => ({ ...library, pool: [makeEntry()] })));
    const group = screen.getByRole('region', { name: '数据' });
    expect(within(group).getByText('未保存')).toBeInTheDocument();
    repository.failure = null;
    await user.click(within(group).getByRole('button', { name: '重试' }));
    expect(await within(group).findByText('已保存')).toBeInTheDocument();
  });
});

describe('SettingsPage：无法识别的数据', () => {
  let downloads: DownloadStub;

  beforeEach(() => {
    downloads = stubDownloads();
  });

  afterEach(() => {
    downloads.restore();
  });

  it('导出原样 JSON', async () => {
    const user = userEvent.setup();
    await renderSettings(new ControlledRepository({ quarantine: QUARANTINE }));
    const group = screen.getByRole('region', { name: '无法识别的数据' });
    expect(within(group).getByText('2 条记录')).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: '导出为 JSON' }));
    expect(await screen.findByText('已导出')).toBeInTheDocument();
    const [file] = downloads.downloads;
    expect(file?.filename).toMatch(/^german-vocab-trainer-unrecognized-.+\.json$/u);
    const content: unknown = JSON.parse(await readBlobText(file?.blob ?? new Blob()));
    expect(content).toMatchObject({
      kind: 'german-vocab-trainer/unrecognized-data',
      version: 1,
      records: QUARANTINE,
    });
  });

  it('确认后清除，取消则保留', async () => {
    const user = userEvent.setup();
    await renderSettings(new ControlledRepository({ quarantine: QUARANTINE }));
    const group = screen.getByRole('region', { name: '无法识别的数据' });

    await user.click(within(group).getByRole('button', { name: '清除…' }));
    let dialog = await screen.findByRole('alertdialog', { name: '清除无法识别的数据？' });
    // 破坏性操作默认聚焦“取消”
    expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: '无法识别的数据' })).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: '清除…' }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: '清除' }));
    expect(await screen.findByText('已清除无法识别的数据')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '无法识别的数据' })).not.toBeInTheDocument();
  });
});

describe('SettingsPage：快照历史', () => {
  it('没有快照时显示空状态与保留规则', async () => {
    await renderSettings(new ControlledRepository());
    const group = screen.getByRole('region', { name: '快照历史' });
    expect(within(group).getByText('暂无快照')).toBeInTheDocument();
    expect(within(group).getByText(/最多保留最近 20 份/u)).toBeInTheDocument();
  });

  it('恢复快照需要确认，恢复后可以撤销', async () => {
    const user = userEvent.setup();
    const repository = new ControlledRepository({ initial: LIBRARY, kind: 'indexeddb' });
    const store = createTestStore(repository);
    await store.load();
    await store.update((library) => ({ ...library, pool: [makeEntry({ prompt: '新词' })] }), {
      snapshot: 'replace-pool',
    });
    renderWithProviders(
      <>
        <SettingsPage />
        <ToastRegion />
      </>,
      { store },
    );

    const group = screen.getByRole('region', { name: '快照历史' });
    expect(within(group).getByText(/待测 2 词 · 归档 1 词/u)).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: /^恢复“替换待测库前”/u }));
    const dialog = await screen.findByRole('alertdialog', { name: '恢复到此快照？' });
    await user.click(within(dialog).getByRole('button', { name: '恢复' }));

    expect(await screen.findByText('已恢复快照')).toBeInTheDocument();
    expect(prompts(store)).toEqual(['柜子', '桌子']);
    expect(within(group).getByText('恢复快照前')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(await screen.findByText('已撤销恢复')).toBeInTheDocument();
    expect(prompts(store)).toEqual(['新词']);
    // 撤销不再额外保存快照
    expect(store.getState().snapshots.map(({ reason }) => reason)).toEqual([
      'restore',
      'replace-pool',
    ]);
  });
});
