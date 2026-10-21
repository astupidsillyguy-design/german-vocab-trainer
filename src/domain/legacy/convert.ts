/**
 * 旧数据 → 新词库（F-005 无损迁移；F-026 名词答案必须带冠词）。
 *
 * 原版每次加载都会整理词条（补默认章节 / 课时、统一归档分类、删除自动生成的“原形”词条），
 * 但要等下一次保存才写回，所以存储里可能仍是整理前的样子。这里按原版的加载规则整理，结果与原版界面一致；此外：
 * - 名词只保留带冠词的答案（原版额外接受不带冠词的写法；新版已确认名词必须写冠词）；
 * - 原版的 _uid 是内容哈希而不是稳定标识：每个词条分配新的 UUID；
 * - 原版没有创建时间：归档词用归档日期，其余用迁移时间；
 * - 无法转换的数据不丢弃，原样交给调用方放进隔离区。
 */
import { formatIssue, isRecord, parse, type Issue, type PathSegment } from '../../shared/schema';
import { answerKey } from '../answer';
import { createEntry } from '../entry';
import { newEntryId, type EntryId } from '../id';
import { normalizeLibrary, type Library } from '../library';
import { LIMITS } from '../limits';
import type { Entry, EntryDraft, VerbForm } from '../model';
import { EMPTY_ORDER, type ArchiveOrder } from '../order';
import { archiveOrderSchema, timestampSchema } from '../schemas';
import { normalizeText } from '../text';
import { nounAnswer } from '../wordList/line';
import type { LegacyDump, LegacyPart } from './keys';

/** 原版给缺少分类的词条补上的默认值 */
const DEFAULT_CHAPTER = 'A1';
const DEFAULT_LESSON = 'Ein Apartment im Studentenwohnheim';

interface Classification {
  readonly chapter: string;
  readonly lesson: string;
}

/** 原版归档库加载时统一的旧分类：“A1：第30讲”这样的章节名，或省略了编号的课时名 */
const CANONICAL_CLASSIFICATIONS: readonly {
  readonly chapterAliases: readonly string[];
  readonly lessonAliases: readonly string[];
  readonly target: Classification;
}[] = [
  {
    chapterAliases: ['A1：第30讲'],
    lessonAliases: [
      'Ein Apartment im Studentenwohnheim',
      '第30讲: Ein Apartment im Studentenwohnheim',
    ],
    target: { chapter: 'A1', lesson: '第30讲: Ein Apartment im Studentenwohnheim' },
  },
  {
    chapterAliases: ['A1：第33讲'],
    lessonAliases: ['In den Ferien', '第33讲: In den Ferien'],
    target: { chapter: 'A1', lesson: '第33讲: In den Ferien' },
  },
];

/** 原版“二分词”功能早期自动生成的原形题（原版加载时即删除；有自己的变形关系的除外） */
const SYNTHETIC_PROMPT = /^原形（.+的二分词）$/u;
/** 原版为变形题生成的题面后缀：“…的过去式”或“…的二分词” */
const PRETERITE_MARKER = '过去式';
/** 原版归档时记录的日期（YYYY-MM-DD）；“已归档”“手动导入”等文字没有时间信息 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

/** 无法转换的旧数据；raw 是原始值，原样保留 */
export interface LegacyRejected {
  readonly part: LegacyPart;
  readonly issues: readonly string[];
  readonly raw: unknown;
}

export interface LegacyStats {
  readonly pool: number;
  readonly archive: number;
  /** 接收同步前的备份中的归档词数 */
  readonly backup: number;
  /** 跳过的自动生成“原形”词条 */
  readonly synthetic: number;
  /** 去掉了不带冠词答案的名词 */
  readonly bareNouns: number;
  readonly rejected: number;
}

export interface LegacyConversion {
  readonly library: Library;
  /** 原版接收同步覆盖前的备份（归档库与排序；待测库沿用本次迁移的结果），没有时为 null */
  readonly backup: Library | null;
  readonly rejected: readonly LegacyRejected[];
  readonly stats: LegacyStats;
}

export interface LegacyContext {
  readonly now?: Date;
  readonly newId?: () => EntryId;
}

interface Context {
  readonly now: Date;
  readonly newId: () => EntryId;
}

type Raw = Readonly<Record<string, unknown>>;

/** 原版对所有字段都用 String(value || 默认值)：数字也可能出现 */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function textsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map(textOf).filter((text) => text.trim() !== '') : [];
}

const isAbsent = (value: unknown): boolean => textOf(value).trim() === '';

function rejection(
  part: LegacyPart,
  location: readonly PathSegment[],
  issues: readonly Pick<Issue, 'path' | 'code'>[],
  raw: unknown,
): LegacyRejected {
  return {
    part,
    issues: issues.map(({ path, code }) =>
      formatIssue({ path: [part, ...location, ...path], code }),
    ),
    raw,
  };
}

type Decoded = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/** localStorage 里存的是 JSON 文本；导出文件中也可能已经是解析过的值 */
function decode(raw: unknown): Decoded {
  if (typeof raw !== 'string') return { ok: true, value: raw };
  try {
    const value: unknown = JSON.parse(raw);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function classify(chapter: string, lesson: string): Classification {
  const match = CANONICAL_CLASSIFICATIONS.find(
    ({ chapterAliases, lessonAliases }) =>
      chapterAliases.includes(chapter) || lessonAliases.includes(lesson),
  );
  return match?.target ?? { chapter, lesson };
}

function isSynthetic(item: Raw): boolean {
  return (
    SYNTHETIC_PROMPT.test(textOf(item.prompt).trim()) &&
    isAbsent(item.baseForm) &&
    isAbsent(item.derivedForm)
  );
}

/** 名词只保留带冠词的答案：去掉与某个“冠词 + 名词”答案中的名词相同的答案 */
export function withoutBareNouns(answers: readonly string[]): readonly string[] {
  const bare = new Set<string>();
  for (const answer of answers) {
    const noun = nounAnswer(normalizeText(answer));
    if (noun !== null) bare.add(answerKey(noun.slice(noun.indexOf(' ') + 1)));
  }
  if (bare.size === 0) return answers;
  const kept = answers.filter(
    (answer) => nounAnswer(normalizeText(answer)) !== null || !bare.has(answerKey(answer)),
  );
  return kept.length === answers.length ? answers : kept;
}

function verbFormOf(item: Raw): VerbForm | null {
  const base = textOf(item.baseForm).trim();
  if (base === '' || isAbsent(item.derivedForm)) return null;
  return {
    kind: textOf(item.prompt).includes(PRETERITE_MARKER) ? 'praeteritum' : 'partizip2',
    base,
  };
}

/** 能识别的归档时间转成 ISO 8601；没有时间信息时返回 null */
function timestampOf(value: unknown): string | null {
  const text = textOf(value).trim();
  if (!DATE_ONLY.test(text) && !parse(timestampSchema, text).ok) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

interface CollectionConversion {
  readonly entries: readonly Entry[];
  readonly rejected: readonly LegacyRejected[];
  readonly synthetic: number;
  readonly bareNouns: number;
}

const EMPTY_COLLECTION: CollectionConversion = {
  entries: [],
  rejected: [],
  synthetic: 0,
  bareNouns: 0,
};

function convertCollection(
  value: unknown,
  part: LegacyPart,
  location: readonly PathSegment[],
  { now, newId }: Context,
): CollectionConversion {
  if (!Array.isArray(value))
    return {
      ...EMPTY_COLLECTION,
      rejected: [rejection(part, location, [{ path: [], code: 'type' }], value)],
    };
  if (value.length > LIMITS.entriesPerCollection) {
    return {
      ...EMPTY_COLLECTION,
      rejected: [rejection(part, location, [{ path: [], code: 'too_long' }], value)],
    };
  }
  const archived = part !== 'pool';
  const list: readonly unknown[] = value;
  const entries: Entry[] = [];
  const rejected: LegacyRejected[] = [];
  let synthetic = 0;
  let bareNouns = 0;
  list.forEach((item, index) => {
    const at = [...location, index];
    if (!isRecord(item)) {
      rejected.push(rejection(part, at, [{ path: [], code: 'type' }], item));
      return;
    }
    if (isSynthetic(item)) {
      synthetic += 1;
      return;
    }
    const chapter = textOf(item.chapter).trim() || DEFAULT_CHAPTER;
    const lesson = textOf(item.lesson).trim() || DEFAULT_LESSON;
    const answers = textsOf(item.answers);
    const kept = withoutBareNouns(answers);
    const draft: EntryDraft = {
      ...(archived ? classify(chapter, lesson) : { chapter, lesson }),
      prompt: textOf(item.prompt),
      answers: kept,
      verbForm: verbFormOf(item),
      linkedForms: textsOf(item.linkedDerivedForms),
    };
    const archivedAt = archived ? (timestampOf(item.archivedAt) ?? now.toISOString()) : null;
    const result = createEntry(draft, {
      id: newId(),
      now: archivedAt === null ? now : new Date(archivedAt),
      archivedAt,
    });
    if (!result.ok) {
      rejected.push(rejection(part, at, result.issues, item));
      return;
    }
    if (kept !== answers) bareNouns += 1;
    entries.push(result.value);
  });
  return { entries, rejected, synthetic, bareNouns };
}

interface OrderConversion {
  readonly order: ArchiveOrder;
  readonly rejected: readonly LegacyRejected[];
}

/** 原版把 JSON 的 null 与缺少该键同样看待 */
const isMissing = (value: unknown): boolean => value === undefined || value === null;

function convertOrder(
  value: unknown,
  part: LegacyPart,
  location: readonly PathSegment[],
): OrderConversion {
  if (isMissing(value)) return { order: EMPTY_ORDER, rejected: [] };
  if (!isRecord(value)) {
    return {
      order: EMPTY_ORDER,
      rejected: [rejection(part, location, [{ path: [], code: 'type' }], value)],
    };
  }
  const lessons = isRecord(value.lessons) ? value.lessons : {};
  const chapters = Array.isArray(value.chapters) ? value.chapters : [];
  const draft = chapters.flatMap((raw: unknown) => {
    const name = textOf(raw);
    const chapter = normalizeText(name);
    if (chapter === '') return [];
    return [{ chapter, lessons: textsOf(lessons[name]).map(normalizeText) }];
  });
  const result = parse(archiveOrderSchema, draft);
  return result.ok
    ? { order: result.value, rejected: [] }
    : { order: EMPTY_ORDER, rejected: [rejection(part, location, result.issues, value)] };
}

interface BackupConversion {
  readonly backup: Library | null;
  readonly collection: CollectionConversion;
  readonly rejected: readonly LegacyRejected[];
}

function convertBackup(value: unknown, pool: readonly Entry[], context: Context): BackupConversion {
  if (!isRecord(value)) {
    return {
      backup: null,
      collection: EMPTY_COLLECTION,
      rejected: [rejection('backup', [], [{ path: [], code: 'type' }], value)],
    };
  }
  const collection = convertCollection(value.archivedList, 'backup', ['archivedList'], context);
  const order = convertOrder(value.archiveOrder, 'backup', ['archiveOrder']);
  return {
    backup: normalizeLibrary({ pool, archive: collection.entries, order: order.order }),
    collection,
    rejected: [...collection.rejected, ...order.rejected],
  };
}

/** 解析某一部分；JSON 文本损坏时整段原样隔离 */
function decodePart(
  dump: LegacyDump,
  part: LegacyPart,
): { value: unknown; rejected: readonly LegacyRejected[] } {
  const raw = dump[part];
  if (raw === undefined) return { value: undefined, rejected: [] };
  const decoded = decode(raw);
  return decoded.ok
    ? { value: decoded.value, rejected: [] }
    : { value: undefined, rejected: [rejection(part, [], [{ path: [], code: 'invalid' }], raw)] };
}

export function convertLegacy(
  dump: LegacyDump,
  { now = new Date(), newId = newEntryId }: LegacyContext = {},
): LegacyConversion {
  const context: Context = { now, newId };
  const parts = {
    pool: decodePart(dump, 'pool'),
    archive: decodePart(dump, 'archive'),
    order: decodePart(dump, 'order'),
    backup: decodePart(dump, 'backup'),
  };
  const convert = (part: 'pool' | 'archive'): CollectionConversion =>
    isMissing(parts[part].value)
      ? EMPTY_COLLECTION
      : convertCollection(parts[part].value, part, [], context);
  const pool = convert('pool');
  const archive = convert('archive');
  const order = convertOrder(parts.order.value, 'order', []);
  const backup = isMissing(parts.backup.value)
    ? { backup: null, collection: EMPTY_COLLECTION, rejected: [] }
    : convertBackup(parts.backup.value, pool.entries, context);

  const rejected = [
    ...parts.pool.rejected,
    ...pool.rejected,
    ...parts.archive.rejected,
    ...archive.rejected,
    ...parts.order.rejected,
    ...order.rejected,
    ...parts.backup.rejected,
    ...backup.rejected,
  ];
  return {
    library: normalizeLibrary({ pool: pool.entries, archive: archive.entries, order: order.order }),
    backup: backup.backup,
    rejected,
    stats: {
      pool: pool.entries.length,
      archive: archive.entries.length,
      backup: backup.collection.entries.length,
      synthetic: pool.synthetic + archive.synthetic,
      bareNouns: pool.bareNouns + archive.bareNouns,
      rejected: rejected.length,
    },
  };
}
