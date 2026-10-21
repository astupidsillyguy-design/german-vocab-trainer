/**
 * 设备直连同步的参数（F-074 – F-077）。
 */

/** 协议版本：消息格式与原版（v2）不兼容，两者也不会互相连上（信令主题不同） */
export const SYNC_PROTOCOL = 3;

/** 公共 MQTT 服务器（与原版相同）：只用来交换连接信息，词库数据经点对点直连传输，不经过它 */
export const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

/** 信令主题的前缀 */
export const SIGNALING_NAMESPACE = 'german-vocab-trainer/sync/v3';

/** 同一浏览器标签页之间的信令（BroadcastChannel）频道名前缀：端到端测试与本机调试 */
export const BROADCAST_CHANNEL_PREFIX = 'german-vocab-trainer:sync';

/** STUN 服务器（与原版相同）：用于发现公网地址；同一局域网内的设备不经过它们也能直连 */
export const DEFAULT_ICE_SERVERS: readonly RTCIceServer[] = [
  {
    urls: [
      'stun:stun.miwifi.com:3478',
      'stun:stun.chat.bilibili.com:3478',
      'stun:stun.hitv.com:3478',
    ],
  },
];

export interface SyncTimeouts {
  /** 连接信令服务器 */
  readonly signalingMs: number;
  /** 输入配对码后等待对方应答 */
  readonly joinMs: number;
  /** 对方应答后建立点对点直连（含握手） */
  readonly connectMs: number;
  /** 接收数据时两片之间的最长间隔 */
  readonly transferIdleMs: number;
  /** 网络短暂中断后等待恢复的时间，超过即视为断开 */
  readonly reconnectGraceMs: number;
}

export const SYNC_TIMEOUTS: SyncTimeouts = {
  signalingMs: 10_000,
  joinMs: 15_000,
  connectMs: 20_000,
  transferIdleMs: 15_000,
  reconnectGraceMs: 5_000,
};

export const TRANSFER_LIMITS = {
  /** 每片数据的字节数：所有浏览器的数据通道都支持的单条消息大小 */
  chunkBytes: 16_384,
  /** 载荷上限：远大于 2 万词的归档（约 5 MB） */
  maxBytes: 33_554_432,
  /** 发送缓冲超过高水位时暂停，降到低水位以下再继续（流控，避免占满内存） */
  highWaterBytes: 1_048_576,
  lowWaterBytes: 262_144,
} as const;

/** 信令消息的上限：来自公共服务器的任何消息都先检查长度再解析 */
export const SIGNAL_LIMITS = {
  messageChars: 65_536,
  sdpChars: 32_768,
  candidateChars: 2_048,
  idChars: 64,
  deviceChars: 64,
  /** 一条 SDP 中的媒体段序号上限（数据通道只有 1 段） */
  mediaLines: 64,
} as const;

/** MQTT 心跳间隔（秒） */
export const MQTT_KEEP_ALIVE_SECONDS = 30;

/** 收到的 MQTT 报文上限：公共服务器上的任何人都能向本机订阅的主题发消息 */
export const MQTT_MAX_PACKET_BYTES = 131_072;
