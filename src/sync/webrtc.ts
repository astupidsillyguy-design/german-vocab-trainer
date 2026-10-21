/**
 * 基于 WebRTC 数据通道的点对点直连。数据通道经 DTLS 加密；
 * 网络短暂中断（disconnected）时等待一段时间，没有恢复才视为断开。
 */
import { SYNC_TIMEOUTS, TRANSFER_LIMITS } from './constants';
import type { IceCandidateData, PeerFactory, PeerLink, PeerLinkEvents } from './peer';

const CHANNEL_LABEL = 'german-vocab-trainer-sync';

class WebRtcPeer implements PeerLink {
  readonly #connection: RTCPeerConnection;
  readonly #events: PeerLinkEvents;
  readonly #graceMs: number;
  #channel: RTCDataChannel | null = null;
  #pendingCandidates: IceCandidateData[] = [];
  #graceTimer: ReturnType<typeof setTimeout> | null = null;
  #closed = false;

  constructor(iceServers: readonly RTCIceServer[], graceMs: number, events: PeerLinkEvents) {
    this.#events = events;
    this.#graceMs = graceMs;
    const connection = new RTCPeerConnection({ iceServers: [...iceServers] });
    this.#connection = connection;
    connection.onicecandidate = (event) => {
      const candidate = event.candidate;
      if (candidate === null || candidate.candidate === '') return;
      events.onCandidate({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      });
    };
    connection.onconnectionstatechange = () => {
      this.#onStateChange();
    };
    connection.ondatachannel = (event) => {
      this.#attach(event.channel);
    };
  }

  get bufferedAmount(): number {
    return this.#channel?.bufferedAmount ?? 0;
  }

  async createOffer(): Promise<string> {
    this.#attach(this.#connection.createDataChannel(CHANNEL_LABEL, { ordered: true }));
    await this.#connection.setLocalDescription(await this.#connection.createOffer());
    return this.#localSdp();
  }

  async acceptOffer(sdp: string): Promise<string> {
    await this.#connection.setRemoteDescription({ type: 'offer', sdp });
    await this.#flushCandidates();
    await this.#connection.setLocalDescription(await this.#connection.createAnswer());
    return this.#localSdp();
  }

  async acceptAnswer(sdp: string): Promise<void> {
    await this.#connection.setRemoteDescription({ type: 'answer', sdp });
    await this.#flushCandidates();
  }

  async addCandidate(candidate: IceCandidateData): Promise<void> {
    if (this.#connection.remoteDescription === null) {
      this.#pendingCandidates.push(candidate);
      return;
    }
    await this.#connection.addIceCandidate(candidate);
  }

  send(data: string | Uint8Array<ArrayBuffer>): void {
    const channel = this.#channel;
    if (channel?.readyState !== 'open') return;
    if (typeof data === 'string') channel.send(data);
    else channel.send(data);
  }

  drain(): Promise<void> {
    const channel = this.#channel;
    if (
      channel?.readyState !== 'open' ||
      channel.bufferedAmount <= channel.bufferedAmountLowThreshold
    ) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = (): void => {
        channel.removeEventListener('bufferedamountlow', done);
        channel.removeEventListener('close', done);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', done);
      channel.addEventListener('close', done);
    });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#graceTimer !== null) clearTimeout(this.#graceTimer);
    this.#graceTimer = null;
    const connection = this.#connection;
    connection.onicecandidate = null;
    connection.onconnectionstatechange = null;
    connection.ondatachannel = null;
    const channel = this.#channel;
    if (channel !== null) {
      channel.onopen = null;
      channel.onmessage = null;
      channel.onclose = null;
      channel.close();
    }
    connection.close();
  }

  #attach(channel: RTCDataChannel): void {
    // 每个连接只使用一个数据通道
    if (this.#channel !== null) {
      channel.close();
      return;
    }
    this.#channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = TRANSFER_LIMITS.lowWaterBytes;
    channel.onopen = () => {
      this.#events.onOpen();
    };
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const { data } = event;
      if (typeof data === 'string' || data instanceof ArrayBuffer) this.#events.onMessage(data);
    };
    channel.onclose = () => {
      this.#finish('closed');
    };
  }

  #onStateChange(): void {
    switch (this.#connection.connectionState) {
      case 'failed':
        this.#finish('failed');
        return;
      case 'disconnected':
        this.#graceTimer ??= setTimeout(() => {
          this.#finish('failed');
        }, this.#graceMs);
        return;
      case 'connected':
        if (this.#graceTimer !== null) clearTimeout(this.#graceTimer);
        this.#graceTimer = null;
        return;
      default:
        return;
    }
  }

  async #flushCandidates(): Promise<void> {
    const pending = this.#pendingCandidates;
    this.#pendingCandidates = [];
    // 单个候选无效不影响其他候选
    await Promise.all(
      pending.map((candidate) =>
        this.#connection.addIceCandidate(candidate).catch(() => undefined),
      ),
    );
  }

  #localSdp(): string {
    const sdp = this.#connection.localDescription?.sdp;
    if (sdp === undefined || sdp === '') throw new Error('没有本地 SDP');
    return sdp;
  }

  #finish(reason: 'failed' | 'closed'): void {
    if (this.#closed) return;
    this.close();
    this.#events.onClose(reason);
  }
}

/** 浏览器不支持 WebRTC（极少数旧浏览器或被策略禁用）时为 false */
export function isWebRtcSupported(): boolean {
  return typeof RTCPeerConnection === 'function';
}

export function webRtcPeers(
  iceServers: readonly RTCIceServer[],
  graceMs: number = SYNC_TIMEOUTS.reconnectGraceMs,
): PeerFactory {
  return (events) => new WebRtcPeer(iceServers, graceMs, events);
}
