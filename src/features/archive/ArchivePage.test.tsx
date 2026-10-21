import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gesture } from '../../design/tokens';
import { EMPTY_LIBRARY, type Entry, type Library } from '../../domain';
import { expectNoAxeViolations } from '../../test/axe';
import { makeEntry, TEST_NOW, testId } from '../../test/entries';
import { createTestStore, renderWithProviders } from '../../test/library';
import { MemoryRepository } from '../../storage';
import { ToastRegion } from '../../ui';
import { QuizStore } from '../quiz';
import { ArchivePage } from './ArchivePage';

/** 不打乱：出题顺序即词表顺序 */
const KEEP_ORDER = (): number => 1 - Number.EPSILON;
const ARCHIVED_AT = TEST_NOW.toISOString();
/** 读屏播报区会延迟写入同一句话；查找横幅时排除它 */
const SKIP_ANNOUNCER = { ignore: '[data-announcer], script, style' };

function archived(serial: number, chapter: string, lesson: string, prompt: string, answer: string) {
  return makeEntry({
    id: testId(serial),
    chapter,
    lesson,
    prompt,
    answers: [answer],
    archivedAt: ARCHIVED_AT,
  });
}

const SCHRANK = archived(1, 'A1', '第1讲', '柜子', 'der Schrank');
const TISCH = archived(2, 'A1', '第1讲', '桌子', 'der Tisch');
const KATZE = archived(3, 'A1', '第2讲', '猫', 'die Katze');
const ARBEIT = archived(4, 'A2', '第5讲', '工作', 'die Arbeit');
const ARCHIVE: readonly Entry[] = [SCHRANK, TISCH, KATZE, ARBEIT];
const LIBRARY: Library = { ...EMPTY_LIBRARY, archive: ARCHIVE };

async function renderArchive(library: Library = LIBRARY) {
  const repository = new MemoryRepository(library);
  const store = createTestStore(repository);
  await store.load();
  const quiz = new QuizStore({ library: store, random: KEEP_ORDER });
  const user = userEvent.setup();
  const result = renderWithProviders(
    <>
      <ArchivePage />
      <ToastRegion />
    </>,
    { store, quiz, path: '/archive' },
  );
  await act(() => quiz.load());
  return { ...result, user, repository };
}

function chapterTrigger(name: string): HTMLElement {
  return within(screen.getByRole('heading', { level: 2, name: new RegExp(`^${name}`) })).getByRole(
    'button',
  );
}

function lessonTrigger(name: string): HTMLElement {
  return within(screen.getByRole('heading', { level: 3, name: new RegExp(`^${name}`) })).getByRole(
    'button',
  );
}

/** 章节标题去掉紧随其后的“N 个课时 · N 词”副标题 */
function chapterNames(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((heading) => {
    const subtitle = within(heading).getByText(/个课时/).textContent;
    return heading.textContent.slice(0, heading.textContent.length - subtitle.length);
  });
}

type User = ReturnType<typeof userEvent.setup>;

async function openLesson(user: User, chapter: string, lesson: string): Promise<void> {
  if (chapterTrigger(chapter).getAttribute('aria-expanded') !== 'true') {
    await user.click(chapterTrigger(chapter));
  }
  if (lessonTrigger(lesson).getAttribute('aria-expanded') !== 'true') {
    await user.click(lessonTrigger(lesson));
  }
}

describe('ArchivePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('还没有归档时说明归档从哪里来，并引导去测验', async () => {
    const { user, location } = await renderArchive(EMPTY_LIBRARY);
    expect(screen.getByRole('heading', { name: '还没有归档的词' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '去测验' }));
    expect(location.history.at(-1)).toBe('/quiz');
  });

  it('空状态可以从其他设备同步过来（F-070）', async () => {
    const { user } = await renderArchive(EMPTY_LIBRARY);
    await user.click(screen.getByRole('button', { name: '从其他设备同步' }));
    expect(await screen.findByRole('dialog', { name: '设备同步' })).toBeInTheDocument();
  });

  it('导航栏上的“设备同步”打开同步面板（F-070）', async () => {
    const { user } = await renderArchive();
    await user.click(screen.getByRole('button', { name: '设备同步' }));
    expect(await screen.findByRole('dialog', { name: '设备同步' })).toBeInTheDocument();
  });

  it('统计归档词汇与章节；章节一次只展开一个，每章内课时一次只展开一个', async () => {
    const { user } = await renderArchive();
    expect(screen.getByRole('status')).toHaveTextContent('共 4 个归档词汇 · 分布在 2 个章节');
    expect(chapterNames()).toEqual(['A1', 'A2']);
    expect(chapterTrigger('A1')).toHaveAccessibleName(/2 个课时 · 3 词/);

    await openLesson(user, 'A1', '第1讲');
    expect(screen.getByText('der Schrank')).toBeVisible();
    expect(screen.getByText('der Schrank')).toHaveAttribute('lang', 'de');

    await user.click(lessonTrigger('第2讲'));
    expect(lessonTrigger('第1讲')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('die Katze')).toBeVisible();

    await user.click(chapterTrigger('A2'));
    expect(chapterTrigger('A1')).toHaveAttribute('aria-expanded', 'false');
    // 再展开 A1 时回到原来展开的课时
    await user.click(chapterTrigger('A1'));
    expect(lessonTrigger('第2讲')).toHaveAttribute('aria-expanded', 'true');
  });

  it('搜索：匹配的组全部展开并报告数量；没有结果时说明原因', async () => {
    const { user } = await renderArchive();
    const search = screen.getByRole('searchbox', { name: '搜索归档库' });

    await user.type(search, '猫');
    expect(await screen.findByText('die Katze')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('找到 1 个词');
    expect(chapterNames()).toEqual(['A1']);

    await user.clear(search);
    await user.type(search, 'a2');
    expect(await screen.findByText('die Arbeit')).toBeVisible();

    await user.clear(search);
    await user.type(search, 'Fenster');
    expect(await screen.findByRole('heading', { name: '没有找到相关内容' })).toBeInTheDocument();
    expect(screen.getByText('没有与“Fenster”相关的单词、释义或章节。')).toBeInTheDocument();
  });

  it('测本课：只测这个课时，并转到测验页', async () => {
    const { user, quiz, location } = await renderArchive();
    await user.click(chapterTrigger('A1'));
    await user.click(screen.getByRole('button', { name: '测本课：第1讲' }));

    const session = quiz.getState().session;
    expect(session?.scope).toEqual({
      source: 'archive',
      sections: [{ chapter: 'A1', lesson: '第1讲' }],
    });
    expect(session?.questions.map(({ id }) => id)).toEqual([SCHRANK.id, TISCH.id]);
    expect(location.history.at(-1)).toBe('/quiz');
  });

  it('换掉一个还没做完的测验时提供撤销', async () => {
    const { user, quiz } = await renderArchive();
    await user.click(screen.getByRole('button', { name: '测本章：A2' }));
    const previous = quiz.getState().session;

    await user.click(screen.getByRole('button', { name: '测本章：A1' }));
    expect(quiz.getState().session?.scope.sections).toEqual([{ chapter: 'A1', lesson: null }]);
    expect(await screen.findByText('之前未完成的测验已放下')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(quiz.getState().session).toEqual(previous);
    expect(await screen.findByText('已回到之前的测验')).toBeInTheDocument();
  });

  it('组合测试：勾选课时后开始；整章选中时合并为整章', async () => {
    const { user, quiz } = await renderArchive();
    await user.click(screen.getByRole('button', { name: '组合测试' }));
    expect(
      screen.getByText('勾选要一起测试的课时（只选 1 个也可以）。', SKIP_ANNOUNCER),
    ).toBeInTheDocument();
    const start = screen.getByRole('button', { name: '开始组合测试' });
    expect(start).toBeDisabled();
    // 组合模式下不显示“测本章”，也不能排序
    expect(screen.queryByRole('button', { name: '测本章：A1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /调整章节/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: '选择 A2' }));
    await user.click(chapterTrigger('A1'));
    await user.click(screen.getByRole('checkbox', { name: '选择 第2讲' }));
    expect(screen.getByText('已选 2 个课时')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '选择 A1' })).toBePartiallyChecked();

    await user.click(start);
    expect(quiz.getState().session?.scope.sections).toEqual([
      { chapter: 'A1', lesson: '第2讲' },
      { chapter: 'A2', lesson: null },
    ]);
  });

  it('“管理”单击进入编辑模式、双击进入删除模式；Esc 退出并把焦点交还“管理”', async () => {
    const clock = vi.spyOn(performance, 'now');
    const { user } = await renderArchive();
    const manage = screen.getByRole('button', { name: '管理' });
    expect(manage).toHaveAccessibleDescription('单击进入编辑模式，双击进入删除模式');

    clock.mockReturnValue(0);
    await user.click(manage);
    expect(manage).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/^编辑模式/, SKIP_ANNOUNCER)).toBeInTheDocument();

    // 超过双击间隔后再按：只是单击，退出编辑模式
    clock.mockReturnValue(gesture.doublePressMs * 2);
    await user.click(manage);
    expect(manage).toHaveAttribute('aria-pressed', 'false');

    // 间隔内按两下：第一下进入编辑模式，第二下改判为双击，进入删除模式
    clock.mockReturnValue(gesture.doublePressMs * 4);
    await user.click(manage);
    clock.mockReturnValue(gesture.doublePressMs * 4 + gesture.doublePressMs / 2);
    await user.click(manage);
    expect(screen.getByText(/^删除模式/, SKIP_ANNOUNCER)).toBeInTheDocument();

    // 键盘与读屏用户不必双击：横幅里直接切换
    await user.click(screen.getByRole('button', { name: '改为编辑模式' }));
    expect(screen.getByText(/^编辑模式/, SKIP_ANNOUNCER)).toBeInTheDocument();

    screen.getByRole('button', { name: '重命名章节“A1”' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByText(/^编辑模式/, SKIP_ANNOUNCER)).not.toBeInTheDocument();
    expect(manage).toHaveAttribute('aria-pressed', 'false');
    expect(manage).toHaveFocus();
  });

  it('编辑词条：校验后保存，可以撤销', async () => {
    const { user, store } = await renderArchive();
    await user.click(screen.getByRole('button', { name: '管理' }));
    await openLesson(user, 'A1', '第1讲');
    await user.click(screen.getByRole('button', { name: '编辑“der Schrank”' }));

    const sheet = screen.getByRole('dialog', { name: '编辑词条' });
    const answer = within(sheet).getByRole('textbox', { name: '德语' });
    await user.clear(answer);
    await user.click(within(sheet).getByRole('button', { name: '保存' }));
    expect(within(sheet).getByRole('textbox', { name: '德语' })).toHaveAccessibleDescription(
      /请填写德语。/,
    );

    await user.type(answer, 'der Kasten');
    await user.type(within(sheet).getByRole('textbox', { name: '其他可接受答案' }), 'der Schrank');
    await user.click(within(sheet).getByRole('button', { name: '保存' }));
    expect(await screen.findByText('已保存修改')).toBeInTheDocument();
    expect(store.getState().library.archive[0]?.answers).toEqual(['der Kasten', 'der Schrank']);
    expect(screen.getByText('der Kasten')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => {
      expect(store.getState().library.archive[0]?.answers).toEqual(['der Schrank']);
    });
  });

  it('双击文字编辑后，焦点回到该词条的编辑按钮', async () => {
    const { user } = await renderArchive();
    await user.click(screen.getByRole('button', { name: '管理' }));
    await openLesson(user, 'A1', '第1讲');
    await user.dblClick(screen.getByText('der Schrank', { exact: true }));
    const sheet = screen.getByRole('dialog', { name: '编辑词条' });
    const answer = within(sheet).getByRole('textbox', { name: '德语' });
    await user.clear(answer);
    await user.type(answer, 'der Kleiderschrank');
    await user.click(within(sheet).getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '编辑“der Kleiderschrank”' })).toHaveFocus();
    });
  });

  it('删除词条：确认后删除，焦点移到相邻词条，可以撤销', async () => {
    const { user, store } = await renderArchive();
    const manage = screen.getByRole('button', { name: '管理' });
    await user.dblClick(manage);
    await openLesson(user, 'A1', '第1讲');

    await user.click(screen.getByRole('button', { name: '删除“der Schrank”' }));
    const dialog = screen.getByRole('alertdialog', { name: '删除这个词？' });
    expect(dialog).toHaveTextContent('将从归档库中删除“der Schrank”。');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    expect(await screen.findByText('已删除 1 个词')).toBeInTheDocument();
    expect(store.getState().library.archive.map(({ id }) => id)).toEqual([
      TISCH.id,
      KATZE.id,
      ARBEIT.id,
    ]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '删除“der Tisch”' })).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => {
      expect(store.getState().library.archive.map(({ id }) => id)).toEqual(
        ARCHIVE.map(({ id }) => id),
      );
    });
  });

  it('删除整个章节前保存快照', async () => {
    const { user, store, repository } = await renderArchive();
    await user.dblClick(screen.getByRole('button', { name: '管理' }));
    await user.click(screen.getByRole('button', { name: '删除章节“A2”' }));
    const dialog = screen.getByRole('alertdialog', { name: '删除整个章节？' });
    expect(dialog).toHaveTextContent('将从归档库中删除“A2”及其中的 1 个词。');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    expect(await screen.findByText('已删除 1 个词')).toBeInTheDocument();
    expect(chapterNames()).toEqual(['A1']);
    expect(store.getState().library.archive).toHaveLength(3);
    const snapshots = await repository.listSnapshots();
    expect(snapshots.map(({ reason }) => reason)).toEqual(['delete']);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '删除章节“A1”' })).toHaveFocus();
    });
  });

  it('改名：重名时提示；成功后焦点留在新名称的铅笔按钮上，展开状态不变，可以撤销', async () => {
    const { user, store } = await renderArchive();
    await user.click(screen.getByRole('button', { name: '管理' }));
    await openLesson(user, 'A1', '第1讲');
    await user.click(screen.getByRole('button', { name: '重命名章节“A1”' }));

    const sheet = screen.getByRole('dialog', { name: '重命名章节' });
    const name = within(sheet).getByRole('textbox', { name: '名称' });
    await user.clear(name);
    await user.type(name, 'A2');
    await user.keyboard('{Enter}');
    expect(name).toHaveAccessibleDescription(/归档库中已有同名的章节/);

    await user.clear(name);
    await user.type(name, ' B1 ');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('已重命名为“B1”')).toBeInTheDocument();
    expect(chapterNames()).toEqual(['B1', 'A2']);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '重命名章节“B1”' })).toHaveFocus();
    });
    expect(chapterTrigger('B1')).toHaveAttribute('aria-expanded', 'true');
    expect(lessonTrigger('第1讲')).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => {
      expect(store.getState().library.archive[0]?.chapter).toBe('A1');
    });
    expect(chapterTrigger('A1')).toHaveAttribute('aria-expanded', 'true');
    expect(lessonTrigger('第1讲')).toHaveAttribute('aria-expanded', 'true');
  });

  it('用方向键调整章节顺序，排序表随之保存', async () => {
    const { user, store } = await renderArchive();
    screen.getByRole('button', { name: '调整章节“A1”的位置' }).focus();
    await user.keyboard('{ArrowDown}');

    expect(chapterNames()).toEqual(['A2', 'A1']);
    expect(screen.getByRole('button', { name: '调整章节“A1”的位置' })).toHaveFocus();
    await waitFor(() => {
      expect(store.getState().library.order.map(({ chapter }) => chapter)).toEqual(['A2', 'A1']);
    });
    await waitFor(() => {
      expect(document.querySelector('[data-announcer]')).toHaveTextContent(
        '“A1”已移到第 2 位，共 2 位',
      );
    });
  });

  it('搜索时不能排序（结果只是部分课时）', async () => {
    const { user } = await renderArchive();
    expect(screen.getByRole('button', { name: '调整章节“A1”的位置' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: '搜索归档库' }), 'der');
    await screen.findByText('der Schrank');
    expect(screen.queryByRole('button', { name: /调整/ })).not.toBeInTheDocument();
  });

  it('浏览、编辑与组合模式都通过无障碍检查', async () => {
    const { user, container } = await renderArchive();
    await openLesson(user, 'A1', '第1讲');
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: '管理' }));
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: '组合测试' }));
    await expectNoAxeViolations(container);
  });
});
