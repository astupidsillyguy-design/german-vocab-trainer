/**
 * 测试用词库：内存仓库 + 完整的 Provider 组合（语言、路由、词库、测验进度、应用内导航、设备同步）。
 */
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { NavigationProvider } from '../app/navigation';
import { EMPTY_LIBRARY, type Library } from '../domain';
import { LibraryProvider } from '../features/library';
import { QuizProvider, QuizStore } from '../features/quiz';
import { SyncProvider, type SyncEnvironmentFactory } from '../features/sync';
import { I18nProvider, type Locale } from '../i18n';
import { LibraryStore, MemoryRepository, type LibraryRepository } from '../storage';
import { catalogs } from './messages';
import { createMemorySyncNetwork } from './sync';

export const TEST_REVIEW_PATH = '/settings';

export function createTestStore(
  repository: LibraryRepository = new MemoryRepository(EMPTY_LIBRARY),
): LibraryStore {
  return new LibraryStore({ openRepository: () => Promise.resolve(repository) });
}

export function createTestStoreWith(library: Library): LibraryStore {
  return createTestStore(new MemoryRepository(library));
}

interface ProviderRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly path?: string;
  readonly locale?: Locale;
  readonly store?: LibraryStore;
  /** 测验进度；省略时按词库创建 */
  readonly quiz?: QuizStore;
  /** 设备同步的信令与直连；省略时使用互不相通的内存实现（不访问网络） */
  readonly sync?: SyncEnvironmentFactory;
}

export interface ProviderRenderResult extends RenderResult {
  readonly store: LibraryStore;
  readonly quiz: QuizStore;
  readonly location: ReturnType<typeof memoryLocation>;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    path = '/',
    locale = 'zh-CN',
    store = createTestStore(),
    quiz = new QuizStore({ library: store }),
    sync = createMemorySyncNetwork().environment,
    ...options
  }: ProviderRenderOptions = {},
): ProviderRenderResult {
  const location = memoryLocation({ path, record: true });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <I18nProvider initialLocale={locale} initialMessages={catalogs[locale]}>
        <Router hook={location.hook}>
          <LibraryProvider store={store} reviewPath={TEST_REVIEW_PATH}>
            <QuizProvider store={quiz}>
              <NavigationProvider>
                <SyncProvider environment={sync}>{children}</SyncProvider>
              </NavigationProvider>
            </QuizProvider>
          </LibraryProvider>
        </Router>
      </I18nProvider>
    );
  }
  return { ...render(ui, { wrapper: Wrapper, ...options }), store, quiz, location };
}
