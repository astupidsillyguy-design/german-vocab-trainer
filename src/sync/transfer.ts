/**
 * 分片传输（F-077）：载荷序列化为 UTF-8 JSON，切成固定大小的二进制分片，经数据通道按顺序发送。
 * 每片前 4 个字节是片序号（大端）。接收方逐片核对序号与长度，收齐后再核对校验和，
 * 最后解析 JSON 并做结构校验——任何一步不通过，整份数据都不会被使用。
 */
import { parseSyncPayload, type SyncPayload } from '../domain';
import { hash64 } from '../shared/hash';
import { TRANSFER_LIMITS } from './constants';
import type { PushHeader } from './messages';

const INDEX_BYTES = 4;
const LITTLE_ENDIAN = false;

const encoder = new TextEncoder();

export interface PreparedTransfer {
  readonly header: PushHeader;
  readonly bytes: Uint8Array;
}

/** 序列化载荷；超过上限时返回 null */
export function prepareTransfer(
  id: string,
  payload: SyncPayload,
  chunkBytes: number = TRANSFER_LIMITS.chunkBytes,
): PreparedTransfer | null {
  const json = JSON.stringify(payload);
  const bytes = encoder.encode(json);
  if (bytes.length === 0 || bytes.length > TRANSFER_LIMITS.maxBytes) return null;
  return {
    header: {
      kind: 'push',
      id,
      mode: payload.mode,
      entries: payload.entries.length,
      bytes: bytes.length,
      chunks: Math.ceil(bytes.length / chunkBytes),
      checksum: hash64(json),
    },
    bytes,
  };
}

/** 第 index 片：4 字节片序号 + 数据 */
export function chunkFrame(
  bytes: Uint8Array,
  index: number,
  chunkBytes: number = TRANSFER_LIMITS.chunkBytes,
): Uint8Array<ArrayBuffer> {
  const data = bytes.subarray(index * chunkBytes, (index + 1) * chunkBytes);
  const frame = new Uint8Array(INDEX_BYTES + data.length);
  new DataView(frame.buffer).setUint32(0, index, LITTLE_ENDIAN);
  frame.set(data, INDEX_BYTES);
  return frame;
}

/** 推送头中的片数必须与字节数一致 */
export function isConsistentHeader(
  header: PushHeader,
  chunkBytes: number = TRANSFER_LIMITS.chunkBytes,
): boolean {
  return header.chunks === Math.ceil(header.bytes / chunkBytes);
}

export type AssembleStep = 'more' | 'complete' | 'invalid';

/** 接收方：按顺序拼接分片 */
export class TransferAssembler {
  readonly header: PushHeader;
  readonly #chunkBytes: number;
  readonly #buffer: Uint8Array;
  #next = 0;
  #received = 0;

  constructor(header: PushHeader, chunkBytes: number = TRANSFER_LIMITS.chunkBytes) {
    this.header = header;
    this.#chunkBytes = chunkBytes;
    this.#buffer = new Uint8Array(header.bytes);
  }

  /** 已收到的字节数 */
  get received(): number {
    return this.#received;
  }

  add(frame: ArrayBuffer): AssembleStep {
    if (this.#next >= this.header.chunks || frame.byteLength < INDEX_BYTES) return 'invalid';
    const index = new DataView(frame).getUint32(0, LITTLE_ENDIAN);
    const data = new Uint8Array(frame, INDEX_BYTES);
    const isLast = index === this.header.chunks - 1;
    const expectedLength = isLast ? this.header.bytes - index * this.#chunkBytes : this.#chunkBytes;
    if (index !== this.#next || data.length !== expectedLength) return 'invalid';
    this.#buffer.set(data, this.#received);
    this.#received += data.length;
    this.#next += 1;
    return isLast ? 'complete' : 'more';
  }

  /** 收齐后：解码、核对校验和、解析 JSON 并校验结构；不合法时返回 null */
  finish(): SyncPayload | null {
    if (this.#next !== this.header.chunks) return null;
    let json: string;
    try {
      json = new TextDecoder('utf-8', { fatal: true }).decode(this.#buffer);
    } catch {
      return null;
    }
    if (hash64(json) !== this.header.checksum) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return null;
    }
    const payload = parseSyncPayload(raw);
    if (payload === null) return null;
    return payload.mode === this.header.mode && payload.entries.length === this.header.entries
      ? payload
      : null;
  }
}
