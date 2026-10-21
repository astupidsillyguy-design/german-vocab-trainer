import { useI18n } from '../../i18n';
import { NavigationBar } from '../../ui';
import { LibraryLoading, useLibraryState } from '../library';
import { AboutSection } from './AboutSection';
import { DataSection } from './DataSection';
import { GeneralSection } from './GeneralSection';
import { QuarantineSection } from './QuarantineSection';
import { SnapshotSection } from './SnapshotSection';
import { SpeechSection } from './SpeechSection';
import styles from './SettingsPage.module.css';

/** 设置页（F-096）：通用、发音、数据、快照历史与关于。通用与发音不依赖词库，加载期间即可使用 */
export function SettingsPage() {
  const { messages } = useI18n();
  const state = useLibraryState();
  return (
    <>
      <NavigationBar title={messages.nav.settings} largeTitle />
      <div className={styles.sections}>
        <GeneralSection />
        <SpeechSection />
        {state.status === 'loading' ? (
          <LibraryLoading />
        ) : (
          <>
            <DataSection state={state} />
            {state.quarantineCount > 0 && <QuarantineSection count={state.quarantineCount} />}
            <SnapshotSection snapshots={state.snapshots} />
          </>
        )}
        <AboutSection />
      </div>
    </>
  );
}
