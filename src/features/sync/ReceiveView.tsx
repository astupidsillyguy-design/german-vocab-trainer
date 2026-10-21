import { Inbox } from 'lucide-react';
import { componentGeometry } from '../../design/tokens';
import type { Library } from '../../domain';
import { useI18n } from '../../i18n';
import type { ApplyPayload, SyncPhase, SyncSession } from '../../sync';
import { Button, ProgressBar, Spinner } from '../../ui';
import { progressPercent } from './progress';
import { OutcomeNotice, type OutcomeProps } from './SessionViews';
import { SyncPreview } from './SyncPreview';
import styles from './SyncSheet.module.css';

interface ReceiveViewProps extends OutcomeProps {
  readonly session: SyncSession;
  readonly phase: SyncPhase;
  readonly library: Library;
  readonly isReady: boolean;
  readonly apply: ApplyPayload;
}

/**
 * 接收方（F-078 – F-080）：等待 → 接收进度 → 预览并确认 → 写入（先保存快照，可撤销）。
 * 收到的数据在确认前不会写入词库。
 */
export function ReceiveView({
  session,
  phase,
  library,
  isReady,
  apply,
  ...outcome
}: ReceiveViewProps) {
  const { messages } = useI18n();
  const text = messages.sync.receive;

  if (phase.name === 'reviewing') {
    return (
      <>
        <h3 className={styles.sectionTitle} tabIndex={-1} data-view-title>
          {text.previewHeader}
        </h3>
        <SyncPreview library={library} payload={phase.payload} />
        <div className={styles.footer}>
          <Button
            variant="filled"
            size="lg"
            isDisabled={!isReady}
            onPress={() => {
              session.accept(apply);
            }}
          >
            {text.accept}
          </Button>
          <Button
            variant="glass"
            size="lg"
            onPress={() => {
              session.decline();
            }}
          >
            {text.decline}
          </Button>
        </div>
      </>
    );
  }

  if (phase.name === 'receiving') {
    return (
      <div className={styles.centered}>
        <h3 className={styles.viewTitle} tabIndex={-1} data-view-title>
          {text.receiving}
        </h3>
        <ProgressBar
          className={styles.progress}
          label={text.receiving}
          hideLabel
          value={progressPercent(phase.progress)}
        />
      </div>
    );
  }

  if (phase.name === 'applying') {
    return (
      <div className={styles.centered}>
        <Spinner size="lg" decorative />
        <h3 className={styles.viewTitle} tabIndex={-1} data-view-title>
          {text.applying}
        </h3>
      </div>
    );
  }

  return (
    <>
      <div className={styles.centered}>
        <Inbox className={styles.waitingIcon} size={componentGeometry.iconLg} aria-hidden />
        <h3 className={styles.viewTitle} tabIndex={-1} data-view-title>
          {text.waiting}
        </h3>
        <p className={styles.note}>{text.waitingDescription}</p>
      </div>
      <OutcomeNotice side="receive" {...outcome} />
    </>
  );
}
