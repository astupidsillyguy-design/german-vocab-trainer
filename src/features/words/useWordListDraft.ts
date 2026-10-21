import { useCallback, useEffect, useRef, useState } from 'react';
import { useBeforeUnloadWarning } from '../../shared/useBeforeUnloadWarning';
import { clearDraft, readDraft, writeDraft, type WordListDraft } from './draft';

/** 停止输入这么久之后才暂存草稿（大词表序列化一次要几毫秒，不必每个按键都写） */
export const DRAFT_SAVE_DELAY_MS = 400;

export interface WordListDraftState {
  /** 编辑器中显示的文本：没有修改时就是待测库的内容，并随待测库更新 */
  readonly text: string;
  readonly isDirty: boolean;
  /** 开始编辑之后，待测库在其他标签页或设备上被改过 */
  readonly hasConflict: boolean;
  readonly setText: (text: string) => void;
  /** 放弃修改（或保存完成后清除草稿），回到待测库的内容 */
  readonly reset: () => void;
  /** 保留当前修改，不再提示冲突 */
  readonly keep: () => void;
}

/**
 * 词表编辑器的草稿。savedText 是当前待测库格式化后的文本。
 * 草稿为 null 表示“没有修改，跟随待测库”，因此其他标签页保存后，未修改的编辑器会自动显示新内容；
 * 有修改时则保留用户的文本并提示冲突，由用户决定载入最新内容还是保留修改。
 */
export function useWordListDraft(savedText: string): WordListDraftState {
  const [draft, setDraft] = useState<WordListDraft | null>(() => {
    const stored = readDraft();
    return stored === null || stored.text === savedText ? null : stored;
  });
  /** 最新的草稿，供卸载与 pagehide 时立即写入（防抖期间离开页面也不丢失） */
  const latest = useRef(draft);

  useEffect(() => {
    latest.current = draft;
    if (draft === null) {
      clearDraft();
      return undefined;
    }
    const timer = setTimeout(() => {
      writeDraft(draft);
    }, DRAFT_SAVE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft]);

  useEffect(() => {
    const flush = (): void => {
      if (latest.current !== null) writeDraft(latest.current);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const isDirty = draft !== null && draft.text !== savedText;
  useBeforeUnloadWarning(isDirty);

  const setText = useCallback(
    (text: string): void => {
      setDraft((current) =>
        text === savedText ? null : { text, base: current?.base ?? savedText },
      );
    },
    [savedText],
  );

  const reset = useCallback((): void => {
    // 保存后页面会立即切走，等不到 effect：这里同步清除，卸载时也不会再写回旧草稿
    latest.current = null;
    clearDraft();
    setDraft(null);
  }, []);

  const keep = useCallback((): void => {
    setDraft((current) => (current === null ? null : { ...current, base: savedText }));
  }, [savedText]);

  return {
    text: draft?.text ?? savedText,
    isDirty,
    hasConflict: isDirty && draft.base !== savedText,
    setText,
    reset,
    keep,
  };
}
