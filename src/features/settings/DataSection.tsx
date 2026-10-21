import { BookOpenText, FileText, HardDrive, Import, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { componentGeometry } from '../../design/tokens';
import { countLibrary } from '../../domain';
import { useI18n } from '../../i18n';
import type { LibraryState, PersistenceStatus } from '../../storage';
import { Badge, Button, ListGroup, ListRow } from '../../ui';
import { useLibraryStore } from '../library';
import { useSyncSheet } from '../sync';
import { ExportTextSheet } from './ExportTextSheet';
import { LegacyImportSheet } from './LegacyImportSheet';
import styles from './SettingsPage.module.css';

const PERSISTENCE_TONES = {
  saved: 'success',
  saving: 'neutral',
  failed: 'danger',
} as const satisfies Record<PersistenceStatus, 'success' | 'neutral' | 'danger'>;

interface DataSectionProps {
  readonly state: LibraryState;
}

/**
 * 本地存储状态与词汇数量（F-001 / F-007），设备同步（F-070），导出纯文本（F-056）与导入旧版数据（F-005）
 */
export function DataSection({ state }: DataSectionProps) {
  const { messages } = useI18n();
  const store = useLibraryStore();
  const sync = useSyncSheet();
  const text = messages.settings.data;
  const counts = countLibrary(state.library);
  // 内存模式下“已保存”没有意义：数据本来就不会留到下次
  const showsPersistence = state.storage === 'indexeddb';
  const [isExporting, setExporting] = useState(false);
  const [isImporting, setImporting] = useState(false);
  // 每次打开导入面板都重新挂载，从头开始（关闭动画期间保留原来的内容）
  const [importSession, setImportSession] = useState(0);

  return (
    <>
      <ListGroup header={text.header}>
        <ListRow
          title={text.storage}
          subtitle={text.storageKind[state.storage]}
          leading={<HardDrive size={componentGeometry.iconMd} />}
          trailing={
            showsPersistence ? (
              <>
                <Badge tone={PERSISTENCE_TONES[state.persistence]}>
                  {text.persistence[state.persistence]}
                </Badge>
                {state.persistence === 'failed' && (
                  <Button
                    size="sm"
                    variant="tinted"
                    onPress={() => {
                      void store.retry();
                    }}
                  >
                    {messages.data.retry}
                  </Button>
                )}
              </>
            ) : undefined
          }
        />
        <ListRow
          title={text.words}
          leading={<BookOpenText size={componentGeometry.iconMd} />}
          trailing={
            <span className={styles.value}>{text.wordCounts(counts.pool, counts.archive)}</span>
          }
        />
        <ListRow
          title={text.sync}
          leading={<RefreshCw size={componentGeometry.iconMd} />}
          className={styles.action}
          onAction={() => {
            sync.open();
          }}
        />
        <ListRow
          title={text.exportText}
          leading={<FileText size={componentGeometry.iconMd} />}
          className={styles.action}
          onAction={() => {
            setExporting(true);
          }}
        />
        <ListRow
          title={text.importLegacy}
          leading={<Import size={componentGeometry.iconMd} />}
          className={styles.action}
          onAction={() => {
            setImportSession((session) => session + 1);
            setImporting(true);
          }}
        />
      </ListGroup>
      <ExportTextSheet isOpen={isExporting} onOpenChange={setExporting} library={state.library} />
      <LegacyImportSheet
        key={importSession}
        isOpen={isImporting}
        onOpenChange={setImporting}
        library={state.library}
      />
    </>
  );
}
