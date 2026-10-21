/**
 * 列表的“在场”状态：被移除的项先进入 exiting，播完退场动画后再真正删除。
 * 纯函数，React 绑定见 src/ui/motion/usePresenceList。
 */

export type PresenceState = 'present' | 'exiting';

export interface PresenceEntry<T> {
  readonly key: string;
  readonly item: T;
  readonly state: PresenceState;
}

export function presentEntries<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): PresenceEntry<T>[] {
  return items.map((item) => ({ key: keyOf(item), item, state: 'present' }));
}

/**
 * 以新列表更新在场状态：
 * - 新列表中没有的项保留在原位置并标记为 exiting；
 * - 重新出现的项恢复为 present；
 * - 新增项插在它在新列表中的前一项之后（没有前一项时放在最前）。
 */
export function reconcilePresence<T>(
  previous: readonly PresenceEntry<T>[],
  next: readonly T[],
  keyOf: (item: T) => string,
): PresenceEntry<T>[] {
  const nextByKey = new Map(next.map((item) => [keyOf(item), item]));
  const result: PresenceEntry<T>[] = previous.map((entry) => {
    const item = nextByKey.get(entry.key);
    return item === undefined
      ? { ...entry, state: 'exiting' }
      : { key: entry.key, item, state: 'present' };
  });
  const known = new Set(previous.map((entry) => entry.key));
  let previousKey: string | null = null;
  for (const item of next) {
    const key = keyOf(item);
    if (!known.has(key)) {
      const anchor =
        previousKey === null ? -1 : result.findIndex((entry) => entry.key === previousKey);
      result.splice(anchor + 1, 0, { key, item, state: 'present' });
      known.add(key);
    }
    previousKey = key;
  }
  return result;
}

/** 退场动画结束：真正删除该项（仍在场的项不受影响） */
export function removeExited<T>(
  entries: readonly PresenceEntry<T>[],
  key: string,
): readonly PresenceEntry<T>[] {
  const index = entries.findIndex((entry) => entry.key === key && entry.state === 'exiting');
  if (index < 0) return entries;
  return [...entries.slice(0, index), ...entries.slice(index + 1)];
}
