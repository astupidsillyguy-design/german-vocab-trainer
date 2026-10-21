import { useDeferredValue, useLayoutEffect, useMemo, useState } from 'react';
import { createWordListParser, type ParsedWordList, type WordListParser } from '../../domain';
import { useI18n } from '../../i18n';

/**
 * 每片解析的时间预算（毫秒）。一帧约 16 ms，留出一半给输入、样式与绘制，
 * 交互延迟保持在 100 ms 以内。
 */
export const PARSE_SLICE_MS = 8;

interface PreviewState {
  readonly text: string;
  readonly parser: WordListParser;
  readonly result: ParsedWordList;
}

export interface WordListPreviewState {
  readonly parser: WordListParser;
  /** 最近一次完成的解析结果（新文本解析期间仍显示上一次的结果） */
  readonly result: ParsedWordList | null;
  /** 结果是否落后于当前文本 */
  readonly isPending: boolean;
}

/**
 * 边输入边预览（F-064）。解析器按行缓存，通常一片之内就能完成，结果在绘制前同步呈现；
 * 几万行的词表则分片继续，每片之间用 MessageChannel 把主线程让给输入与渲染。
 * 文本再次变化时取消旧任务，只解析最新的文本。
 */
export function useWordListPreview(text: string): WordListPreviewState {
  const { messages } = useI18n();
  const groups = messages.words.groups;
  const parser = useMemo(() => createWordListParser(groups), [groups]);
  const deferredText = useDeferredValue(text);
  const [state, setState] = useState<PreviewState | null>(null);

  useLayoutEffect(() => {
    const job = parser.start(deferredText);
    let deadline = 0;
    const shouldYield = (): boolean => performance.now() >= deadline;
    const runSlice = (): ParsedWordList | null => {
      deadline = performance.now() + PARSE_SLICE_MS;
      return job.resume(shouldYield);
    };
    const finish = (result: ParsedWordList): void => {
      setState({ text: deferredText, parser, result });
    };

    const first = runSlice();
    if (first !== null) {
      finish(first);
      return undefined;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      const result = runSlice();
      if (result === null) channel.port2.postMessage(null);
      else finish(result);
    };
    channel.port2.postMessage(null);
    return () => {
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
    };
  }, [deferredText, parser]);

  const isCurrent = state !== null && state.text === text && state.parser === parser;
  return { parser, result: state?.result ?? null, isPending: !isCurrent };
}
