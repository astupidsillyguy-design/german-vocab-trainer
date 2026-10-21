import {
  Archive,
  CircleCheck,
  ClipboardCheck,
  PartyPopper,
  PenLine,
  RotateCcw,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { componentGeometry } from '../../design/tokens';
import {
  isRoundPassed,
  tallyOf,
  unitArchiveStatus,
  wrongAnswers,
  type QuizSession,
} from '../../domain';
import { useI18n, type Messages } from '../../i18n';
import { Button, Surface, toast, useSizeClass } from '../../ui';
import { snapshotUndoAction, useLibraryState, useLibraryStore } from '../library';
import { useAppNavigation } from '../navigation';
import { useQuizStore } from './context';
import { QuizScopeRow } from './QuizHeader';
import { WrongAnswerReview } from './WrongAnswerReview';
import styles from './RoundResult.module.css';

function summaryOf(
  session: QuizSession,
  passed: boolean,
  text: Messages['quiz']['result'],
): string {
  const locked = session.lockedIds.length;
  if (passed) return session.round > 1 ? text.retestPassed(locked) : text.firstRoundPassed;
  return session.round > 1 ? text.retestFailed(locked) : text.firstRoundFailed(locked);
}

interface NoteProps {
  readonly children: ReactNode;
  /** 刚刚出现时把焦点移到这里（例如归档后原来的按钮消失） */
  readonly focusOnMount?: boolean;
}

/** 结果说明：通关时为绿色提示块 */
function Note({ children, focusOnMount = false }: NoteProps) {
  // 回调保持稳定：只在元素挂载时调用一次，之后重新渲染不会再抢焦点
  const focusRef = useCallback(
    (node: HTMLParagraphElement | null) => {
      if (focusOnMount) node?.focus();
    },
    [focusOnMount],
  );
  return (
    <p className={styles.note} tabIndex={focusOnMount ? -1 : undefined} ref={focusRef}>
      <CircleCheck size={componentGeometry.iconMd} aria-hidden className={styles.noteIcon} />
      <span>{children}</span>
    </p>
  );
}

interface ResultActionsProps {
  readonly session: QuizSession;
}

/** 未通关：重测固定错词集（F-033）或重新完整测试（F-034） */
function RetryActions({ session }: ResultActionsProps) {
  const { messages } = useI18n();
  const text = messages.quiz.result;
  const quiz = useQuizStore();
  return (
    <div className={styles.actions}>
      {session.lockedIds.length > 0 && (
        <Button
          variant="filled"
          size="lg"
          fullWidth
          leadingIcon={<RotateCcw size={componentGeometry.iconMd} aria-hidden />}
          onPress={() => {
            quiz.retest();
          }}
        >
          {text.retest(session.lockedIds.length)}
        </Button>
      )}
      <Button
        variant="tinted"
        size="lg"
        fullWidth
        onPress={() => {
          quiz.restartFull();
        }}
      >
        {text.restartFull}
      </Button>
    </div>
  );
}

/** 通关后再测一遍（不影响归档） */
function RetestUnitButton() {
  const { messages } = useI18n();
  const quiz = useQuizStore();
  return (
    <Button
      variant="plain"
      size="lg"
      fullWidth
      onPress={() => {
        quiz.restartFull();
      }}
    >
      {messages.quiz.result.retestUnit}
    </Button>
  );
}

/** F-036 待测库通关：一键归档（可撤销）；归档后引导录入新词或查看归档库 */
function ArchiveActions({ session }: ResultActionsProps) {
  const { messages } = useI18n();
  const text = messages.quiz.result;
  const quiz = useQuizStore();
  const store = useLibraryStore();
  const { library } = useLibraryState();
  const navigation = useAppNavigation();
  const status = useMemo(
    () => unitArchiveStatus(library, session.questions),
    [library, session.questions],
  );
  // 只在按下“归档”之后移动焦点（刷新后直接看到“已归档”时不抢焦点）
  const [hasArchived, setHasArchived] = useState(false);

  const archive = (): void => {
    const result = quiz.archiveUnit();
    if (result === null) {
      toast.error({ title: text.archiveFailed });
      return;
    }
    setHasArchived(true);
    void result.saving.then(
      ({ snapshotId }) => {
        toast.success({
          title: text.archivedToast(result.archived),
          description: text.archivedToastDescription,
          ...(snapshotId === null
            ? {}
            : {
                action: snapshotUndoAction(store, snapshotId, {
                  label: messages.common.undo,
                  done: text.archiveUndone,
                  failed: messages.settings.snapshots.failed,
                }),
              }),
        });
      },
      () => {
        toast.error({ title: text.archiveFailed });
      },
    );
  };

  if (status.pending.length > 0) {
    return (
      <>
        <Note key="pending">{text.archiveDescription(status.pending.length)}</Note>
        <div className={styles.actions}>
          <Button
            variant="filled"
            size="lg"
            fullWidth
            leadingIcon={<Archive size={componentGeometry.iconMd} aria-hidden />}
            onPress={archive}
          >
            {text.archive(status.pending.length)}
          </Button>
          <RetestUnitButton />
        </div>
      </>
    );
  }

  return (
    <>
      <Note key="archived" focusOnMount={hasArchived}>
        {status.archived > 0 ? text.archived(status.archived) : text.notInPool}
      </Note>
      <div className={styles.actions}>
        <Button
          variant="filled"
          size="lg"
          fullWidth
          leadingIcon={<PenLine size={componentGeometry.iconMd} aria-hidden />}
          onPress={() => {
            navigation.navigate('words');
          }}
        >
          {text.newWords}
        </Button>
        <Button
          variant="tinted"
          size="lg"
          fullWidth
          leadingIcon={<Archive size={componentGeometry.iconMd} aria-hidden />}
          onPress={() => {
            navigation.navigate('archive');
          }}
        >
          {text.viewArchive}
        </Button>
      </div>
    </>
  );
}

/** F-037 从归档库发起的复习通关：无需再次归档，“完成”返回归档页 */
function ArchiveReviewActions({ session }: ResultActionsProps) {
  const { messages } = useI18n();
  const text = messages.quiz.result;
  const navigation = useAppNavigation();
  return (
    <>
      <Note>{text.archiveReviewDescription(session.questions.length)}</Note>
      <div className={styles.actions}>
        <Button
          variant="filled"
          size="lg"
          fullWidth
          onPress={() => {
            navigation.navigate('archive');
          }}
        >
          {text.done}
        </Button>
        <RetestUnitButton />
      </div>
    </>
  );
}

export interface RoundResultProps {
  readonly session: QuizSession;
}

/** F-030 – F-037 本轮结果：正确率与得分、错题集、重测 / 重新完整测试 / 一键归档 */
export function RoundResult({ session }: RoundResultProps) {
  const { locale, messages } = useI18n();
  const text = messages.quiz.result;
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sizeClass = useSizeClass();
  const percent = useMemo(() => new Intl.NumberFormat(locale, { style: 'percent' }), [locale]);
  const tally = tallyOf(session);
  const passed = isRoundPassed(session);
  const wrong = passed ? [] : wrongAnswers(session);

  useEffect(() => {
    // 最后一题之后输入框随题卡卸载，焦点落回 body：移到结果标题，读屏从这里读起，Tab 进入后续操作
    if (document.activeElement === document.body) headingRef.current?.focus();
  }, []);

  let actions: ReactNode;
  if (!passed) actions = <RetryActions session={session} />;
  else if (session.scope.source === 'archive') actions = <ArchiveReviewActions session={session} />;
  else actions = <ArchiveActions session={session} />;

  return (
    <section
      className={styles.result}
      aria-labelledby={headingId}
      data-outcome={passed ? 'passed' : 'failed'}
      data-size-class={sizeClass}
    >
      <QuizScopeRow session={session} />
      <Surface material="regular" radius="xl" elevation={1} className={styles.card}>
        <div className={styles.hero}>
          <div className={styles.icon} aria-hidden>
            {passed ? (
              <PartyPopper size={componentGeometry.iconLg} />
            ) : (
              <ClipboardCheck size={componentGeometry.iconLg} />
            )}
          </div>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
            {passed ? text.passedTitle : text.failedTitle}
          </h2>
          <p className={styles.summary}>{summaryOf(session, passed, text)}</p>
        </div>
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>{text.accuracy}</dt>
            <dd className={styles.statValue} data-tone="tint">
              {percent.format(tally.total === 0 ? 0 : tally.correct / tally.total)}
            </dd>
          </div>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>{text.score}</dt>
            <dd className={styles.statValue}>{text.scoreValue(tally.correct, tally.total)}</dd>
          </div>
        </dl>
        {actions}
      </Surface>
      {wrong.length > 0 && <WrongAnswerReview items={wrong} />}
    </section>
  );
}
