import type { LibraryStore } from '../../storage';
import { toast, type ToastAction } from '../../ui';

export interface SnapshotUndoText {
  /** 按钮文字（“撤销”） */
  readonly label: string;
  /** 撤销成功后的通知 */
  readonly done: string;
  /** 撤销失败（快照已不存在或无法读取）时的通知 */
  readonly failed: string;
}

/**
 * 通知上的“撤销”：恢复到操作前自动保存的快照。
 * 撤销本身不再另存快照，否则每撤销一次就多一份几乎相同的历史。
 */
export function snapshotUndoAction(
  store: LibraryStore,
  snapshotId: string,
  text: SnapshotUndoText,
): ToastAction {
  return {
    label: text.label,
    onAction: () => {
      void store
        .restoreSnapshot(snapshotId, { saveCurrent: false })
        .catch(() => null)
        .then((result) => {
          if (result === null) toast.error({ title: text.failed });
          else toast.success({ title: text.done });
        });
    },
  };
}
