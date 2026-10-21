/**
 * 一次设备同步会话（F-070 – F-081）：配对 → 建立直连 → 推送 / 预览 / 写入 → 断开。
 *
 * 两台设备都先选择角色（发送 / 接收），各自显示自己的配对码；任意一方输入对方的配对码即可连接。
 * 被加入的一方（主机）创建数据通道并发出 offer，加入方应答；连接信息经信令交换，
 * 数据通道打开并互相确认（hello）后立即断开信令，之后的数据只在两台设备之间传输。
 *
 * 会话与界面框架无关：状态通过 getState / subscribe 读取（适合 useSyncExternalStore），
 * 写入词库由调用方在 accept() 中完成，会话本身不依赖存储。
 */
import { newId, type SyncMode, type SyncPayload } from '../domain';
import { SYNC_PROTOCOL, SYNC_TIMEOUTS, TRANSFER_LIMITS, type SyncTimeouts } from './constants';
import {
  parseChannelMessage,
  parseSignal,
  type ChannelMessage,
  type PushHeader,
  type RejectReason,
  type SignalBody,
  type SignalMessage,
  type SyncRole,
  type TransferResult,
} from './messages';
import { isPairingCode, newPairingCode } from '../shared/pairing';
import type { PeerCloseReason, PeerFactory, PeerLink } from './peer';
import type { SignalingAdapter, SignalingConnection } from './signaling';
import {
  TransferAssembler,
  chunkFrame,
  isConsistentHeader,
  prepareTransfer,
  type PreparedTransfer,
} from './transfer';

/** 当前步骤中出现的问题（可以重试，不会结束会话） */
export type SyncProblem =
  /** 无法连接信令服务器，或连接中断 */
  | 'signaling-unavailable'
  /** 输入配对码后对方没有应答 */
  | 'no-peer'
  /** 对方正在与其他设备同步 */
  | 'busy'
  /** 加入时发现两台设备选择了相同的角色 */
  | 'same-role'
  /** 有设备以相同的角色尝试加入本机 */
  | 'peer-same-role'
  /** 对方的应用版本不兼容 */
  | 'version'
  /** 无法建立点对点直连 */
  | 'p2p-failed'
  /** 对方取消了正在建立的连接 */
  | 'peer-cancelled';

export type SyncEndReason =
  /** 对方断开了连接 */
  | 'peer-left'
  /** 连接意外中断 */
  | 'connection-lost'
  /** 本机断开了连接 */
  | 'disconnected';

export interface TransferProgress {
  readonly done: number;
  readonly total: number;
}

export type SyncPhase =
  /** 配对：code 为 null 表示还在连接信令服务器；joining 是正在加入的对方配对码 */
  | { readonly name: 'pairing'; readonly code: string | null; readonly joining: string | null }
  /** 正在建立直连 */
  | { readonly name: 'connecting' }
  /** 已连接，空闲 */
  | { readonly name: 'connected' }
  /** 发送方：正在发送 */
  | { readonly name: 'sending'; readonly mode: SyncMode; readonly progress: TransferProgress }
  /** 发送方：已送达，等待对方确认 */
  | { readonly name: 'awaiting'; readonly mode: SyncMode }
  /** 接收方：正在接收 */
  | { readonly name: 'receiving'; readonly mode: SyncMode; readonly progress: TransferProgress }
  /** 接收方：数据已通过校验，等待用户确认 */
  | { readonly name: 'reviewing'; readonly payload: SyncPayload }
  /** 接收方：正在写入 */
  | { readonly name: 'applying' }
  | { readonly name: 'ended'; readonly reason: SyncEndReason };

export type SyncOutcomeResult = TransferResult | 'cancelled' | 'interrupted';

/** 最近一次传输的结果 */
export interface SyncOutcome {
  readonly result: SyncOutcomeResult;
  readonly mode: SyncMode;
  readonly entries: number;
  /** 接收方写入前保存的快照（用于撤销）；没有变化或未写入时为 null */
  readonly snapshotId: string | null;
}

export interface SyncState {
  readonly role: SyncRole;
  readonly phase: SyncPhase;
  /** 对方设备的描述（如 “iPhone · Safari”）；未连接或对方未提供时为 null */
  readonly peer: string | null;
  readonly problem: SyncProblem | null;
  /** 新的传输开始时清除；会话结束后仍保留（断开后也能撤销刚才的覆盖） */
  readonly outcome: SyncOutcome | null;
}

/** 写入收到的数据，返回写入前保存的快照 id（没有变化时为 null） */
export type ApplyPayload = (payload: SyncPayload) => Promise<string | null>;

export interface SyncSessionOptions {
  readonly role: SyncRole;
  readonly signaling: SignalingAdapter;
  readonly peers: PeerFactory;
  /** 本机设备描述，连接后显示给对方 */
  readonly device: string | null;
  readonly timeouts?: Partial<SyncTimeouts>;
  readonly random?: Pick<Crypto, 'getRandomValues'>;
  readonly chunkBytes?: number;
}

/** 进度只按百分比更新，避免每一片都触发重新渲染 */
const PROGRESS_STEPS = 100;

/** 取消正在进行的发送时，发送循环据此停止 */
interface Outgoing {
  readonly id: string;
  readonly mode: SyncMode;
  readonly entries: number;
}

interface Incoming {
  readonly id: string;
  readonly assembler: TransferAssembler;
}

function newPeerId(): string {
  return newId().replaceAll('-', '');
}

const REJECT_PROBLEMS = {
  busy: 'busy',
  'same-role': 'same-role',
  version: 'version',
} as const satisfies Record<RejectReason, SyncProblem>;

export class SyncSession {
  readonly #options: SyncSessionOptions;
  readonly #timeouts: SyncTimeouts;
  readonly #chunkBytes: number;
  readonly #selfId = newPeerId();
  readonly #listeners = new Set<() => void>();
  #state: SyncState;
  #disposed = false;
  /** 每次重新连接信令加一：旧连接迟到的回调据此忽略 */
  #attempt = 0;
  #signaling: SignalingConnection | null = null;
  /** 本机的配对码（房间） */
  #code: string | null = null;
  /** 正在与之协商或已连接的对方，以及对话所在的房间 */
  #peerId: string | null = null;
  #peerRoom: string | null = null;
  #link: PeerLink | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #outgoing: Outgoing | null = null;
  #incoming: Incoming | null = null;
  /** 接收方：正在预览或写入的推送 */
  #reviewing: PushHeader | null = null;
  #progressStep = -1;

  constructor(options: SyncSessionOptions) {
    this.#options = options;
    this.#timeouts = { ...SYNC_TIMEOUTS, ...options.timeouts };
    this.#chunkBytes = options.chunkBytes ?? TRANSFER_LIMITS.chunkBytes;
    this.#state = {
      role: options.role,
      phase: { name: 'pairing', code: null, joining: null },
      peer: null,
      problem: null,
      outcome: null,
    };
    this.#startPairing(null);
  }

  getState = (): SyncState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  // —— 配对 ——

  /** 更改角色：只能在配对阶段（未在加入其他设备时） */
  setRole(role: SyncRole): void {
    const { phase } = this.#state;
    if (phase.name !== 'pairing' || phase.joining !== null) return;
    this.#set({ role, problem: null });
  }

  /** 加入另一台设备：输入或扫描到的配对码 */
  join(code: string): void {
    const { phase } = this.#state;
    const signaling = this.#signaling;
    if (phase.name !== 'pairing' || phase.code === null || phase.joining !== null) return;
    if (signaling === null || !isPairingCode(code) || code === phase.code) return;
    this.#set({ phase: { ...phase, joining: code }, problem: null });
    signaling
      .join(code)
      .then(() => {
        if (!this.#isJoining(code)) return;
        this.#sendSignal(code, null, {
          kind: 'join',
          protocol: SYNC_PROTOCOL,
          role: this.#state.role,
          device: this.#options.device,
        });
        this.#startTimer(this.#timeouts.joinMs, () => {
          this.#stopJoining(code, 'no-peer');
        });
      })
      .catch(() => {
        if (this.#isJoining(code)) this.#onSignalingDrop();
      });
  }

  /** 取消正在进行的加入或连接，回到配对 */
  cancelConnect(): void {
    const { phase } = this.#state;
    if (phase.name === 'pairing' && phase.joining !== null) {
      this.#stopJoining(phase.joining, null);
    } else if (phase.name === 'connecting') {
      if (this.#peerRoom !== null && this.#peerId !== null) {
        this.#sendSignal(this.#peerRoom, this.#peerId, { kind: 'leave' });
      }
      this.#backToPairing(null);
    }
  }

  /** 重新开始配对：信令不可用时重试，或会话结束后重新连接（生成新的配对码） */
  restart(): void {
    if (this.#disposed) return;
    const { phase } = this.#state;
    const canRestart = phase.name === 'ended' || (phase.name === 'pairing' && phase.code === null);
    if (!canRestart) return;
    this.#teardownLink();
    this.#closeSignaling();
    this.#startPairing(null);
  }

  // —— 发送方 ——

  push(payload: SyncPayload): void {
    const link = this.#link;
    if (this.#state.role !== 'send' || this.#state.phase.name !== 'connected' || link === null) {
      return;
    }
    const id = newId();
    const prepared = prepareTransfer(id, payload, this.#chunkBytes);
    const outcome = (result: SyncOutcomeResult): SyncOutcome => ({
      result,
      mode: payload.mode,
      entries: payload.entries.length,
      snapshotId: null,
    });
    if (prepared === null) {
      this.#set({ outcome: outcome('invalid') });
      return;
    }
    this.#outgoing = { id, mode: payload.mode, entries: payload.entries.length };
    this.#progressStep = -1;
    this.#sendMessage({ ...prepared.header });
    this.#set({
      phase: {
        name: 'sending',
        mode: payload.mode,
        progress: { done: 0, total: prepared.bytes.length },
      },
      outcome: null,
    });
    void this.#sendChunks(link, prepared);
  }

  /** 发送方：取消正在进行的发送（含等待对方确认） */
  cancelPush(): void {
    const outgoing = this.#outgoing;
    const { phase } = this.#state;
    if (outgoing === null || (phase.name !== 'sending' && phase.name !== 'awaiting')) return;
    this.#outgoing = null;
    this.#sendMessage({ kind: 'cancel', id: outgoing.id });
    this.#set({
      phase: { name: 'connected' },
      outcome: {
        result: 'cancelled',
        mode: outgoing.mode,
        entries: outgoing.entries,
        snapshotId: null,
      },
    });
  }

  // —— 接收方 ——

  /** 接受并写入正在预览的数据 */
  accept(apply: ApplyPayload): void {
    const { phase } = this.#state;
    const header = this.#reviewing;
    if (phase.name !== 'reviewing' || header === null) return;
    const { payload } = phase;
    this.#set({ phase: { name: 'applying' } });
    const finish = (result: TransferResult, snapshotId: string | null): void => {
      if (this.#disposed) return;
      this.#reviewing = null;
      this.#sendMessage({ kind: 'result', id: header.id, result });
      const outcome: SyncOutcome = {
        result,
        mode: payload.mode,
        entries: payload.entries.length,
        snapshotId,
      };
      // 写入期间连接可能已经断开：保留“已结束”，只记下结果
      this.#set(
        this.#state.phase.name === 'applying'
          ? { phase: { name: 'connected' }, outcome }
          : { outcome },
      );
    };
    apply(payload).then(
      (snapshotId) => {
        finish('applied', snapshotId);
      },
      () => {
        finish('failed', null);
      },
    );
  }

  /** 拒绝正在预览的数据 */
  decline(): void {
    const { phase } = this.#state;
    const header = this.#reviewing;
    if (phase.name !== 'reviewing' || header === null) return;
    this.#reviewing = null;
    this.#sendMessage({ kind: 'result', id: header.id, result: 'declined' });
    this.#set({
      phase: { name: 'connected' },
      outcome: {
        result: 'declined',
        mode: phase.payload.mode,
        entries: phase.payload.entries.length,
        snapshotId: null,
      },
    });
  }

  // —— 断开 ——

  /** 断开连接（会话结束，之前的结果仍保留） */
  disconnect(): void {
    if (this.#link !== null) this.#sendMessage({ kind: 'bye' });
    this.#end('disconnected');
  }

  /** 关闭会话：通知对方并释放所有资源，之后不再更新状态 */
  dispose(): void {
    if (this.#disposed) return;
    if (this.#link !== null) this.#sendMessage({ kind: 'bye' });
    this.#disposed = true;
    this.#attempt += 1;
    this.#clearTimer();
    this.#teardownLink();
    this.#closeSignaling();
    this.#listeners.clear();
  }

  // —— 内部：信令 ——

  #startPairing(problem: SyncProblem | null): void {
    this.#attempt += 1;
    const attempt = this.#attempt;
    this.#code = null;
    this.#peerId = null;
    this.#peerRoom = null;
    this.#set({ phase: { name: 'pairing', code: null, joining: null }, peer: null, problem });
    const isCurrent = (): boolean => !this.#disposed && attempt === this.#attempt;
    let timedOut = false;
    this.#startTimer(this.#timeouts.signalingMs, () => {
      timedOut = true;
      this.#attempt += 1;
      this.#set({ problem: 'signaling-unavailable' });
    });
    this.#options.signaling
      .connect({
        onMessage: (room, text) => {
          if (isCurrent()) this.#onSignal(room, text);
        },
        onDrop: () => {
          if (isCurrent()) this.#onSignalingDrop();
        },
      })
      .then(async (connection) => {
        if (!isCurrent() || timedOut) {
          connection.close();
          return;
        }
        this.#signaling = connection;
        const code = newPairingCode(this.#options.random);
        await connection.join(code);
        if (!isCurrent()) return;
        this.#clearTimer();
        this.#code = code;
        const { phase } = this.#state;
        if (phase.name === 'pairing') this.#set({ phase: { ...phase, code } });
      })
      .catch(() => {
        if (!isCurrent()) return;
        this.#clearTimer();
        this.#closeSignaling();
        this.#set({ problem: 'signaling-unavailable' });
      });
  }

  #onSignalingDrop(): void {
    this.#closeSignaling();
    const { phase } = this.#state;
    // 直连协商中仍可能成功（候选已交换）；失败时再重新连接信令
    if (phase.name === 'connecting') return;
    if (phase.name === 'pairing') {
      this.#clearTimer();
      this.#attempt += 1;
      this.#code = null;
      this.#set({
        phase: { name: 'pairing', code: null, joining: null },
        problem: 'signaling-unavailable',
      });
    }
  }

  #closeSignaling(): void {
    this.#signaling?.close();
    this.#signaling = null;
  }

  #sendSignal(room: string, to: string | null, body: SignalBody): void {
    this.#signaling?.send(room, JSON.stringify({ ...body, from: this.#selfId, to }));
  }

  #isJoining(code: string): boolean {
    const { phase } = this.#state;
    return !this.#disposed && phase.name === 'pairing' && phase.joining === code;
  }

  #stopJoining(code: string, problem: SyncProblem | null): void {
    if (!this.#isJoining(code)) return;
    this.#clearTimer();
    this.#signaling?.leave(code);
    this.#set({ phase: { name: 'pairing', code: this.#code, joining: null }, problem });
  }

  #onSignal(room: string, text: string): void {
    const message = parseSignal(text);
    if (message === null || message.from === this.#selfId) return;
    if (message.to !== null && message.to !== this.#selfId) return;
    switch (message.kind) {
      case 'join':
        if (room === this.#code) this.#onJoinRequest(message);
        return;
      case 'accept':
        if (this.#isJoining(room)) this.#onAccepted(room, message);
        return;
      case 'reject':
        if (this.#isJoining(room)) this.#stopJoining(room, REJECT_PROBLEMS[message.reason]);
        return;
      default:
        if (message.from === this.#peerId && room === this.#peerRoom) this.#onPeerSignal(message);
    }
  }

  /** 主机：有设备输入了本机的配对码 */
  #onJoinRequest(message: Extract<SignalMessage, { readonly kind: 'join' }>): void {
    const room = this.#code;
    if (room === null) return;
    const reply = (body: SignalBody): void => {
      this.#sendSignal(room, message.from, body);
    };
    const { phase } = this.#state;
    if (phase.name !== 'pairing' || phase.joining !== null || this.#peerId !== null) {
      reply({ kind: 'reject', reason: 'busy' });
      return;
    }
    if (message.protocol !== SYNC_PROTOCOL) {
      reply({ kind: 'reject', reason: 'version' });
      this.#set({ problem: 'version' });
      return;
    }
    if (message.role === this.#state.role) {
      reply({ kind: 'reject', reason: 'same-role' });
      this.#set({ problem: 'peer-same-role' });
      return;
    }
    this.#peerId = message.from;
    this.#peerRoom = room;
    reply({ kind: 'accept', device: this.#options.device });
    this.#beginConnecting(message.device);
    const link = this.#createLink();
    link
      .createOffer()
      .then((sdp) => {
        if (this.#link === link) this.#sendSignal(room, message.from, { kind: 'offer', sdp });
      })
      .catch(() => {
        if (this.#link === link) this.#backToPairing('p2p-failed');
      });
  }

  /** 加入方：对方接受了加入请求，等待 offer */
  #onAccepted(room: string, message: Extract<SignalMessage, { readonly kind: 'accept' }>): void {
    this.#peerId = message.from;
    this.#peerRoom = room;
    this.#beginConnecting(message.device);
    this.#createLink();
  }

  #beginConnecting(peer: string | null): void {
    this.#set({ phase: { name: 'connecting' }, peer, problem: null });
    this.#startTimer(this.#timeouts.connectMs, () => {
      this.#backToPairing('p2p-failed');
    });
  }

  #onPeerSignal(message: SignalMessage): void {
    const link = this.#link;
    const room = this.#peerRoom;
    const peerId = this.#peerId;
    if (link === null || room === null || peerId === null) return;
    const fail = (): void => {
      if (this.#link === link) this.#backToPairing('p2p-failed');
    };
    switch (message.kind) {
      case 'offer':
        link
          .acceptOffer(message.sdp)
          .then((sdp) => {
            if (this.#link === link) this.#sendSignal(room, peerId, { kind: 'answer', sdp });
          })
          .catch(fail);
        return;
      case 'answer':
        link.acceptAnswer(message.sdp).catch(fail);
        return;
      case 'candidate':
        // 单个候选无效不影响连接
        link
          .addCandidate({
            candidate: message.candidate,
            sdpMid: message.sdpMid,
            sdpMLineIndex: message.sdpMLineIndex,
          })
          .catch(() => undefined);
        return;
      case 'leave':
        if (this.#state.phase.name === 'connecting') this.#backToPairing('peer-cancelled');
        return;
      default:
        return;
    }
  }

  /** 协商失败或被取消：关闭直连，回到配对（信令已断开时重新连接） */
  #backToPairing(problem: SyncProblem | null): void {
    this.#clearTimer();
    this.#teardownLink();
    if (this.#peerRoom !== null && this.#peerRoom !== this.#code) {
      this.#signaling?.leave(this.#peerRoom);
    }
    this.#peerId = null;
    this.#peerRoom = null;
    if (this.#signaling === null) {
      this.#startPairing(problem);
      return;
    }
    this.#set({
      phase: { name: 'pairing', code: this.#code, joining: null },
      peer: null,
      problem,
    });
  }

  // —— 内部：数据通道 ——

  #createLink(): PeerLink {
    const room = this.#peerRoom;
    const peerId = this.#peerId;
    const link = this.#options.peers({
      onCandidate: (candidate) => {
        if (this.#link === link && room !== null && peerId !== null) {
          this.#sendSignal(room, peerId, { kind: 'candidate', ...candidate });
        }
      },
      onOpen: () => {
        if (this.#link === link) {
          this.#sendMessage({
            kind: 'hello',
            protocol: SYNC_PROTOCOL,
            role: this.#state.role,
            device: this.#options.device,
          });
        }
      },
      onMessage: (data) => {
        if (this.#link === link) this.#onChannelData(data);
      },
      onClose: (reason) => {
        if (this.#link === link) this.#onLinkClosed(reason);
      },
    });
    this.#link = link;
    return link;
  }

  #teardownLink(): void {
    this.#outgoing = null;
    this.#incoming = null;
    this.#reviewing = null;
    const link = this.#link;
    this.#link = null;
    link?.close();
  }

  #sendMessage(message: ChannelMessage): void {
    try {
      this.#link?.send(JSON.stringify(message));
    } catch {
      // 通道正在关闭：随后的关闭事件会处理
    }
  }

  #onLinkClosed(reason: PeerCloseReason): void {
    if (this.#state.phase.name === 'connecting') {
      this.#backToPairing('p2p-failed');
      return;
    }
    // 通道被正常关闭说明对方关闭了会话（或页面）；网络中断表现为连接失败
    this.#end(reason === 'closed' ? 'peer-left' : 'connection-lost');
  }

  #end(reason: SyncEndReason): void {
    if (this.#disposed || this.#state.phase.name === 'ended') return;
    const { phase, outcome } = this.#state;
    const interrupted = this.#interruptedOutcome(phase);
    this.#clearTimer();
    this.#teardownLink();
    this.#closeSignaling();
    this.#attempt += 1;
    this.#set({ phase: { name: 'ended', reason }, outcome: interrupted ?? outcome });
  }

  /** 传输进行到一半时断开：记为“中断” */
  #interruptedOutcome(phase: SyncPhase): SyncOutcome | null {
    const outgoing = this.#outgoing;
    if (outgoing !== null && (phase.name === 'sending' || phase.name === 'awaiting')) {
      return {
        result: 'interrupted',
        mode: outgoing.mode,
        entries: outgoing.entries,
        snapshotId: null,
      };
    }
    if (phase.name === 'receiving') {
      return {
        result: 'interrupted',
        mode: phase.mode,
        entries: this.#incoming?.assembler.header.entries ?? 0,
        snapshotId: null,
      };
    }
    if (phase.name === 'reviewing') {
      return {
        result: 'interrupted',
        mode: phase.payload.mode,
        entries: phase.payload.entries.length,
        snapshotId: null,
      };
    }
    return null;
  }

  #onChannelData(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') {
      this.#onChunk(data);
      return;
    }
    const message = parseChannelMessage(data);
    if (message === null) return;
    switch (message.kind) {
      case 'hello':
        this.#onHello(message);
        return;
      case 'push':
        this.#onPush(message);
        return;
      case 'cancel':
        this.#onCancel(message.id);
        return;
      case 'result':
        this.#onResult(message.id, message.result);
        return;
      case 'bye':
        this.#end('peer-left');
        return;
    }
  }

  #onHello(message: Extract<ChannelMessage, { readonly kind: 'hello' }>): void {
    if (this.#state.phase.name !== 'connecting') return;
    if (message.protocol !== SYNC_PROTOCOL) {
      this.#backToPairing('version');
      return;
    }
    if (message.role === this.#state.role) {
      this.#backToPairing('same-role');
      return;
    }
    // 直连已经建立：信令服务器不再需要
    this.#clearTimer();
    this.#closeSignaling();
    this.#set({
      phase: { name: 'connected' },
      peer: message.device ?? this.#state.peer,
      problem: null,
    });
  }

  #onPush(header: PushHeader): void {
    const reply = (result: TransferResult): void => {
      this.#sendMessage({ kind: 'result', id: header.id, result });
    };
    if (this.#state.role !== 'receive' || this.#state.phase.name !== 'connected') {
      reply('busy');
      return;
    }
    if (!isConsistentHeader(header, this.#chunkBytes)) {
      reply('invalid');
      this.#set({ outcome: this.#receiverOutcome(header, 'invalid') });
      return;
    }
    this.#incoming = { id: header.id, assembler: new TransferAssembler(header, this.#chunkBytes) };
    this.#progressStep = -1;
    this.#set({
      phase: { name: 'receiving', mode: header.mode, progress: { done: 0, total: header.bytes } },
      outcome: null,
    });
    this.#startTransferTimer();
  }

  #onChunk(frame: ArrayBuffer): void {
    const incoming = this.#incoming;
    if (incoming === null || this.#state.phase.name !== 'receiving') return;
    const { assembler } = incoming;
    const step = assembler.add(frame);
    if (step === 'more') {
      this.#startTransferTimer();
      this.#reportProgress(assembler.received, assembler.header.bytes);
      return;
    }
    this.#clearTimer();
    this.#incoming = null;
    const payload = step === 'complete' ? assembler.finish() : null;
    if (payload === null) {
      this.#sendMessage({ kind: 'result', id: incoming.id, result: 'invalid' });
      this.#set({
        phase: { name: 'connected' },
        outcome: this.#receiverOutcome(assembler.header, 'invalid'),
      });
      return;
    }
    this.#reviewing = assembler.header;
    this.#set({ phase: { name: 'reviewing', payload } });
  }

  #receiverOutcome(header: PushHeader, result: SyncOutcomeResult): SyncOutcome {
    return { result, mode: header.mode, entries: header.entries, snapshotId: null };
  }

  #startTransferTimer(): void {
    this.#startTimer(this.#timeouts.transferIdleMs, () => {
      const incoming = this.#incoming;
      if (incoming === null) return;
      this.#incoming = null;
      this.#sendMessage({ kind: 'result', id: incoming.id, result: 'invalid' });
      this.#set({
        phase: { name: 'connected' },
        outcome: this.#receiverOutcome(incoming.assembler.header, 'interrupted'),
      });
    });
  }

  /** 接收方：对方取消了发送 */
  #onCancel(id: string): void {
    const header = this.#incoming?.assembler.header ?? this.#reviewing;
    const { phase } = this.#state;
    if (header?.id !== id || (phase.name !== 'receiving' && phase.name !== 'reviewing')) return;
    this.#clearTimer();
    this.#incoming = null;
    this.#reviewing = null;
    this.#set({
      phase: { name: 'connected' },
      outcome: this.#receiverOutcome(header, 'cancelled'),
    });
  }

  /** 发送方：对方的处理结果 */
  #onResult(id: string, result: TransferResult): void {
    const outgoing = this.#outgoing;
    if (outgoing?.id !== id) return;
    this.#outgoing = null;
    this.#set({
      phase: { name: 'connected' },
      outcome: { result, mode: outgoing.mode, entries: outgoing.entries, snapshotId: null },
    });
  }

  async #sendChunks(link: PeerLink, prepared: PreparedTransfer): Promise<void> {
    const { header, bytes } = prepared;
    const isCurrent = (): boolean => this.#link === link && this.#outgoing?.id === header.id;
    for (let index = 0; index < header.chunks; index += 1) {
      if (link.bufferedAmount > TRANSFER_LIMITS.highWaterBytes) await link.drain();
      if (!isCurrent()) return;
      try {
        link.send(chunkFrame(bytes, index, this.#chunkBytes));
      } catch {
        return;
      }
      this.#reportProgress(Math.min((index + 1) * this.#chunkBytes, bytes.length), bytes.length);
    }
    await link.drain();
    const { phase } = this.#state;
    if (isCurrent() && phase.name === 'sending') {
      this.#set({ phase: { name: 'awaiting', mode: phase.mode } });
    }
  }

  #reportProgress(done: number, total: number): void {
    const step = Math.floor((done * PROGRESS_STEPS) / total);
    if (step === this.#progressStep) return;
    this.#progressStep = step;
    const { phase } = this.#state;
    if (phase.name === 'sending' || phase.name === 'receiving') {
      this.#set({ phase: { ...phase, progress: { done, total } } });
    }
  }

  // —— 内部：工具 ——

  #startTimer(ms: number, onTimeout: () => void): void {
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (!this.#disposed) onTimeout();
    }, ms);
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #set(patch: Partial<SyncState>): void {
    if (this.#disposed) return;
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
