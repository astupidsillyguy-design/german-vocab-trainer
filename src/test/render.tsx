import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { I18nProvider, type Locale } from '../i18n';
import { catalogs } from './messages';

interface I18nRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly locale?: Locale;
}

/** 在 I18nProvider 中渲染组件（默认简体中文）。 */
export function renderWithI18n(
  ui: ReactElement,
  { locale = 'zh-CN', ...options }: I18nRenderOptions = {},
): RenderResult {
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <I18nProvider initialLocale={locale} initialMessages={catalogs[locale]}>
        {children}
      </I18nProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
