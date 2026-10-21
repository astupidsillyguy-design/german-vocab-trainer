import { Pencil, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { componentGeometry } from '../../design/tokens';
import type { Entry } from '../../domain';
import { useI18n } from '../../i18n';
import { IconButton, useDoublePress } from '../../ui';
import { SpeakButton } from '../quiz';
import { focusKeyProps } from './focus';
import { useArchiveView } from './view';
import styles from './ArchivePage.module.css';

const ALTERNATIVES_SEPARATOR = ' / ';

export interface EntryRowProps {
  readonly entry: Entry;
}

/**
 * 词条行（F-047）：德语（标注 lang="de"）、其他可接受答案、释义与归档日期，右侧发音。
 * 编辑模式下双击整行即可修改（F-050，与原版一致）；铅笔按钮是同一操作的键盘与读屏入口。
 */
export function EntryRow({ entry }: EntryRowProps) {
  const { messages } = useI18n();
  const text = messages.archive;
  const view = useArchiveView();
  const rowRef = useRef<HTMLLIElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [word, ...alternatives] = entry.answers;
  const isEditing = view.mode === 'edit';

  useDoublePress(
    rowRef,
    () => {
      // 双击文字本身不可聚焦：先建立等价的键盘入口，Sheet 关闭后才会回到这条词。
      editButtonRef.current?.focus({ preventScroll: true });
      view.openEdit(entry);
    },
    { isDisabled: !isEditing },
  );

  return (
    <li ref={rowRef} className={styles.entry} data-mode={view.mode}>
      <div className={styles.entryText}>
        <span className={styles.word} lang="de">
          {word}
        </span>
        {alternatives.length > 0 && (
          <span className={styles.alternatives} lang="de">
            {alternatives.join(ALTERNATIVES_SEPARATOR)}
          </span>
        )}
        <span className={styles.prompt}>{entry.prompt}</span>
        <span className={styles.meta}>
          {entry.archivedAt === null ? (
            text.mastered
          ) : (
            <time dateTime={entry.archivedAt}>
              {text.archivedOn(view.formatDate(entry.archivedAt))}
            </time>
          )}
        </span>
      </div>
      <div className={styles.entryActions}>
        <SpeakButton text={word} iconOnly />
        {isEditing && (
          <IconButton
            ref={editButtonRef}
            size="sm"
            variant="tinted"
            icon={<Pencil size={componentGeometry.iconSm} />}
            label={text.edit.label(word)}
            {...focusKeyProps({ kind: 'entry', id: entry.id })}
            onPress={() => {
              view.openEdit(entry);
            }}
          />
        )}
        {view.mode === 'delete' && (
          <IconButton
            size="sm"
            variant="destructive"
            icon={<Trash2 size={componentGeometry.iconSm} />}
            label={text.remove.entryLabel(word)}
            {...focusKeyProps({ kind: 'entry', id: entry.id })}
            onPress={() => {
              view.openRemove({ kind: 'entry', id: entry.id }, word);
            }}
          />
        )}
      </div>
    </li>
  );
}
