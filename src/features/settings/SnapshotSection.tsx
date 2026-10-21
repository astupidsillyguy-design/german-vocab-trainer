import { History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { componentGeometry } from '../../design/tokens';
import { SNAPSHOT_LIMIT, type SnapshotSummary } from '../../domain';
import { useI18n } from '../../i18n';
import type { UpdateResult } from '../../storage';
import { AlertDialog, Button, ListGroup, ListRow, toast } from '../../ui';
import { snapshotUndoAction, useLibraryStore } from '../library';
import styles from './SettingsPage.module.css';

interface SnapshotSectionProps {
  /** 从新到旧 */
  readonly snapshots: readonly SnapshotSummary[];
}

/** 快照历史：整体替换、同步覆盖、导入之前自动保存，可恢复，恢复后可撤销 */
export function SnapshotSection({ snapshots }: SnapshotSectionProps) {
  const { locale, messages } = useI18n();
  const store = useLibraryStore();
  const text = messages.settings.snapshots;
  // 对话框关闭动画期间仍需显示内容，因此“打开与否”和“目标快照”分开保存
  const [target, setTarget] = useState<SnapshotSummary | null>(null);
  const [isConfirming, setConfirming] = useState(false);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const formatTime = (summary: SnapshotSummary): string =>
    dateFormat.format(new Date(summary.createdAt));

  const restore = async (summary: SnapshotSummary): Promise<void> => {
    let result: UpdateResult | null;
    try {
      result = await store.restoreSnapshot(summary.id);
    } catch {
      toast.error({ title: text.failed });
      return;
    }
    if (result === null) {
      toast.error({ title: text.missing });
      return;
    }
    const undoId = result.snapshotId;
    toast.success({
      title: text.restored,
      ...(undoId === null
        ? {}
        : {
            action: snapshotUndoAction(store, undoId, {
              label: messages.common.undo,
              done: text.undone,
              failed: text.failed,
            }),
          }),
    });
  };

  return (
    <>
      <ListGroup header={text.header} footer={text.footer(SNAPSHOT_LIMIT)}>
        {snapshots.length === 0 ? (
          <ListRow title={text.empty} className={styles.placeholder} />
        ) : (
          snapshots.map((summary) => {
            const reason = text.reasons[summary.reason];
            const time = formatTime(summary);
            const counts = messages.settings.data.wordCounts(
              summary.counts.pool,
              summary.counts.archive,
            );
            return (
              <ListRow
                key={summary.id}
                title={reason}
                subtitle={`${time} · ${counts}`}
                leading={<History size={componentGeometry.iconMd} />}
                trailing={
                  <Button
                    size="sm"
                    variant="tinted"
                    aria-label={text.restoreLabel(reason, time)}
                    onPress={() => {
                      setTarget(summary);
                      setConfirming(true);
                    }}
                  >
                    {text.restore}
                  </Button>
                }
              />
            );
          })
        )}
      </ListGroup>
      <AlertDialog
        isOpen={isConfirming}
        onOpenChange={setConfirming}
        title={text.restoreTitle}
        confirmLabel={text.restore}
        onConfirm={() => {
          if (target !== null) void restore(target);
        }}
      >
        {target === null ? null : text.restoreMessage(formatTime(target))}
      </AlertDialog>
    </>
  );
}
