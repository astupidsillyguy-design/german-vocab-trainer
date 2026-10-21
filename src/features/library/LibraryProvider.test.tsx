import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LEGACY_KEYS, type Library } from '../../domain';
import { LibraryStore, StorageError } from '../../storage';
import { makeEntry } from '../../test/entries';
import { seedLegacyStorage } from '../../test/legacy';
import { createTestStore, renderWithProviders, TEST_REVIEW_PATH } from '../../test/library';
import { ControlledRepository } from '../../test/repositories';
import { ToastRegion } from '../../ui';
import { useLibraryState, useLibraryStore } from './context';

function Summary() {
  const state = useLibraryState();
  return (
    <p>
      {state.status} · {state.storage} · {state.library.pool.length}
    </p>
  );
}

function renderApp(store: LibraryStore) {
  return renderWithProviders(
    <>
      <Summary />
      <ToastRegion />
    </>,
    { store },
  );
}

const EXISTING: Library = { pool: [makeEntry()], archive: [], order: [] };

const addEntry = (library: Library): Library => ({
  ...library,
  pool: [...library.pool, makeEntry()],
});

function beforeUnloadIsBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('LibraryProvider', () => {
  it('挂载后加载词库，并在状态变化时重新渲染', async () => {
    const store = createTestStore();
    renderApp(store);
    expect(await screen.findByText('ready · memory · 0')).toBeInTheDocument();
    await act(() => store.update(addEntry));
    expect(screen.getByText('ready · memory · 1')).toBeInTheDocument();
  });

  it('保存失败：常驻通知说明原因并可重试；成功后提示已保存', async () => {
    const user = userEvent.setup();
    const repository = new ControlledRepository({ kind: 'indexeddb' });
    const store = createTestStore(repository);
    renderApp(store);
    await screen.findByText('ready · indexeddb · 0');

    repository.failure = new StorageError('quota');
    await act(() => store.update(addEntry));
    expect(await screen.findByText('更改未能保存')).toBeInTheDocument();
    expect(screen.getByText(/设备存储空间不足/u)).toBeInTheDocument();
    expect(beforeUnloadIsBlocked()).toBe(true);

    repository.failure = null;
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('更改已保存')).toBeInTheDocument();
    expect(screen.queryByText('更改未能保存')).not.toBeInTheDocument();
    expect(beforeUnloadIsBlocked()).toBe(false);
  });

  it('连续失败只保留一条失败通知', async () => {
    const repository = new ControlledRepository({ kind: 'indexeddb' });
    repository.failure = new StorageError('unknown');
    const store = createTestStore(repository);
    renderApp(store);
    await screen.findByText(/ready/u);
    await act(() => store.update(addEntry));
    await act(() => store.update(addEntry));
    await waitFor(() => {
      expect(screen.getAllByText('更改未能保存')).toHaveLength(1);
    });
  });

  it('存储不可用：提示更改只保留到关闭页面', async () => {
    const store = new LibraryStore({
      openRepository: () => Promise.reject(new DOMException('denied', 'SecurityError')),
    });
    renderApp(store);
    expect(await screen.findByText('无法使用本地存储')).toBeInTheDocument();
    expect(screen.getByText(/浏览器不允许本站保存数据/u)).toBeInTheDocument();
    expect(screen.getByText('ready · memory · 0')).toBeInTheDocument();
  });

  it('发现无法识别的数据：通知中的“查看”跳到设置页', async () => {
    const user = userEvent.setup();
    const repository = new ControlledRepository({
      quarantine: [
        { id: 'q1', source: 'pool', issues: ['type'], raw: 1, foundAt: '2025-01-15T08:30:00Z' },
      ],
    });
    const { location } = renderApp(createTestStore(repository));
    expect(await screen.findByText('发现 1 条无法识别的数据')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看' }));
    expect(location.history.at(-1)).toBe(TEST_REVIEW_PATH);
  });

  it('同一网址下有旧版数据且词库为空：启动时自动迁移并告知结果', async () => {
    seedLegacyStorage();
    const store = createTestStore();
    renderApp(store);
    expect(await screen.findByText('已迁移旧版数据')).toBeInTheDocument();
    expect(screen.getByText('待测 2 词 · 归档 1 词')).toBeInTheDocument();
    expect(screen.getByText('ready · memory · 2')).toBeInTheDocument();
    // 原版的数据保持不变
    expect(localStorage.getItem(LEGACY_KEYS.pool)).not.toBeNull();
  });

  it('词库已有内容时不自动迁移，通知中的“前往设置”跳到设置页', async () => {
    const user = userEvent.setup();
    seedLegacyStorage();
    const store = createTestStore(new ControlledRepository({ initial: EXISTING }));
    const { location } = renderApp(store);
    expect(await screen.findByText('发现旧版数据')).toBeInTheDocument();
    expect(screen.getByText('ready · memory · 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '前往设置' }));
    expect(location.history.at(-1)).toBe(TEST_REVIEW_PATH);
  });

  it('在 Provider 之外使用时给出明确错误', () => {
    function Orphan() {
      useLibraryStore();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/LibraryProvider/u);
  });
});
