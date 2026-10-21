import { useCallback, useState } from 'react';
import { presentEntries, reconcilePresence, removeExited, type PresenceEntry } from '../../motion';

interface PresenceSnapshot<T> {
  readonly source: readonly T[];
  readonly entries: readonly PresenceEntry<T>[];
}

export interface PresenceList<T> {
  /** 在场与正在退场的项（按显示顺序） */
  readonly entries: readonly PresenceEntry<T>[];
  /** 某项的退场动画播完：真正移除 */
  readonly onExited: (key: string) => void;
}

/**
 * 列表退场动画：从数据中删除的项先标记为 exiting 并保留在原位，
 * 播完退场动画后由调用方通知 onExited 再移除。
 * 新数据在渲染期间直接派生（React 推荐的“根据 props 调整 state”写法），不会多渲染一帧旧列表。
 */
export function usePresenceList<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): PresenceList<T> {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot<T>>(() => ({
    source: items,
    entries: presentEntries(items, keyOf),
  }));
  let current = snapshot;
  if (snapshot.source !== items) {
    current = { source: items, entries: reconcilePresence(snapshot.entries, items, keyOf) };
    setSnapshot(current);
  }
  const onExited = useCallback((key: string) => {
    setSnapshot((previous) => {
      const entries = removeExited(previous.entries, key);
      return entries === previous.entries ? previous : { ...previous, entries };
    });
  }, []);
  return { entries: current.entries, onExited };
}
