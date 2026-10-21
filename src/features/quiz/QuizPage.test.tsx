import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advance,
  createQuizSession,
  submitAnswer,
  type Entry,
  type Library,
  type QuizScope,
  type QuizSession,
} from '../../domain';
import { expectNoAxeViolations } from '../../test/axe';
import { makeEntry, TEST_NOW, testId } from '../../test/entries';
import { createTestStore, renderWithProviders } from '../../test/library';
import { ControlledRepository } from '../../test/repositories';
import { setViewportWidth } from '../../test/viewport';
import { ToastRegion } from '../../ui';
import { QuizPage } from './QuizPage';
import { POOL_SCOPE, QUIZ_STATE_KEY, QuizStore } from './QuizStore';

/** 不打乱：洗牌时 j 总等于 i，出题顺序即词表顺序 */
const KEEP_ORDER = (): number => 1 - Number.EPSILON;
const SAVED_ID = '33333333-3333-4333-8333-333333333333';

const SCHRANK = makeEntry({
  id: testId(1),
  chapter: 'A1',
  lesson: '第30讲',
  prompt: '柜子',
  answers: ['der Schrank'],
});
const HELFEN = makeEntry({
  id: testId(2),
  chapter: 'A1',
  lesson: '第30讲',
  prompt: '帮助某人',
  answers: ['jm. bei etw. helfen', 'helfen'],
});

function libraryWith(pool: readonly Entry[], archive: readonly Entry[] = []): Library {
  return { pool, archive, order: [] };
}

async function renderQuiz(library: Library, saved?: unknown) {
  const repository = new ControlledRepository({ initial: library });
  if (saved !== undefined) await repository.writeState(QUIZ_STATE_KEY, saved);
  const store = createTestStore(repository);
  await store.load();
  const quiz = new QuizStore({ library: store, random: KEEP_ORDER });
  const user = userEvent.setup();
  const result = renderWithProviders(
    <>
      <QuizPage />
      <ToastRegion />
    </>,
    { store, quiz, path: '/quiz' },
  );
  await act(() => quiz.load());
  return { ...result, user, repository };
}

/** 依次作答并进入下一题（最后一题之后显示结果） */
async function answerRound(
  user: ReturnType<typeof userEvent.setup>,
  inputs: readonly string[],
): Promise<void> {
  for (const input of inputs) {
    await user.type(answerInput(), `${input}{Enter}`);
    await user.type(answerInput(), '{Enter}');
  }
}

/** 已结束第 1 轮的测验（用于模拟刷新后看到的结果页） */
function finishedSession(
  entries: readonly Entry[],
  inputs: readonly string[],
  scope: QuizScope = POOL_SCOPE,
): QuizSession {
  let session = createQuizSession(entries, scope, {
    id: SAVED_ID,
    now: TEST_NOW,
    random: KEEP_ORDER,
  });
  if (session === null) throw new Error('应当创建会话');
  for (const input of inputs) session = advance(submitAnswer(session, input));
  return session;
}

const answerInput = (): HTMLInputElement => screen.getByRole('textbox', { name: '你的答案' });
const primaryButton = (name: string): HTMLElement => screen.getByRole('button', { name });

describe('QuizPage：开始与空状态', () => {
  it('待测库为空时显示引导，去词表页（F-021）', async () => {
    const { user, location } = await renderQuiz(libraryWith([]));
    expect(screen.getByRole('heading', { name: '还没有待测的词' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '去归档页' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '去词表页' }));
    expect(location.history.at(-1)).toBe('/words');
  });

  it('待测的词都已归档时，也可以去归档页', async () => {
    await renderQuiz(libraryWith([], [makeEntry({ archivedAt: TEST_NOW.toISOString() })]));
    expect(screen.getByText(/待测的词都已归档/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去归档页' })).toBeInTheDocument();
  });

  it('有待测的词时自动开始：范围、进度、课时标签与题面；输入框适合输入德语', async () => {
    await renderQuiz(libraryWith([SCHRANK, HELFEN]));
    expect(screen.getByRole('heading', { level: 1, name: '测验' })).toBeInTheDocument();
    expect(screen.getByText('全部待测词汇')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '本轮进度' })).toHaveAttribute(
      'aria-valuetext',
      '第 1 / 2 题',
    );
    expect(screen.getByText('A1 · 第30讲')).toBeInTheDocument();
    expect(screen.getByText('柜子')).toBeInTheDocument();
    const input = answerInput();
    expect(input).toHaveAttribute('lang', 'de');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAccessibleDescription('柜子');
    // 手机上不自动聚焦（避免键盘突然弹出）
    expect(input).not.toHaveFocus();
    await expectNoAxeViolations();
  });

  it('宽屏上每道新题自动聚焦输入框', async () => {
    setViewportWidth(1280);
    await renderQuiz(libraryWith([SCHRANK, HELFEN]));
    expect(answerInput()).toHaveFocus();
  });

  it('刷新后从保存的进度继续（包括已作答的反馈）', async () => {
    const session = createQuizSession([SCHRANK, HELFEN], POOL_SCOPE, {
      id: SAVED_ID,
      now: TEST_NOW,
      random: KEEP_ORDER,
    });
    if (session === null) throw new Error('应当创建会话');
    await renderQuiz(libraryWith([SCHRANK, HELFEN]), submitAnswer(session, 'der Schrank'));
    expect(screen.getByText('答对啦！')).toBeInTheDocument();
    expect(answerInput()).toHaveValue('der Schrank');
    expect(answerInput()).toHaveAttribute('readonly');
  });
});

describe('QuizPage：作答', () => {
  it('答对：反馈标准表达并播报；回车进入下一题，输入框清空（F-018 / F-028）', async () => {
    const { user } = await renderQuiz(libraryWith([SCHRANK, HELFEN]));
    await user.type(answerInput(), 'DER schrank{Enter}');
    expect(screen.getByText('答对啦！')).toBeInTheDocument();
    expect(screen.getByText('答对了。标准表达：der Schrank')).toBeInTheDocument();
    expect(screen.getByText('答对 1')).toBeInTheDocument();
    expect(answerInput()).toHaveAttribute('readonly');
    expect(primaryButton('下一题')).toBeInTheDocument();

    await user.type(answerInput(), '{Enter}');
    expect(screen.getByText('帮助某人')).toBeInTheDocument();
    expect(answerInput()).toHaveValue('');
    expect(answerInput()).not.toHaveAttribute('readonly');
    expect(screen.getByText('第 2 / 2 题：帮助某人')).toBeInTheDocument();
  });

  it('答错：字母级对比，读屏播报正确答案，最后一题之后查看结果（F-029）', async () => {
    const { user } = await renderQuiz(libraryWith([HELFEN]));
    await user.type(answerInput(), 'helfn');
    await user.click(primaryButton('提交核对'));
    expect(screen.getByText('拼写有误')).toBeInTheDocument();
    // 与输入最接近的可接受答案作为“正确答案”，其余写法列在后面
    expect(screen.getByText('答错了。正确答案：helfen')).toBeInTheDocument();
    expect(screen.getByText('jm. bei etw. helfen')).toBeInTheDocument();
    const feedback = screen.getByText('拼写有误').closest('div[data-result]');
    if (!(feedback instanceof HTMLElement)) throw new Error('缺少反馈区域');
    const missing = feedback.querySelector('[data-kind="missing"]');
    expect(missing).toHaveTextContent('e');
    expect(primaryButton('查看结果')).toBeInTheDocument();

    await user.click(primaryButton('查看结果'));
    expect(screen.getByRole('heading', { name: '本轮完成' })).toBeInTheDocument();
    expect(screen.getByText('0 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重测首轮错词（1 词）' })).toBeInTheDocument();
  });

  it('漏写冠词即判错', async () => {
    const { user } = await renderQuiz(libraryWith([SCHRANK]));
    await user.type(answerInput(), 'Schrank{Enter}');
    expect(screen.getByText('拼写有误')).toBeInTheDocument();
  });

  it('空答案不判分，只轻提示（F-019）', async () => {
    const { user } = await renderQuiz(libraryWith([SCHRANK]));
    await user.type(answerInput(), '   {Enter}');
    expect(screen.getByText('请先输入答案。')).toBeInTheDocument();
    expect(screen.getByText('答对 0')).toBeInTheDocument();
    expect(screen.getByText('答错 0')).toBeInTheDocument();
    await user.type(answerInput(), 'd');
    expect(screen.queryByText('请先输入答案。')).not.toBeInTheDocument();
  });

  it('特殊字符插在光标处，焦点留在输入框（F-017）', async () => {
    const { user } = await renderQuiz(libraryWith([makeEntry({ answers: ['das Mädchen'] })]));
    const input = answerInput();
    await user.type(input, 'das Mdchen');
    input.setSelectionRange('das M'.length, 'das M'.length);
    const keys = screen.getByRole('group', { name: '特殊字符' });
    await user.click(within(keys).getByRole('button', { name: 'ä' }));
    expect(input).toHaveValue('das Mädchen');
    expect(input.selectionStart).toBe('das Mä'.length);
    expect(input).toHaveFocus();
  });

  it('题面按文本显示，不会被当作 HTML（F-015）', async () => {
    const prompt = '<img src=x onerror="alert(1)">';
    const { container } = await renderQuiz(libraryWith([makeEntry({ prompt })]));
    expect(screen.getByText(prompt)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('动词变形题显示原形与要写的形式（F-027）', async () => {
    const entry = makeEntry({
      prompt: 'einziehen的二分词',
      answers: ['eingezogen'],
      verbForm: { kind: 'partizip2', base: 'einziehen' },
    });
    await renderQuiz(libraryWith([entry]));
    expect(screen.getByText('请写出这个动词的二分词')).toBeInTheDocument();
    expect(screen.getByText('einziehen')).toHaveAttribute('lang', 'de');
    expect(screen.getByText('二分词')).toBeInTheDocument();
  });
});

describe('QuizPage：错题浮层与重开', () => {
  it('错题浮层列出本轮答错的词，键盘可打开与关闭（F-013）', async () => {
    const { user } = await renderQuiz(libraryWith([SCHRANK, HELFEN]));
    await user.type(answerInput(), 'der Tisch{Enter}');
    const trigger = screen.getByRole('button', { name: '答错 1' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: '本轮答错的词' });
    expect(within(dialog).getByText('der Schrank')).toBeInTheDocument();
    expect(within(dialog).getByText('der Tisch')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('重开后可以撤销（F-014）', async () => {
    const { user } = await renderQuiz(libraryWith([SCHRANK, HELFEN]));
    await user.type(answerInput(), 'der Schrank{Enter}');
    await user.click(screen.getByRole('button', { name: '重开' }));
    expect(screen.getByText('答对 0')).toBeInTheDocument();
    expect(await screen.findByText('已重新开始')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByText('答对 1')).toBeInTheDocument();
    expect(screen.getByText('答对啦！')).toBeInTheDocument();
  });
});

describe('QuizPage：结果与轮次（F-030 – F-037）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('未通关：焦点移到结果标题，显示正确率、得分与错题集；重测固定错词集直到一次全对', async () => {
    const { user } = await renderQuiz(libraryWith([SCHRANK, HELFEN]));
    await answerRound(user, ['der Tisch', 'helfen']);

    expect(screen.getByRole('heading', { level: 2, name: '本轮完成' })).toHaveFocus();
    expect(screen.getByText('首轮有 1 个词未掌握，已自动锁定为重测专练题库。')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    const review = screen.getByRole('region', { name: '错题集' });
    expect(within(review).getByText('本轮错 1 题')).toBeInTheDocument();
    expect(within(review).getByText('A1 · 第30讲')).toBeInTheDocument();
    expect(within(review).getByText('柜子')).toBeInTheDocument();
    expect(within(review).getByText('der Schrank')).toHaveAttribute('lang', 'de');
    expect(within(review).getByText('der Tisch').tagName).toBe('DEL');
    expect(screen.queryByRole('button', { name: /一键归档/u })).not.toBeInTheDocument();
    await expectNoAxeViolations();

    // 第 2 轮仍然答错：继续考同一组固定错词
    await user.click(screen.getByRole('button', { name: '重测首轮错词（1 词）' }));
    expect(screen.getByText('错词重测 · 第 2 轮 · 固定 1 个词')).toBeInTheDocument();
    await answerRound(user, ['der Tisch']);
    expect(
      screen.getByText('本轮仍有错题。需要在一次重测中把第 1 轮的 1 个错词全部答对。'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重测首轮错词（1 词）' }));
    await answerRound(user, ['der Schrank']);
    expect(screen.getByRole('heading', { level: 2, name: '全部通关！' })).toBeInTheDocument();
    expect(
      screen.getByText('恭喜！第 1 轮的 1 个错词已在一次重测中全部答对，本单元完全通关。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '错题集' })).not.toBeInTheDocument();
    // 通关后归档的是整个单元，而不只是最后一轮的错词
    expect(screen.getByRole('button', { name: '一键归档已通关单元（2 词）' })).toBeInTheDocument();
  });

  it('重新完整测试：回到第 1 轮，考全部的词（F-034）', async () => {
    const { user } = await renderQuiz(libraryWith([SCHRANK, HELFEN]));
    await answerRound(user, ['der Tisch', 'helfen']);
    await user.click(screen.getByRole('button', { name: '重新完整测试' }));
    expect(screen.getByRole('progressbar', { name: '本轮进度' })).toHaveAttribute(
      'aria-valuetext',
      '第 1 / 2 题',
    );
    expect(screen.queryByText(/错词重测/u)).not.toBeInTheDocument();
  });

  it('首轮满分：一键归档后焦点移到说明，通知中可以撤销（F-036）', async () => {
    const { user, store } = await renderQuiz(libraryWith([SCHRANK, HELFEN]));
    await answerRound(user, ['der Schrank', 'helfen']);
    expect(screen.getByRole('heading', { level: 2, name: '全部通关！' })).toBeInTheDocument();
    expect(screen.getByText('太棒了！首轮即满分通关。')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(
      screen.getByText('本单元 2 个词都已达到过关要求，可以一键归档到归档库，并从待测库移除。'),
    ).toBeInTheDocument();
    await expectNoAxeViolations();

    await user.click(screen.getByRole('button', { name: '一键归档已通关单元（2 词）' }));
    expect(store.getState().library.pool).toEqual([]);
    expect(store.getState().library.archive.map((entry) => entry.id)).toEqual([
      SCHRANK.id,
      HELFEN.id,
    ]);
    expect(screen.getByText('本单元 2 个词已在归档库中。').closest('p')).toHaveFocus();
    expect(await screen.findByText('已归档 2 个词')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(await screen.findByText('已撤销归档')).toBeInTheDocument();
    expect(store.getState().library.pool).toHaveLength(2);
    expect(screen.getByRole('button', { name: '一键归档已通关单元（2 词）' })).toBeInTheDocument();
  });

  it('已归档：刷新后仍显示，并引导录入新词或查看归档库', async () => {
    const archived = [SCHRANK, HELFEN].map((entry) => ({
      ...entry,
      archivedAt: TEST_NOW.toISOString(),
    }));
    const saved = finishedSession([SCHRANK, HELFEN], ['der Schrank', 'helfen']);
    const { user, location } = await renderQuiz(libraryWith([], archived), saved);
    const note = screen.getByText('本单元 2 个词已在归档库中。').closest('p');
    expect(note).not.toHaveFocus();
    expect(screen.getByRole('button', { name: '查看归档库' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '录入新词' }));
    expect(location.history.at(-1)).toBe('/words');
  });

  it('从归档库发起的复习全对：无需再次归档，“完成”返回归档页（F-037）', async () => {
    const archived = { ...SCHRANK, archivedAt: TEST_NOW.toISOString() };
    const saved = finishedSession([archived], ['der Schrank'], { source: 'archive', sections: [] });
    const { user, location } = await renderQuiz(libraryWith([], [archived]), saved);
    expect(screen.getByText('全部归档词汇')).toBeInTheDocument();
    expect(screen.getByText('这次复习的 1 个归档词全部答对，无需再次归档。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /一键归档/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(location.history.at(-1)).toBe('/archive');
  });

  it('错题集中的发音按钮朗读标准答案（F-031）', async () => {
    const speak = vi.fn();
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        rate = 1;
        voice: SpeechSynthesisVoice | null = null;
        readonly text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    vi.stubGlobal('speechSynthesis', {
      speaking: false,
      pending: false,
      cancel: vi.fn(),
      speak,
      getVoices: () => [],
      addEventListener: vi.fn(),
    });
    const saved = finishedSession([SCHRANK], ['der Tisch']);
    const { user } = await renderQuiz(libraryWith([SCHRANK]), saved);
    const review = screen.getByRole('region', { name: '错题集' });
    await user.click(within(review).getByRole('button', { name: '朗读 der Schrank' }));
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'der Schrank' }));
  });
});
