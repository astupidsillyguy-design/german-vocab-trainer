import { CloudOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { componentGeometry } from '../../design/tokens';
import { applySyncPayload, type Library } from '../../domain';
import { useI18n, type Messages } from '../../i18n';
import {
  SyncSession,
  type ApplyPayload,
  type SyncPhase,
  type SyncRole,
  type SyncState,
} from '../../sync';
import { AlertDialog, Badge, EmptyState, Sheet, announce, toast } from '../../ui';
import {
  snapshotUndoAction,
  useLibraryState,
  useLibraryStore,
  type SnapshotUndoText,
} from '../library';
import { ConnectingView, EndedView, PeerBar } from './SessionViews';
import { defaultSyncEnvironment } from './defaultEnvironment';
import type { SyncEnvironment, SyncEnvironmentFactory } from './environment';
import { PairingView } from './PairingView';
import { ReceiveView } from './ReceiveView';
import { RoleChooser } from './RoleChooser';
import { SendView } from './SendView';
import styles from './SyncSheet.module.css';

export interface SyncSheetProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** 打开后自动连接的对方配对码 */
  readonly initialCode: string | null;
  readonly environment?: SyncEnvironmentFactory;
}

/** 数据正在传输、等待确认或写入：关闭面板或断开前需要确认 */
const BUSY_PHASES = new Set<SyncPhase['name']>([
  'sending',
  'awaiting',
  'receiving',
  'reviewing',
  'applying',
]);

type PendingExit = 'close' | 'disconnect';

function undoTextOf(messages: Messages): SnapshotUndoText {
  const text = messages.sync.receive;
  return { label: text.undo, done: text.undone, failed: text.undoFailed };
}

const NO_STATE = (): null => null;
const NO_SUBSCRIPTION = (): (() => void) => () => undefined;

function useSessionState(session: SyncSession | null): SyncState | null {
  return useSyncExternalStore(
    session?.subscribe ?? NO_SUBSCRIPTION,
    session?.getState ?? NO_STATE,
    session?.getState ?? NO_STATE,
  );
}

function createSession(environment: SyncEnvironment, role: SyncRole): SyncSession | null {
  const { signaling, peers, device, timeouts, chunkBytes } = environment;
  if (peers === null) return null;
  return new SyncSession({
    role,
    signaling,
    peers,
    device,
    ...(timeouts === undefined ? {} : { timeouts }),
    ...(chunkBytes === undefined ? {} : { chunkBytes }),
  });
}

/** 视图切换后，原来获得焦点的按钮可能已经消失：把焦点移到新视图的标题，否则播报标题 */
function useViewFocus(viewKey: string) {
  const regionRef = useRef<HTMLDivElement>(null);
  const previousKey = useRef(viewKey);
  useEffect(() => {
    if (previousKey.current === viewKey) return;
    previousKey.current = viewKey;
    const title = regionRef.current?.querySelector<HTMLElement>('[data-view-title]');
    if (title === null || title === undefined) return;
    const active = document.activeElement;
    if (active === null || active === document.body) title.focus();
    else if (title.textContent !== '') announce(title.textContent);
  }, [viewKey]);
  return regionRef;
}

/**
 * 设备同步面板（F-070 – F-081）：选择角色 → 配对 → 直连 → 推送 / 预览确认 → 断开。
 * 会话在选择角色后创建，面板关闭时结束（通知对方并释放连接）；每次打开都是新的面板。
 */
export function SyncSheet({
  isOpen,
  onOpenChange,
  initialCode,
  environment = defaultSyncEnvironment,
}: SyncSheetProps) {
  const { messages } = useI18n();
  const text = messages.sync;
  const store = useLibraryStore();
  const library = useLibraryState();
  const [env] = useState(environment);
  const [session, setSession] = useState<SyncSession | null>(null);
  const state = useSessionState(session);
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
  /** 已撤销的同步（快照 id）：撤销按钮随之隐藏 */
  const [undone, setUndone] = useState<string | null>(null);
  const autoJoin = useRef(initialCode);

  // 面板关闭（或卸载）时结束会话
  useEffect(() => {
    if (session === null || !isOpen) return;
    return () => {
      session.dispose();
    };
  }, [session, isOpen]);

  // 从配对链接打开：信令连上、本机配对码就绪后自动连接对方
  useEffect(() => {
    const code = autoJoin.current;
    if (session === null || code === null) return;
    if (state?.phase.name !== 'pairing' || state.phase.code === null) return;
    autoJoin.current = null;
    session.join(code);
  }, [session, state]);

  const apply = useCallback<ApplyPayload>(
    async (payload) => {
      const { snapshotId } = await store.update((current) => applySyncPayload(current, payload), {
        snapshot: 'sync',
      });
      const { results } = messages.sync.receive;
      // 面板可能已经关闭：通知上同样可以撤销
      if (snapshotId === null) toast.show({ title: results.unchanged });
      else {
        toast.success({
          title: results.applied(payload.entries.length),
          action: snapshotUndoAction(store, snapshotId, undoTextOf(messages)),
        });
      }
      return snapshotId;
    },
    [store, messages],
  );

  const undo = (snapshotId: string): void => {
    snapshotUndoAction(store, snapshotId, undoTextOf(messages)).onAction();
    setUndone(snapshotId);
  };

  const isBusy = state !== null && BUSY_PHASES.has(state.phase.name);

  const handleOpenChange = (open: boolean): void => {
    if (!open && isBusy) setPendingExit('close');
    else onOpenChange(open);
  };

  const disconnect = (): void => {
    if (isBusy) setPendingExit('disconnect');
    else session?.disconnect();
  };

  const confirmExit = (): void => {
    if (pendingExit === 'close') onOpenChange(false);
    else session?.disconnect();
    setPendingExit(null);
  };

  const content =
    env.peers === null ? (
      <EmptyState
        icon={<CloudOff size={componentGeometry.iconLg} />}
        title={text.unsupported.title}
        description={text.unsupported.description}
        headingLevel={3}
      />
    ) : session === null || state === null ? (
      <RoleChooser
        pendingCode={initialCode}
        onChoose={(role) => {
          setSession(createSession(env, role));
        }}
      />
    ) : (
      <SessionView
        session={session}
        state={state}
        isLibraryReady={library.status === 'ready'}
        library={library.library}
        apply={apply}
        undone={undone}
        onUndo={undo}
        onDisconnect={disconnect}
        initialCode={initialCode}
      />
    );

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        title={text.title}
        defaultDetent="large"
        isDismissable={!isBusy}
        actions={state === null ? undefined : <StatusBadge state={state} />}
      >
        {content}
      </Sheet>
      <AlertDialog
        isOpen={pendingExit !== null}
        onOpenChange={(open) => {
          if (!open) setPendingExit(null);
        }}
        title={text.leave.title}
        confirmLabel={
          pendingExit === 'disconnect' ? text.leave.confirmDisconnect : text.leave.confirm
        }
        tone="destructive"
        onConfirm={confirmExit}
      >
        {text.leave.message}
      </AlertDialog>
    </>
  );
}

function StatusBadge({ state }: { readonly state: SyncState }) {
  const { messages } = useI18n();
  const text = messages.sync.status;
  const { phase } = state;
  if (phase.name === 'pairing') {
    return phase.joining === null ? null : <Badge>{text.connecting}</Badge>;
  }
  if (phase.name === 'connecting') return <Badge>{text.connecting}</Badge>;
  if (phase.name === 'ended') return <Badge>{text.ended}</Badge>;
  return <Badge tone="success">{text.connected}</Badge>;
}

interface SessionViewProps {
  readonly session: SyncSession;
  readonly state: SyncState;
  readonly library: Library;
  readonly isLibraryReady: boolean;
  readonly apply: ApplyPayload;
  readonly undone: string | null;
  readonly onUndo: (snapshotId: string) => void;
  readonly onDisconnect: () => void;
  readonly initialCode: string | null;
}

function SessionView({
  session,
  state,
  library,
  isLibraryReady,
  apply,
  undone,
  onUndo,
  onDisconnect,
  initialCode,
}: SessionViewProps) {
  const { phase } = state;
  const viewKey = `${state.role}:${phase.name}`;
  const regionRef = useViewFocus(viewKey);
  const outcome = { outcome: state.outcome, undone, onUndo };

  let view;
  switch (phase.name) {
    case 'pairing':
      view = (
        <PairingView session={session} state={state} phase={phase} initialCode={initialCode} />
      );
      break;
    case 'connecting':
      view = (
        <ConnectingView
          onCancel={() => {
            session.cancelConnect();
          }}
        />
      );
      break;
    case 'ended':
      view = (
        <EndedView
          reason={phase.reason}
          role={state.role}
          {...outcome}
          onReconnect={() => {
            session.restart();
          }}
        />
      );
      break;
    default:
      view = (
        <>
          <PeerBar peer={state.peer} onDisconnect={onDisconnect} />
          {state.role === 'send' ? (
            <SendView
              session={session}
              phase={phase}
              library={library}
              isReady={isLibraryReady}
              {...outcome}
            />
          ) : (
            <ReceiveView
              session={session}
              phase={phase}
              library={library}
              isReady={isLibraryReady}
              apply={apply}
              {...outcome}
            />
          )}
        </>
      );
  }

  return (
    <div ref={regionRef} className={styles.body}>
      {view}
    </div>
  );
}
