/**
 * 整份词表的解析（F-062 分组、F-064 逐行结果、F-065 变形关系）。
 *
 * 结果保留每一行的位置与状态，界面据此逐行预览，并能把光标定位到出问题的行。
 * 解析结果只取决于文本与选项。编辑器每次输入后都会重新解析，因此解析器按行缓存：
 * 只有改动过的行需要重新识别，几千行的词表也能在一帧内完成。
 */
import type { Issue, ParseResult } from '../../shared/schema';
import { answerKey } from '../answer';
import { validateContent } from '../entry';
import { fingerprintOf, type Fingerprint } from '../fingerprint';
import { LIMITS } from '../limits';
import type { EntryContent } from '../model';
import { uniqueBy } from '../text';
import { LineCache } from './cache';
import { parseLine, type LineParse } from './line';
import type { RepairId } from './repairs';

export interface WordListOptions {
  /** 第一个 # 标题之前的词条所属的章节 */
  readonly defaultChapter: string;
  /** 每个章节中第一个 ## 标题之前的词条所属的课时 */
  readonly defaultLesson: string;
  /** 只写了 # 没有名称时使用 */
  readonly untitledChapter: string;
  readonly untitledLesson: string;
}

export type ProblemField = 'chapter' | 'lesson' | 'prompt' | 'answer';

export type LineProblem =
  | { readonly reason: 'no-prompt' }
  | { readonly reason: 'no-answer' }
  | { readonly reason: 'too-long'; readonly field: ProblemField; readonly max: number }
  | { readonly reason: 'over-limit'; readonly max: number };

export interface LineLocation {
  /** 从 1 开始的行号 */
  readonly number: number;
  /** 本行在原文中的起止位置（不含换行符），用于在编辑器中选中 */
  readonly start: number;
  readonly end: number;
  readonly source: string;
}

export type ParsedLine = LineLocation &
  (
    | { readonly kind: 'chapter'; readonly name: string }
    | { readonly kind: 'lesson'; readonly name: string }
    | {
        readonly kind: 'entry';
        readonly entry: EntryContent;
        readonly repairs: readonly RepairId[];
      }
    | {
        readonly kind: 'duplicate';
        readonly entry: EntryContent;
        /** 第一次出现的行号 */
        readonly original: number;
      }
    | { readonly kind: 'error'; readonly problem: LineProblem }
  );

export interface WordListCounts {
  readonly entries: number;
  readonly chapters: number;
  readonly lessons: number;
  readonly problems: number;
  readonly duplicates: number;
}

export interface ParsedWordList {
  /** 非空行（空行与分隔线不出现） */
  readonly lines: readonly ParsedLine[];
  /** 将要保存的词条，按出现顺序 */
  readonly entries: readonly EntryContent[];
  readonly counts: WordListCounts;
}

/** 缓存键的字段分隔符（ASCII 单元分隔符，不会出现在正常文本中） */
const KEY_SEPARATOR = '\u001f';
const LINE_FEED = '\n';
const CARRIAGE_RETURN = '\r';
const ARTICLE = /^(?:der|die|das)\s+/iu;

const FIELD_OF_PATH: Readonly<Record<string, ProblemField>> = {
  chapter: 'chapter',
  lesson: 'lesson',
  prompt: 'prompt',
  answers: 'answer',
};

const MAX_OF_FIELD: Readonly<Record<ProblemField, number>> = {
  chapter: LIMITS.groupNameLength,
  lesson: LIMITS.groupNameLength,
  prompt: LIMITS.promptLength,
  answer: LIMITS.answerLength,
};

/** 解析器已保证文本非空，校验失败只可能是超长 */
function problemOf(issues: readonly Issue[]): LineProblem {
  const [first] = issues;
  const segment = first?.path[0];
  const field = (typeof segment === 'string' ? FIELD_OF_PATH[segment] : undefined) ?? 'answer';
  return { reason: 'too-long', field, max: MAX_OF_FIELD[field] };
}

/** 原形的比较键：去掉冠词，按判分规则比较 */
function baseKey(text: string): string {
  return answerKey(text.replace(ARTICLE, ''));
}

const baseKeysCache = new WeakMap<EntryContent, readonly string[]>();

/** 词条可以作为哪些原形被引用（按内容对象缓存：未改动的行复用同一个对象） */
function baseKeysOf(content: EntryContent): readonly string[] {
  let keys = baseKeysCache.get(content);
  if (keys === undefined) {
    keys = content.verbForm === null ? content.answers.map(baseKey) : [];
    baseKeysCache.set(content, keys);
  }
  return keys;
}

interface Accepted {
  /** 在 lines 中的下标 */
  readonly index: number;
  readonly content: EntryContent;
}

/**
 * F-065：把变形题的答案记到原形词条上（只用于展示）。
 * 返回需要更新的词条（下标 → 新内容）；没有变形题时不做任何事。
 */
function linkVerbForms(accepted: readonly Accepted[]): Map<number, EntryContent> {
  const formsByBase = new Map<string, string[]>();
  for (const { content } of accepted) {
    if (content.verbForm === null) continue;
    const key = baseKey(content.verbForm.base);
    const forms = formsByBase.get(key) ?? [];
    forms.push(content.answers[0]);
    formsByBase.set(key, forms);
  }
  const updates = new Map<number, EntryContent>();
  if (formsByBase.size === 0) return updates;
  for (const { index, content } of accepted) {
    for (const key of baseKeysOf(content)) {
      const forms = formsByBase.get(key);
      if (forms === undefined) continue;
      // 每个原形只记到第一个匹配的词条上
      formsByBase.delete(key);
      const merged = uniqueBy(
        [...(updates.get(index) ?? content).linkedForms, ...forms],
        answerKey,
      );
      updates.set(index, {
        ...content,
        linkedForms: merged.slice(0, LIMITS.linkedFormsPerEntry),
      });
    }
  }
  return updates;
}

function groupName(name: string, fallback: string): string {
  return name === '' ? fallback : name;
}

function checkGroupName(name: string, field: 'chapter' | 'lesson'): LineProblem | null {
  return name.length > LIMITS.groupNameLength
    ? { reason: 'too-long', field, max: LIMITS.groupNameLength }
    : null;
}

/** 分段解析的任务：每次 resume 运行到 shouldYield() 为真为止；完成时返回结果，否则返回 null */
export interface WordListJob {
  resume(shouldYield: () => boolean): ParsedWordList | null;
}

export interface WordListParser {
  /** 同步解析整段文本 */
  parse(text: string): ParsedWordList;
  /** 分段解析：调用方在两段之间把主线程让给输入与渲染，几万行的词表也不会卡住界面 */
  start(text: string): WordListJob;
}

/** 分段解析时，每解析这么多行检查一次是否该让出主线程 */
const LINES_PER_CHECK = 128;

type ContentResult = ParseResult<EntryContent>;
type EntryLine = Extract<LineParse, { kind: 'entry' }>;

/**
 * 带行缓存的解析器：选项不变时复用同一个实例。
 * 行文本 → 识别结果；识别结果 × 所在分组 → 校验后的内容（同一个对象，指纹与原形键随之命中缓存）。
 */
export function createWordListParser(options: WordListOptions): WordListParser {
  const lineCache = new LineCache<string, LineParse>();
  const contentCache = new WeakMap<LineParse, Map<string, ContentResult>>();

  const contentOf = (parsed: EntryLine, group: Group): ContentResult => {
    let byGroup = contentCache.get(parsed);
    if (byGroup === undefined) {
      byGroup = new Map();
      contentCache.set(parsed, byGroup);
    }
    let result = byGroup.get(group.key);
    if (result === undefined) {
      result = validateContent({
        ...parsed.draft,
        chapter: group.chapter,
        lesson: group.lesson,
        linkedForms: [],
      });
      byGroup.set(group.key, result);
    }
    return result;
  };

  const steps: ParseSteps = {
    line: (source) => lineCache.get(source, () => parseLine(source)),
    content: contentOf,
  };

  const start = (text: string): WordListJob => {
    const run = parseText(text, options, steps);
    let result: ParsedWordList | null = null;
    return {
      resume(shouldYield) {
        while (result === null) {
          const step = run.next();
          if (step.done === true) {
            result = step.value;
            lineCache.endPass(result.lines.length);
          } else if (shouldYield()) {
            break;
          }
        }
        return result;
      },
    };
  };

  const never = (): boolean => false;
  return {
    start,
    parse: (text) => {
      const job = start(text);
      let result: ParsedWordList | null = null;
      while (result === null) result = job.resume(never);
      return result;
    },
  };
}

/** 一次性解析（不保留缓存） */
export function parseWordList(text: string, options: WordListOptions): ParsedWordList {
  return createWordListParser(options).parse(text);
}

interface Group {
  readonly chapter: string;
  readonly lesson: string;
  /** 章节与课时合成的键：同一分组内的所有行共用这个字符串 */
  readonly key: string;
}

function groupOf(chapter: string, lesson: string): Group {
  return { chapter, lesson, key: chapter + KEY_SEPARATOR + lesson };
}

interface ParseSteps {
  readonly line: (source: string) => LineParse;
  readonly content: (parsed: EntryLine, group: Group) => ContentResult;
}

/**
 * 依次给出每个换行的位置与长度（\n、\r\n 或单独的 \r）。
 * 记住两种换行符各自的下一个位置，整段文本只扫描一遍。
 */
function lineBreaks(text: string): (from: number) => readonly [index: number, length: number] {
  let feed = -1;
  let carriage = -1;
  const find = (char: string, cached: number, from: number): number =>
    cached === Infinity || cached >= from ? cached : text.indexOf(char, from);
  const orEnd = (index: number): number => (index === -1 ? Infinity : index);
  return (from) => {
    feed = orEnd(find(LINE_FEED, feed, from));
    carriage = orEnd(find(CARRIAGE_RETURN, carriage, from));
    if (feed === Infinity && carriage === Infinity) return [text.length, 0];
    if (feed < carriage) return [feed, 1];
    return [carriage, feed === carriage + 1 ? 2 : 1];
  };
}

/** 解析主体：生成器，每 LINES_PER_CHECK 行暂停一次，由调用方决定是否继续 */
function* parseText(
  text: string,
  options: WordListOptions,
  steps: ParseSteps,
): Generator<void, ParsedWordList, void> {
  const lines: ParsedLine[] = [];
  const accepted: Accepted[] = [];
  const seen = new Map<Fingerprint, number>();
  const chapters = new Set<string>();
  const lessons = new Set<string>();
  let chapter = options.defaultChapter;
  let group = groupOf(chapter, options.defaultLesson);
  let problems = 0;
  let duplicates = 0;

  let start = 0;
  let end = 0;
  let number = 0;
  let source = '';
  const problem = (value: LineProblem): void => {
    problems += 1;
    lines.push({ number, start, end, source, kind: 'error', problem: value });
  };

  const nextBreak = lineBreaks(text);
  for (;;) {
    const [lineEnd, breakLength] = nextBreak(start);
    end = lineEnd;
    number += 1;
    source = text.slice(start, end);
    const parsed = steps.line(source);

    switch (parsed.kind) {
      case 'blank':
        break;
      case 'chapter': {
        const name = groupName(parsed.name, options.untitledChapter);
        const invalid = checkGroupName(name, 'chapter');
        if (invalid !== null) {
          problem(invalid);
          break;
        }
        chapter = name;
        group = groupOf(chapter, options.defaultLesson);
        lines.push({ number, start, end, source, kind: 'chapter', name });
        break;
      }
      case 'lesson': {
        const name = groupName(parsed.name, options.untitledLesson);
        const invalid = checkGroupName(name, 'lesson');
        if (invalid !== null) {
          problem(invalid);
          break;
        }
        group = groupOf(chapter, name);
        lines.push({ number, start, end, source, kind: 'lesson', name });
        break;
      }
      case 'error':
        problem({ reason: parsed.reason });
        break;
      case 'entry': {
        const result = steps.content(parsed, group);
        if (!result.ok) {
          problem(problemOf(result.issues));
          break;
        }
        const entry = result.value;
        const fingerprint = fingerprintOf(entry);
        const original = seen.get(fingerprint);
        if (original !== undefined) {
          duplicates += 1;
          lines.push({ number, start, end, source, kind: 'duplicate', entry, original });
          break;
        }
        if (accepted.length >= LIMITS.entriesPerCollection) {
          problem({ reason: 'over-limit', max: LIMITS.entriesPerCollection });
          break;
        }
        seen.set(fingerprint, number);
        chapters.add(group.chapter);
        lessons.add(group.key);
        accepted.push({ index: lines.length, content: entry });
        lines.push({ number, start, end, source, kind: 'entry', entry, repairs: parsed.repairs });
        break;
      }
    }

    if (breakLength === 0) break;
    start = end + breakLength;
    if (number % LINES_PER_CHECK === 0) yield;
  }

  const updates = linkVerbForms(accepted);
  for (const [index, entry] of updates) {
    const line = lines[index];
    if (line?.kind === 'entry') lines[index] = { ...line, entry };
  }
  const entries = accepted.map(({ index, content }) => updates.get(index) ?? content);

  return {
    lines,
    entries,
    counts: {
      entries: entries.length,
      chapters: chapters.size,
      lessons: lessons.size,
      problems,
      duplicates,
    },
  };
}
