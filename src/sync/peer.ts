/**
 * 点对点直连（F-074）：抽象出会话需要的能力，便于在单元测试中用内存实现替换 WebRTC。
 */

export interface IceCandidateData {
  readonly candidate: string;
  readonly sdpMid: string | null;
  readonly sdpMLineIndex: number | null;
}

export type PeerCloseReason =
  /** 无法建立连接，或网络中断后没有恢复 */
  | 'failed'
  /** 对方关闭了数据通道 */
  | 'closed';

export interface PeerLinkEvents {
  /** 本机发现了新的连接候选，需要经信令发给对方 */
  readonly onCandidate: (candidate: IceCandidateData) => void;
  /** 数据通道已打开 */
  readonly onOpen: () => void;
  readonly onMessage: (data: string | ArrayBuffer) => void;
  /** 只触发一次；主动 close() 不触发 */
  readonly onClose: (reason: PeerCloseReason) => void;
}

export interface PeerLink {
  /** 发起方：创建数据通道并返回 offer（SDP） */
  createOffer(): Promise<string>;
  /** 应答方：接受 offer，返回 answer（SDP） */
  acceptOffer(sdp: string): Promise<string>;
  acceptAnswer(sdp: string): Promise<void>;
  addCandidate(candidate: IceCandidateData): Promise<void>;
  send(data: string | Uint8Array<ArrayBuffer>): void;
  /** 尚未发出的字节数 */
  readonly bufferedAmount: number;
  /** 发送缓冲降到低水位以下（或通道关闭）时完成 */
  drain(): Promise<void>;
  close(): void;
}

export type PeerFactory = (events: PeerLinkEvents) => PeerLink;
