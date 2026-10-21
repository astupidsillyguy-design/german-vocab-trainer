/**
 * 读取同一网址下原版留在 localStorage 中的数据（F-005）。只读不删：原版仍可继续使用，迁移也可以重做。
 */
import { dumpFromKeyMap, type LegacyDump } from '../domain';

/** 没有旧数据、或浏览器禁止访问 localStorage 时返回 null */
export function readLegacyStorage(storage?: Pick<Storage, 'getItem'>): LegacyDump | null {
  try {
    const source = storage ?? globalThis.localStorage;
    return dumpFromKeyMap((key) => source.getItem(key));
  } catch {
    return null;
  }
}
