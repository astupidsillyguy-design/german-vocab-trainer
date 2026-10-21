import { FileWarning } from 'lucide-react';
import { useState } from 'react';
import { componentGeometry } from '../../design/tokens';
import { useI18n } from '../../i18n';
import { downloadJson, fileTimestamp } from '../../shared/download';
import { AlertDialog, ListGroup, ListRow, toast } from '../../ui';
import { useLibraryStore } from '../library';
import styles from './SettingsPage.module.css';

/** 导出文件的标识，便于日后识别与恢复 */
export const QUARANTINE_EXPORT_KIND = 'german-vocab-trainer/unrecognized-data';
export const QUARANTINE_EXPORT_VERSION = 1;

export function quarantineFileName(date: Date): string {
  return `german-vocab-trainer-unrecognized-${fileTimestamp(date)}.json`;
}

interface QuarantineSectionProps {
  readonly count: number;
}

/** 无法识别的数据（F-001 损坏保留原始数据）：导出原样 JSON，或确认后清除 */
export function QuarantineSection({ count }: QuarantineSectionProps) {
  const { messages } = useI18n();
  const store = useLibraryStore();
  const text = messages.settings.quarantine;
  const [isConfirming, setConfirming] = useState(false);

  const exportRecords = async (): Promise<void> => {
    try {
      const records = await store.listQuarantine();
      const now = new Date();
      downloadJson(quarantineFileName(now), {
        kind: QUARANTINE_EXPORT_KIND,
        version: QUARANTINE_EXPORT_VERSION,
        exportedAt: now.toISOString(),
        records,
      });
      toast.success({ title: text.exported });
    } catch {
      toast.error({ title: text.failed });
    }
  };

  const clear = async (): Promise<void> => {
    try {
      await store.clearQuarantine();
      toast.success({ title: text.cleared });
    } catch {
      toast.error({ title: text.failed });
    }
  };

  return (
    <>
      <ListGroup header={text.header} footer={text.footer}>
        <ListRow
          title={text.count(count)}
          leading={<FileWarning size={componentGeometry.iconMd} />}
        />
        <ListRow
          title={text.export}
          className={styles.action}
          onAction={() => {
            void exportRecords();
          }}
        />
        <ListRow
          title={text.clear}
          className={styles.destructive}
          onAction={() => {
            setConfirming(true);
          }}
        />
      </ListGroup>
      <AlertDialog
        isOpen={isConfirming}
        onOpenChange={setConfirming}
        title={text.clearTitle}
        confirmLabel={messages.common.clear}
        tone="destructive"
        onConfirm={() => {
          void clear();
        }}
      >
        {text.clearMessage(count)}
      </AlertDialog>
    </>
  );
}
