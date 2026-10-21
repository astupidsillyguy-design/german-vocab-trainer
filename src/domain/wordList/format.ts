/**
 * 词条 → 词表文本（打开词表页时显示当前待测库；设置页的纯文本导出也用它）。
 * 输出能被 parseWordList 原样读回：章节用 #、课时用 ##，每行“标准答案 释义”。
 */
import { answerKey } from '../answer';
import type { EntryContent } from '../model';
import { EMPTY_ORDER, groupEntries, type ArchiveOrder } from '../order';
import { parseLine } from './line';

/** 释义不以中日文开头时（例如英文释义），用“ - ”分隔才能读回 */
const SEPARATORS = [' ', ' - ', '\t'] as const;

function readsBack(line: string, entry: EntryContent): boolean {
  const parsed = parseLine(line);
  return (
    parsed.kind === 'entry' &&
    parsed.draft.prompt === entry.prompt &&
    parsed.draft.answers[0] !== undefined &&
    answerKey(parsed.draft.answers[0]) === answerKey(entry.answers[0])
  );
}

/** 词条不可变，按对象缓存（每次打开词表页都要格式化整个待测库） */
const lineCache = new WeakMap<EntryContent, string>();

export function formatEntryLine(entry: EntryContent): string {
  const cached = lineCache.get(entry);
  if (cached !== undefined) return cached;
  const lineWith = (separator: string): string => `${entry.answers[0]}${separator}${entry.prompt}`;
  const line = SEPARATORS.map(lineWith).find((candidate) => readsBack(candidate, entry));
  const result = line ?? lineWith(SEPARATORS[0]);
  lineCache.set(entry, result);
  return result;
}

export function formatWordList(
  entries: readonly EntryContent[],
  order: ArchiveOrder = EMPTY_ORDER,
): string {
  const blocks = groupEntries(entries, order).map(({ chapter, lessons }) => {
    const lessonBlocks = lessons.map(({ lesson, entries: items }) =>
      [`## ${lesson}`, ...items.map(formatEntryLine)].join('\n'),
    );
    return [`# ${chapter}`, ...lessonBlocks].join('\n\n');
  });
  return blocks.join('\n\n');
}
