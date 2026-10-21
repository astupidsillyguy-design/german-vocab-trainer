/**
 * 旧数据导出文件（F-005 的“JSON 导入”）。新版通常与原版不在同一个网址下，读不到原版的 localStorage，
 * 因此提供一个导出工具：在原版所在的浏览器里打开，把全部 DE_QUIZ_ 键原样保存为 JSON 文件。
 *
 * 接受两种格式：
 * - 导出工具生成的 `{ kind, version, exportedAt, keys: { 存储键: 原始字符串 } }`；
 * - 直接导出的 localStorage（`{ 存储键: 原始字符串 }`，例如在控制台执行 JSON.stringify(localStorage)）。
 */
import { isRecord } from '../../shared/schema';
import { dumpFromKeyMap, type LegacyDump } from './keys';

export const LEGACY_EXPORT_KIND = 'german-vocab-trainer/legacy-export';
export const LEGACY_EXPORT_VERSION = 1;

export type LegacyFileError = 'invalid-json' | 'no-legacy-data';

export type LegacyFileRead =
  | { readonly ok: true; readonly dump: LegacyDump }
  | { readonly ok: false; readonly error: LegacyFileError };

/** 部分编辑器保存的 UTF-8 文件以 BOM 开头，JSON.parse 不接受 */
const BYTE_ORDER_MARK = /^\uFEFF/u;

export function readLegacyFile(text: string): LegacyFileRead {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(BYTE_ORDER_MARK, ''));
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  if (!isRecord(value)) return { ok: false, error: 'no-legacy-data' };
  const keys = value.kind === LEGACY_EXPORT_KIND && isRecord(value.keys) ? value.keys : value;
  const dump = dumpFromKeyMap((key) => keys[key]);
  return dump === null ? { ok: false, error: 'no-legacy-data' } : { ok: true, dump };
}
