/**
 * 内容指纹（F-006，仅用于去重）：同一章节、同一课时下，题面与标准答案都相同的词条视为同一个词。
 *
 * 大小写有意义：德语里 Essen（名词）与 essen（动词）是两个词。
 * 采用 64 位非加密哈希（shared/hash.ts）：同步、极快，在数万词条的规模下碰撞概率可以忽略。
 */
import { hash64 } from '../shared/hash';
import { normalizeText } from './text';

declare const fingerprintBrand: unique symbol;
export type Fingerprint = string & { readonly [fingerprintBrand]: true };

export interface FingerprintSource {
  readonly chapter: string;
  readonly lesson: string;
  readonly prompt: string;
  readonly answers: readonly [string, ...string[]];
}

/** ASCII 单元分隔符：不会出现在正常文本中，避免 "a::b" + "c" 与 "a" + "b::c" 拼接后相同 */
const FIELD_SEPARATOR = '\u001f';

const cache = new WeakMap<FingerprintSource, Fingerprint>();

/** 词条对象不可变，因此按对象缓存结果 */
export function fingerprintOf(source: FingerprintSource): Fingerprint {
  const cached = cache.get(source);
  if (cached !== undefined) return cached;
  const key = [source.chapter, source.lesson, source.prompt, source.answers[0]]
    .map(normalizeText)
    .join(FIELD_SEPARATOR);
  const fingerprint = `fp1:${hash64(key)}` as Fingerprint;
  cache.set(source, fingerprint);
  return fingerprint;
}
