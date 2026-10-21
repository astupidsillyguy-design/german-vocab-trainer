import { Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { componentGeometry } from '../../design/tokens';
import {
  SYNC_MODES,
  buildSyncPayload,
  groupEntries,
  lessonKey,
  pruneSelection,
  selectedLessons,
  type Library,
  type SyncMode,
  type SyncScope,
} from '../../domain';
import { useI18n } from '../../i18n';
import type { SyncPhase, SyncSession } from '../../sync';
import { Button, ProgressBar, SegmentedControl, Spinner } from '../../ui';
import { LessonPicker } from './LessonPicker';
import { OutcomeNotice, type OutcomeProps } from './SessionViews';
import { progressPercent } from './progress';
import styles from './SyncSheet.module.css';

interface SendViewProps extends OutcomeProps {
  readonly session: SyncSession;
  readonly phase: SyncPhase;
  readonly library: Library;
  readonly isReady: boolean;
}

/**
 * 发送方（F-076）：选择整库或按课时，推送给对方；显示发送进度与对方的处理结果。
 * 只同步归档库与归档排序，待测库不会发送。
 */
export function SendView({ session, phase, library, isReady, ...outcome }: SendViewProps) {
  const { messages } = useI18n();
  const text = messages.sync.send;
  const [mode, setMode] = useState<SyncMode>('full');
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const groups = useMemo(() => groupEntries(library.archive, library.order), [library]);
  // 连接期间归档库可能在其他标签页中被修改：去掉已不存在的课时
  const selected = pruneSelection(picked, groups);
  const lessons = selectedLessons(groups, selected);
  const selectedEntries = groups
    .flatMap((group) => group.lessons)
    .filter(({ chapter, lesson }) => selected.has(lessonKey(chapter, lesson)))
    .reduce((total, lesson) => total + lesson.entries.length, 0);
  const count = mode === 'full' ? library.archive.length : selectedEntries;
  const isTransferring = phase.name === 'sending' || phase.name === 'awaiting';
  const isEmpty = library.archive.length === 0;

  const push = (): void => {
    const scope: SyncScope = mode === 'full' ? { mode: 'full' } : { mode: 'lessons', lessons };
    session.push(buildSyncPayload(library, scope));
  };

  const modeItems = SYNC_MODES.map((id) => ({
    id,
    label: id === 'full' ? text.full : text.lessons,
  }));

  return (
    <>
      <h3 className={styles.sectionTitle} tabIndex={-1} data-view-title>
        {text.scopeLabel}
      </h3>
      {isEmpty ? (
        <p className={styles.note}>{text.empty}</p>
      ) : (
        <>
          <SegmentedControl
            label={text.scopeLabel}
            items={modeItems}
            selectedKey={mode}
            isDisabled={isTransferring}
            onSelectionChange={setMode}
          />
          {mode === 'full' ? (
            <p className={styles.note}>
              {text.fullDescription(library.archive.length, groups.length)}
            </p>
          ) : (
            <>
              <p className={styles.note}>{text.lessonsDescription}</p>
              <LessonPicker
                groups={groups}
                selected={selected}
                onChange={setPicked}
                isDisabled={isTransferring}
                summary={text.selection(lessons.length, selectedEntries)}
              />
            </>
          )}
        </>
      )}

      <div className={styles.footer}>
        {phase.name === 'sending' ? (
          <>
            <ProgressBar label={text.sending} value={progressPercent(phase.progress)} />
            <Button
              variant="glass"
              onPress={() => {
                session.cancelPush();
              }}
            >
              {text.cancel}
            </Button>
          </>
        ) : phase.name === 'awaiting' ? (
          <>
            <div className={styles.status} role="status">
              <Spinner size="sm" decorative />
              <span>{text.awaiting}</span>
            </div>
            <Button
              variant="glass"
              onPress={() => {
                session.cancelPush();
              }}
            >
              {text.cancel}
            </Button>
          </>
        ) : (
          <Button
            variant="filled"
            size="lg"
            leadingIcon={<Send size={componentGeometry.iconMd} />}
            isDisabled={!isReady || isEmpty || count === 0}
            onPress={push}
          >
            {text.push(count)}
          </Button>
        )}
        <OutcomeNotice side="send" {...outcome} />
      </div>
    </>
  );
}
