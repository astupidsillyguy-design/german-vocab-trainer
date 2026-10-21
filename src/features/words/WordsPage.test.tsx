import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { replacePool, type Library } from '../../domain';
import type { LibraryStore } from '../../storage';
import { expectNoAxeViolations } from '../../test/axe';
import { makeEntry } from '../../test/entries';
import { createTestStoreWith, renderWithProviders } from '../../test/library';
import { setViewportWidth } from '../../test/viewport';
import { ToastRegion } from '../../ui';
import { POOL_SCOPE } from '../quiz';
import { DRAFT_SAVE_DELAY_MS } from './useWordListDraft';
import { WordsPage } from './WordsPage';

const EMPTY: Library = { pool: [], archive: [], order: [] };

const WITH_POOL: Library = {
  pool: [
    makeEntry({ chapter: 'A1', lesson: 'L1', prompt: '柜子', answers: ['der Schrank'] }),
    makeEntry({ chapter: 'A1', lesson: 'L1', prompt: '帮助', answers: ['helfen'] }),
  ],
  archive: [],
  order: [],
};

function firstEntry() {
  const [entry] = WITH_POOL.pool;
  if (entry === undefined) throw new Error('缺少测试词条');
  return entry;
}

const WITH_POOL_TEXT = '# A1\n\n## L1\nder Schrank 柜子\nhelfen 帮助';

const VALID = ['# A1', '## Lektion 1', 'der Tisch 桌子', 'endlich Adv. 总算'].join('\n');
const WITH_PROBLEM = ['der Tisch 桌子', 'kaputt', 'der Tisch 桌子', 'froh Adj. 高兴的'].join('\n');

async function renderWords(library: Library = EMPTY) {
  const store = createTestStoreWith(library);
  await store.load();
  const result = renderWithProviders(
    <>
      <WordsPage />
      <ToastRegion />
    </>,
    { store, path: '/words' },
  );
  return { ...result, store };
}

const editor = (): HTMLTextAreaElement => screen.getByRole('textbox', { name: '词表' });

async function replaceText(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.clear(editor());
  if (text !== '') {
    await user.click(editor());
    await user.paste(text);
  }
}

const prompts = (store: LibraryStore): string[] =>
  store.getState().library.pool.map(({ prompt }) => prompt);

describe('WordsPage：编辑与预览', () => {
  it('第一次使用：编辑器为空，预览提示如何开始；手机上格式说明默认收起', async () => {
    await renderWords();
    expect(screen.getByRole('heading', { level: 1, name: '词表' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /格式说明/u })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(editor()).toHaveValue('');
    expect(editor()).toHaveAttribute('spellcheck', 'false');
    expect(editor()).toHaveAttribute('autocapitalize', 'none');
    expect(screen.getByText('输入词表后，这里会逐行显示识别结果。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '放弃修改' })).toBeDisabled();
    expect(screen.queryByText('未保存')).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('宽屏第一次使用：格式说明默认展开，开始输入后自动收起', async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    await renderWords();
    const help = screen.getByRole('button', { name: /格式说明/u });
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('冠词 + 单词 + 释义')).toBeVisible();
    await user.type(editor(), 'd');
    expect(help).toHaveAttribute('aria-expanded', 'false');
  });

  it('宽屏：用户手动展开过格式说明时，输入不会把它收起', async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    await renderWords();
    const help = screen.getByRole('button', { name: /格式说明/u });
    await user.click(help);
    await user.click(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    await user.type(editor(), 'd');
    expect(help).toHaveAttribute('aria-expanded', 'true');
  });

  it('已有待测库时显示其词表文本，格式说明默认收起', async () => {
    await renderWords(WITH_POOL);
    expect(editor()).toHaveValue(WITH_POOL_TEXT);
    expect(screen.getByRole('button', { name: /格式说明/u })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('2 个词条 · 1 个章节 · 1 个课时')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'A1 · L1' })).toBeInTheDocument();
  });

  it('逐行预览：词条、未识别的行与重复的行；可以只看有问题的行', async () => {
    const user = userEvent.setup();
    await renderWords();
    await replaceText(user, `${WITH_PROBLEM}\neingezogen einziehen的二分词\n\u00ADeinziehen 搬入`);

    expect(await screen.findByText('4 个词条 · 1 个章节 · 1 个课时')).toBeInTheDocument();
    expect(screen.getByText('1 行未识别')).toBeInTheDocument();
    expect(screen.getByText('1 行重复')).toBeInTheDocument();
    expect(screen.getByText('二分词')).toBeInTheDocument();
    expect(screen.getByText('已修正')).toBeInTheDocument();
    expect(screen.getByText(/去掉了不可见字符/u)).toBeInTheDocument();
    expect(screen.getByText(/变形 eingezogen/u)).toBeInTheDocument();

    const problem = screen.getByRole('button', { name: /kaputt/u });
    expect(problem).toHaveTextContent('缺少释义');
    expect(problem).toHaveTextContent('第 2 行');
    expect(screen.getByRole('button', { name: /与第 1 行重复/u })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '有问题（2）' }));
    const group = screen.getByRole('region', { name: '自定义词库 · 当前词条集' });
    expect(within(group).getAllByRole('listitem')).toHaveLength(2);
    expect(within(group).queryByText('der Tisch')).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('点击有问题的行：在编辑器中选中这一行', async () => {
    const user = userEvent.setup();
    await renderWords();
    await replaceText(user, WITH_PROBLEM);
    await user.click(await screen.findByRole('button', { name: /kaputt/u }));
    expect(editor()).toHaveFocus();
    const start = WITH_PROBLEM.indexOf('kaputt');
    expect([editor().selectionStart, editor().selectionEnd]).toEqual([
      start,
      start + 'kaputt'.length,
    ]);
  });

  it('问题全部改好后自动回到“全部”', async () => {
    const user = userEvent.setup();
    await renderWords();
    await replaceText(user, 'kaputt\nder Tisch 桌子');
    await user.click(await screen.findByRole('radio', { name: '有问题（1）' }));
    await replaceText(user, 'der Tisch 桌子');
    expect(await screen.findByText('所有行都已识别。')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByText('der Tisch')).toBeInTheDocument();
  });
});

describe('WordsPage：保存并测试', () => {
  it('整体替换待测库，跳转到测验，并可在通知中撤销', async () => {
    const user = userEvent.setup();
    const { store, quiz, location } = await renderWords(WITH_POOL);
    await replaceText(user, VALID);
    await user.click(screen.getByRole('button', { name: '保存并测试' }));

    expect(prompts(store)).toEqual(['桌子', '总算 [Adv.]']);
    expect(store.getState().library.pool[0]).toMatchObject({ chapter: 'A1', lesson: 'Lektion 1' });
    expect(location.history.at(-1)).toBe('/quiz');
    // 用新的待测库开始测验
    expect(quiz.getState().session?.questions.map(({ prompt }) => prompt)).toEqual([
      '桌子',
      '总算 [Adv.]',
    ]);
    expect(store.getState().snapshots[0]?.reason).toBe('replace-pool');

    const toast = (await screen.findByText('已保存 2 个词条')).closest('li');
    if (toast === null) throw new Error('找不到通知');
    expect(toast).toHaveTextContent('待测库已替换');
    await user.click(within(toast).getByRole('button', { name: '撤销' }));
    await waitFor(() => {
      expect(prompts(store)).toEqual(['柜子', '帮助']);
    });
    expect(await screen.findByText('已恢复之前的待测库')).toBeInTheDocument();
  });

  it('内容没有变化时直接开始测验，不保存快照；进行中的测验继续', async () => {
    const user = userEvent.setup();
    const { store, quiz, location } = await renderWords(WITH_POOL);
    const pool = store.getState().library.pool;
    quiz.start(pool, POOL_SCOPE);
    quiz.submit('der Schrank');
    const inProgress = quiz.getState().session;
    await user.click(screen.getByRole('button', { name: '保存并测试' }));
    expect(location.history.at(-1)).toBe('/quiz');
    expect(store.getState().library.pool).toBe(pool);
    expect(store.getState().snapshots).toEqual([]);
    expect(quiz.getState().session).toBe(inProgress);
  });

  it('F-068：一个词条都没识别出时提示，并留在本页', async () => {
    const user = userEvent.setup();
    const { store, location } = await renderWords(WITH_POOL);
    await replaceText(user, 'kaputt\n***');
    await user.click(screen.getByRole('button', { name: '保存并测试' }));

    expect(editor()).toHaveAttribute('aria-invalid', 'true');
    expect(editor()).toHaveAccessibleDescription(/请检查格式/u);
    expect(await screen.findByText('未能识别到有效词汇')).toBeInTheDocument();
    expect(editor()).toHaveFocus();
    expect(prompts(store)).toEqual(['柜子', '帮助']);
    expect(location.history.at(-1)).toBe('/words');

    await user.type(editor(), 'x');
    expect(editor()).not.toHaveAttribute('aria-invalid');
  });

  it('部分行未识别时先确认，确认后只保存识别出的词条', async () => {
    const user = userEvent.setup();
    const { store, location } = await renderWords();
    await replaceText(user, WITH_PROBLEM);
    await user.click(screen.getByRole('button', { name: '保存并测试' }));

    const dialog = await screen.findByRole('alertdialog', { name: '有 1 行未能识别' });
    expect(dialog).toHaveTextContent('只会保存识别出的 2 个词条');
    await user.click(within(dialog).getByRole('button', { name: '返回修改' }));
    expect(prompts(store)).toEqual([]);

    await user.click(screen.getByRole('button', { name: '保存并测试' }));
    await user.click(await screen.findByRole('button', { name: '仍然保存' }));
    expect(prompts(store)).toEqual(['桌子', '高兴的 [Adj.]']);
    expect(location.history.at(-1)).toBe('/quiz');
  });

  it('在编辑器中按 Ctrl+Enter 或 ⌘+Enter 保存', async () => {
    const user = userEvent.setup();
    const { store } = await renderWords();
    await replaceText(user, 'der Tisch 桌子');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(prompts(store)).toEqual(['桌子']);

    await replaceText(user, 'helfen 帮助');
    fireEvent.keyDown(editor(), { key: 'Enter', metaKey: true });
    expect(prompts(store)).toEqual(['帮助']);
  });

  it('宽屏显示快捷键提示，手机不显示', async () => {
    setViewportWidth(1280);
    await renderWords();
    expect(editor()).toHaveAccessibleDescription(/按 (⌘|Ctrl \+) Enter 保存/u);
  });
});

describe('WordsPage：草稿', () => {
  it('修改会暂存，刷新（重新挂载）后恢复，并标记为未保存', async () => {
    const user = userEvent.setup();
    const first = await renderWords(WITH_POOL);
    await replaceText(user, VALID);
    expect(screen.getByText('未保存')).toBeInTheDocument();
    await waitFor(
      () => {
        expect(sessionStorage.getItem('gvt.session.draft.word-list')).toContain('der Tisch');
      },
      { timeout: DRAFT_SAVE_DELAY_MS * 3 },
    );
    first.unmount();

    await renderWords(WITH_POOL);
    expect(editor()).toHaveValue(VALID);
    expect(screen.getByText('未保存')).toBeInTheDocument();
  });

  it('离开页面时立即暂存，不必等防抖', async () => {
    const user = userEvent.setup();
    const { unmount } = await renderWords();
    await replaceText(user, 'der Tisch 桌子');
    unmount();
    expect(sessionStorage.getItem('gvt.session.draft.word-list')).toContain('der Tisch');
  });

  it('改回与待测库相同的内容后不再算作修改，草稿被清除', async () => {
    const user = userEvent.setup();
    await renderWords(WITH_POOL);
    await user.type(editor(), 'x');
    expect(screen.getByText('未保存')).toBeInTheDocument();
    await user.type(editor(), '{Backspace}');
    expect(screen.queryByText('未保存')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('gvt.session.draft.word-list')).toBeNull();
  });

  it('保存后清除草稿', async () => {
    const user = userEvent.setup();
    const { unmount } = await renderWords();
    await replaceText(user, 'der Tisch 桌子');
    await user.click(screen.getByRole('button', { name: '保存并测试' }));
    unmount();
    expect(sessionStorage.getItem('gvt.session.draft.word-list')).toBeNull();
  });

  it('放弃修改：确认后恢复为待测库的内容', async () => {
    const user = userEvent.setup();
    await renderWords(WITH_POOL);
    await replaceText(user, VALID);
    await user.click(screen.getByRole('button', { name: '放弃修改' }));
    const dialog = await screen.findByRole('alertdialog', { name: '放弃未保存的修改？' });
    await user.click(within(dialog).getByRole('button', { name: '放弃修改' }));
    expect(editor()).toHaveValue(WITH_POOL_TEXT);
    expect(screen.queryByText('未保存')).not.toBeInTheDocument();
  });

  it('没有修改时跟随待测库的变化（例如其他标签页保存了新词表）', async () => {
    const { store } = await renderWords(WITH_POOL);
    await act(() =>
      store.update((library) => replacePool(library, [{ ...firstEntry(), prompt: '衣柜' }])),
    );
    expect(editor()).toHaveValue('# A1\n\n## L1\nder Schrank 衣柜');
    expect(screen.queryByRole('status', { name: /其他地方/u })).not.toBeInTheDocument();
  });

  it('有修改时待测库变化：提示冲突，可以载入最新内容或保留修改', async () => {
    const user = userEvent.setup();
    const { store } = await renderWords(WITH_POOL);
    await replaceText(user, VALID);
    const update = (prompt: string) =>
      act(() => store.update((library) => replacePool(library, [{ ...firstEntry(), prompt }])));

    await update('衣柜');
    expect(screen.getByText('待测库已在其他地方更新')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保留我的修改' }));
    expect(screen.queryByText('待测库已在其他地方更新')).not.toBeInTheDocument();
    expect(editor()).toHaveValue(VALID);

    await update('大衣柜');
    await user.click(screen.getByRole('button', { name: '载入最新内容' }));
    expect(editor()).toHaveValue('# A1\n\n## L1\nder Schrank 大衣柜');
    expect(screen.queryByText('未保存')).not.toBeInTheDocument();
  });
});
