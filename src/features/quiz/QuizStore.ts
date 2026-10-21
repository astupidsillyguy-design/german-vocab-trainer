/**
 * 测验进度（与框架无关；React 通过 useSyncExternalStore 订阅）。
 *
 * 每次变化立即保存到存储的 state 仓库（刷新后从当前题继续）；保存失败只影响刷新后能否继续，
 * 不打断作答，也不提示。题目内容在开始时复制进会话，之后修改词库不会影响进行中的测验。
 */
import {
  advance,
  archiveEntries,
  createQuizSession,
  hasSameQuestions,
  isRoundPassed,
  isSameScope,
  newId,
  parseQuizSession,
  phaseOf,
  restartFull,
  restartRound,
  startRetest,
  submitAnswer,
  type QuizQuestion,
  type QuizScope,
  type QuizSession,
  type RandomSource,
} from '../../domain';
import type { LibraryStore, UpdateResult } from '../../storage';

export const QUIZ_STATE_KEY = 'quiz.session';

export const POOL_SCOPE: QuizScope = { source: 'pool', sections: [] };

export interface QuizState {
  readonly status: 'loading' | 'ready';
  readonly session: QuizSession | null;
}

export interface ArchiveUnitResult {
  /** 从待测库移到归档库的词数 */
  readonly archived: number;
  /** 写入存储（含撤销用的快照）结束后完成 */
  readonly saving: Promise<UpdateResult>;
}

export interface QuizStoreOptions {
  readonly library: LibraryStore;
  readonly random?: RandomSource;
  readonly clock?: () => Date;
  readonly newId?: () => string;
}

const INITIAL_STATE: QuizState = { status: 'loading', session: null };

export class QuizStore {
  readonly #library: LibraryStore;
  readonly #random: RandomSource;
  readonly #clock: () => Date;
  readonly #newId: () => string;
  readonly #listeners = new Set<() => void>();
  #state: QuizState = INITIAL_STATE;
  #loading: Promise<void> | null = null;

  constructor({ library, random = Math.random, clock, newId: createId }: QuizStoreOptions) {
    this.#library = library;
    this.#random = random;
    this.#clock = clock ?? (() => new Date());
    this.#newId = createId ?? newId;
  }

  getState = (): QuizState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** 可重复调用，只加载一次；保存的进度无法识别时丢弃 */
  load(): Promise<void> {
    this.#loading ??= this.#load();
    return this.#loading;
  }

  async #load(): Promise<void> {
    const saved = parseQuizSession(await this.#library.readState(QUIZ_STATE_KEY));
    // 加载期间已经开始了新的测验（例如刚保存词表）：以新的为准
    if (this.#state.status === 'ready') return;
    this.#setState({ status: 'ready', session: saved });
  }

  /** 开始新的测验并返回它；没有题目时清空当前测验并返回 null */
  start(questions: readonly QuizQuestion[], scope: QuizScope): QuizSession | null {
    const session = createQuizSession(questions, scope, {
      id: this.#newId(),
      now: this.#clock(),
      random: this.#random,
    });
    this.replace(session);
    return session;
  }

  /**
   * “保存并测试”而词表没有变化时：同一范围、同一组题的测验还没结束就继续，否则开始新的测验。
   */
  resumeOrStart(questions: readonly QuizQuestion[], scope: QuizScope): QuizSession | null {
    const current = this.#state.session;
    if (
      current !== null &&
      phaseOf(current) !== 'finished' &&
      isSameScope(current.scope, scope) &&
      hasSameQuestions(current, questions)
    ) {
      return current;
    }
    return this.start(questions, scope);
  }

  /** 直接替换当前测验（用于撤销“重开”） */
  replace(session: QuizSession | null): void {
    this.#setState({ status: 'ready', session });
    void this.#library.writeState(QUIZ_STATE_KEY, session);
  }

  submit(input: string): void {
    this.#transform((session) => submitAnswer(session, input));
  }

  next(): void {
    this.#transform(advance);
  }

  /** F-014 重开（返回重开前的测验，便于撤销） */
  restart(): QuizSession | null {
    const previous = this.#state.session;
    this.#transform((session) => restartRound(session, this.#random));
    return previous;
  }

  /** F-033 重测固定错词集 */
  retest(): void {
    this.#transform((session) => startRetest(session, this.#random));
  }

  /** F-034 重新完整测试 */
  restartFull(): void {
    this.#transform((session) => restartFull(session, this.#random));
  }

  /**
   * F-036 一键归档：从待测库开始、本轮全部答对（通关）的测验，把题目中仍在待测库里的词移到归档库。
   * 修改前保存快照（可撤销）。没有可归档的词、或词库尚不可写时返回 null。
   * 从归档库发起的测验不再归档（F-037）。
   */
  archiveUnit(): ArchiveUnitResult | null {
    const session = this.#state.session;
    if (session?.scope.source !== 'pool' || !isRoundPassed(session)) return null;
    const ids = session.questions.map((question) => question.id);
    let archived = 0;
    const saving = this.#library.update(
      (library) => {
        const result = archiveEntries(library, ids, this.#clock());
        archived = result.archived;
        return result.library;
      },
      { snapshot: 'archive' },
    );
    if (archived === 0) {
      saving.catch(() => undefined);
      return null;
    }
    return { archived, saving };
  }

  #transform(recipe: (session: QuizSession) => QuizSession): void {
    const current = this.#state.session;
    if (current === null) return;
    const next = recipe(current);
    if (next !== current) this.replace(next);
  }

  #setState(patch: Partial<QuizState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
