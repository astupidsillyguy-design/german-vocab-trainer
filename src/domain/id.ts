/**
 * 标识符（F-006）：每个词条、快照都有随机 UUID，与内容无关——
 * 改名、编辑都不会改变 id；判断“是不是同一个词”用内容指纹（fingerprint.ts）。
 */

declare const entryIdBrand: unique symbol;
export type EntryId = string & { readonly [entryIdBrand]: true };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isEntryId(value: string): value is EntryId {
  return isUuid(value);
}

const UUID_BYTE_LENGTH = 16;
/** 每个 x 依次填入一个十六进制数字 */
const UUID_LAYOUT = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
const VERSION_BYTE_INDEX = 6;
const VARIANT_BYTE_INDEX = 8;
const LOW_NIBBLE_MASK = 0x0f;
const VERSION_4_BITS = 0x40;
const VARIANT_MASK = 0x3f;
const VARIANT_RFC_4122_BITS = 0x80;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

/** crypto.randomUUID 只在安全上下文（HTTPS / localhost）中存在；局域网 http 调试时它是 undefined */
type RandomSource = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>;

function uuidFromRandomBytes(source: RandomSource): string {
  const bytes = source.getRandomValues(new Uint8Array(UUID_BYTE_LENGTH));
  bytes[VERSION_BYTE_INDEX] = ((bytes[VERSION_BYTE_INDEX] ?? 0) & LOW_NIBBLE_MASK) | VERSION_4_BITS;
  bytes[VARIANT_BYTE_INDEX] =
    ((bytes[VARIANT_BYTE_INDEX] ?? 0) & VARIANT_MASK) | VARIANT_RFC_4122_BITS;
  const digits = Array.from(bytes, (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, '0'),
  ).join('');
  let next = 0;
  return UUID_LAYOUT.replace(/x/gu, () => digits.charAt(next++));
}

/** 随机 UUID v4（小写） */
export function newId(source: RandomSource = globalThis.crypto): string {
  return source.randomUUID === undefined ? uuidFromRandomBytes(source) : source.randomUUID();
}

export function newEntryId(source?: RandomSource): EntryId {
  const id = newId(source);
  if (!isEntryId(id)) throw new Error(`生成的 id 不是合法 UUID：${id}`);
  return id;
}
