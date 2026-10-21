/**
 * 同步消息的格式与校验（F-077）。来自信令服务器与对端的一切消息都是不可信的：
 * 先检查长度，再解析 JSON，最后经过 schema 白名单校验；任何一步失败都直接丢弃。
 */
import { SYNC_MODES } from '../domain';
import {
  literal,
  nullable,
  number,
  object,
  parse,
  string,
  variant,
  type Infer,
  type Schema,
} from '../shared/schema';
import { SIGNAL_LIMITS, TRANSFER_LIMITS } from './constants';

export const SYNC_ROLES = ['send', 'receive'] as const;
export type SyncRole = (typeof SYNC_ROLES)[number];

/** 拒绝加入的原因 */
export const REJECT_REASONS = ['busy', 'same-role', 'version'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** 接收方对一次推送的处理结果 */
export const TRANSFER_RESULTS = ['applied', 'declined', 'invalid', 'failed', 'busy'] as const;
export type TransferResult = (typeof TRANSFER_RESULTS)[number];

const ID_PATTERN = /^[\w-]+$/u;
/** 设备描述只允许字母、数字、空格与少量标点（它会显示在对方的界面上） */
const DEVICE_PATTERN = /^[\p{L}\p{N} ·._()-]+$/u;
const CHECKSUM_PATTERN = /^[0-9a-f]{16}$/u;
const PROTOCOL_MAX = 1_000;
const MAX_CHUNKS = Math.ceil(TRANSFER_LIMITS.maxBytes / TRANSFER_LIMITS.chunkBytes);
const MAX_ENTRIES = 1_000_000;

const idSchema = string({ min: 1, max: SIGNAL_LIMITS.idChars, pattern: ID_PATTERN });
const deviceSchema = nullable(
  string({ min: 1, max: SIGNAL_LIMITS.deviceChars, pattern: DEVICE_PATTERN }),
);
const roleSchema = literal(...SYNC_ROLES);
const protocolSchema = number({ min: 0, max: PROTOCOL_MAX, integer: true });
const sdpSchema = string({ min: 1, max: SIGNAL_LIMITS.sdpChars });

/** 信令消息都带发送者；to 为 null 表示发给房间里的所有人（只有 join 如此） */
const envelope = { from: idSchema, to: nullable(idSchema) };

export const signalSchema = variant('kind', {
  join: object({
    kind: literal('join'),
    ...envelope,
    protocol: protocolSchema,
    role: roleSchema,
    device: deviceSchema,
  }),
  accept: object({ kind: literal('accept'), ...envelope, device: deviceSchema }),
  reject: object({ kind: literal('reject'), ...envelope, reason: literal(...REJECT_REASONS) }),
  offer: object({ kind: literal('offer'), ...envelope, sdp: sdpSchema }),
  answer: object({ kind: literal('answer'), ...envelope, sdp: sdpSchema }),
  candidate: object({
    kind: literal('candidate'),
    ...envelope,
    candidate: string({ min: 1, max: SIGNAL_LIMITS.candidateChars }),
    sdpMid: nullable(string({ max: SIGNAL_LIMITS.idChars })),
    sdpMLineIndex: nullable(number({ min: 0, max: SIGNAL_LIMITS.mediaLines, integer: true })),
  }),
  leave: object({ kind: literal('leave'), ...envelope }),
});

export type SignalMessage = Infer<typeof signalSchema>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** 由会话补上 from / to 之前的信令消息 */
export type SignalBody = DistributiveOmit<SignalMessage, 'from' | 'to'>;

const transferIdSchema = idSchema;

export const channelSchema = variant('kind', {
  hello: object({
    kind: literal('hello'),
    protocol: protocolSchema,
    role: roleSchema,
    device: deviceSchema,
  }),
  push: object({
    kind: literal('push'),
    id: transferIdSchema,
    mode: literal(...SYNC_MODES),
    entries: number({ min: 0, max: MAX_ENTRIES, integer: true }),
    bytes: number({ min: 1, max: TRANSFER_LIMITS.maxBytes, integer: true }),
    chunks: number({ min: 1, max: MAX_CHUNKS, integer: true }),
    checksum: string({ min: 1, max: SIGNAL_LIMITS.idChars, pattern: CHECKSUM_PATTERN }),
  }),
  cancel: object({ kind: literal('cancel'), id: transferIdSchema }),
  result: object({
    kind: literal('result'),
    id: transferIdSchema,
    result: literal(...TRANSFER_RESULTS),
  }),
  bye: object({ kind: literal('bye') }),
});

export type ChannelMessage = Infer<typeof channelSchema>;
export type PushHeader = Extract<ChannelMessage, { readonly kind: 'push' }>;

function decode<T>(schema: Schema<T>, text: string): T | null {
  if (text.length > SIGNAL_LIMITS.messageChars) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const result = parse(schema, raw);
  return result.ok ? result.value : null;
}

export function parseSignal(text: string): SignalMessage | null {
  return decode(signalSchema, text);
}

export function parseChannelMessage(text: string): ChannelMessage | null {
  return decode(channelSchema, text);
}
