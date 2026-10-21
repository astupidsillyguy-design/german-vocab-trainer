import { Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { LibraryProvider } from '../features/library';
import { QuizProvider } from '../features/quiz';
import { SyncProvider } from '../features/sync';
import { I18nProvider, type Locale, type Messages } from '../i18n';
import type { LibraryStore } from '../storage';
import { GlassProvider } from '../ui';
import { AppShell } from './AppShell';
import { NavigationProvider } from './navigation';
import { pathFor } from './routes';

interface AppProps {
  readonly initialLocale: Locale;
  readonly initialMessages: Messages;
  readonly libraryStore: LibraryStore;
}

export function App({ initialLocale, initialMessages, libraryStore }: AppProps) {
  return (
    <I18nProvider initialLocale={initialLocale} initialMessages={initialMessages}>
      <GlassProvider>
        <Router hook={useHashLocation}>
          <LibraryProvider store={libraryStore} reviewPath={pathFor('settings')}>
            <QuizProvider>
              <NavigationProvider>
                <SyncProvider>
                  <AppShell />
                </SyncProvider>
              </NavigationProvider>
            </QuizProvider>
          </LibraryProvider>
        </Router>
      </GlassProvider>
    </I18nProvider>
  );
}
