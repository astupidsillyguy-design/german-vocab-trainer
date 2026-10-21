import { CircleAlert, CircleCheck, Smartphone, Unplug } from 'lucide-react';
import { componentGeometry } from '../../design/tokens';
import { useI18n } from '../../i18n';
import type { SyncEndReason, SyncOutcome, SyncRole } from '../../sync';
import { Button, Spinner } from '../../ui';
import styles from './SyncSheet.module.css';

/** 结果提示与撤销（接收方写入后可以撤销，断开后也可以） */
export interface OutcomeProps {
  readonly outcome: SyncOutcome | null;
  /** 已撤销的同步（快照 id） */
  readonly undone: string | null;
  readonly onUndo: (snapshotId: string) => void;
}

const SUCCESS_RESULTS = new Set<SyncOutcome['result']>(['applied']);
const NEUTRAL_RESULTS = new Set<SyncOutcome['result']>(['declined', 'cancelled']);

function useOutcomeText(role: SyncRole, outcome: SyncOutcome): string {
  const { messages } = useI18n();
  const text = messages.sync;
  if (role === 'send') {
    return outcome.result === 'applied'
      ? text.send.results.applied(outcome.entries)
      : text.send.results[outcome.result];
  }
  if (outcome.result !== 'applied') return text.receive.results[outcome.result];
  return outcome.snapshotId === null
    ? text.receive.results.unchanged
    : text.receive.results.applied(outcome.entries);
}

interface OutcomeNoticeProps extends OutcomeProps {
  /** 本机的角色 */
  readonly side: SyncRole;
}

export function OutcomeNotice({ side, outcome, undone, onUndo }: OutcomeNoticeProps) {
  if (outcome === null) return null;
  return <OutcomeMessage side={side} outcome={outcome} undone={undone} onUndo={onUndo} />;
}

function OutcomeMessage({
  side,
  outcome,
  undone,
  onUndo,
}: OutcomeNoticeProps & { readonly outcome: SyncOutcome }) {
  const { messages } = useI18n();
  const text = messages.sync.receive;
  const message = useOutcomeText(side, outcome);
  const { snapshotId } = outcome;
  const isSuccess = SUCCESS_RESULTS.has(outcome.result);
  const tone = isSuccess ? 'success' : NEUTRAL_RESULTS.has(outcome.result) ? 'neutral' : 'danger';
  const canUndo = side === 'receive' && isSuccess && snapshotId !== null;
  const isUndone = canUndo && undone === snapshotId;
  const Icon = tone === 'danger' ? CircleAlert : CircleCheck;
  return (
    <div className={styles.outcome} data-tone={tone}>
      <Icon className={styles.outcomeIcon} size={componentGeometry.iconMd} aria-hidden />
      <p className={styles.outcomeText}>{isUndone ? text.undone : message}</p>
      {canUndo && !isUndone && (
        <Button
          size="sm"
          variant="tinted"
          onPress={() => {
            onUndo(snapshotId);
          }}
        >
          {text.undo}
        </Button>
      )}
    </div>
  );
}

interface PeerBarProps {
  readonly peer: string | null;
  readonly onDisconnect: () => void;
}

/** 已连接的设备（便于确认连上的是自己的另一台设备）与断开按钮（F-081） */
export function PeerBar({ peer, onDisconnect }: PeerBarProps) {
  const { messages } = useI18n();
  const text = messages.sync;
  return (
    <div className={styles.peerBar}>
      <Smartphone className={styles.peerIcon} size={componentGeometry.iconMd} aria-hidden />
      <span className={styles.peerName}>{peer === null ? text.peerUnknown : text.peer(peer)}</span>
      <Button size="sm" variant="plain" onPress={onDisconnect}>
        {text.disconnect}
      </Button>
    </div>
  );
}

export function ConnectingView({ onCancel }: { readonly onCancel: () => void }) {
  const { messages } = useI18n();
  const text = messages.sync.connecting;
  return (
    <div className={styles.centered}>
      <Spinner size="lg" decorative />
      <h3 className={styles.viewTitle} tabIndex={-1} data-view-title>
        {text.title}
      </h3>
      <p className={styles.note}>{text.description}</p>
      <Button variant="glass" onPress={onCancel}>
        {messages.common.cancel}
      </Button>
    </div>
  );
}

interface EndedViewProps extends OutcomeProps {
  readonly reason: SyncEndReason;
  readonly role: SyncRole;
  readonly onReconnect: () => void;
}

/** 会话已结束：说明原因；刚才的同步仍可撤销，也可以重新配对 */
export function EndedView({ reason, role, onReconnect, ...outcome }: EndedViewProps) {
  const { messages } = useI18n();
  const text = messages.sync.ended;
  return (
    <>
      <div className={styles.centered}>
        <Unplug className={styles.endedIcon} size={componentGeometry.iconLg} aria-hidden />
        <h3 className={styles.viewTitle} tabIndex={-1} data-view-title>
          {text[reason]}
        </h3>
        <Button variant="filled" onPress={onReconnect}>
          {text.reconnect}
        </Button>
      </div>
      <OutcomeNotice side={role} {...outcome} />
    </>
  );
}
