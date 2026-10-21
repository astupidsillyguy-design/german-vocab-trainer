/**
 * 拍照识别（OCR）与网页、PDF 复制文字的修复规则表（F-063）。
 *
 * 每条规则只做一件事，按表中顺序作用于整行。要支持新的识别错误，只需在表中加一行。
 * 改动了文字内容的规则（reported）会在预览中标出，用户可以核对；
 * 列表符号、表格竖线这类排版符号的清理不算“修正”，空白的折叠由解析器统一处理。
 */

export const REPAIR_IDS = [
  'invisible',
  'table-border',
  'bullet',
  'list-number',
  'full-width',
  'ligature',
  'dropped-letter',
] as const;
export type RepairId = (typeof REPAIR_IDS)[number];

export interface RepairRule {
  readonly id: RepairId;
  readonly pattern: RegExp;
  readonly replace: (match: string) => string;
  /** 是否在预览中提示“已修正” */
  readonly reported: boolean;
}

const toSpace = (): string => ' ';
const remove = (): string => '';

/** 全角 ASCII 与半角之间的码位差（Ａ U+FF21 → A U+0041） */
const FULL_WIDTH_OFFSET = 0xfee0;

const LIGATURES: Readonly<Record<string, string>> = {
  ﬀ: 'ff',
  ﬁ: 'fi',
  ﬂ: 'fl',
  ﬃ: 'ffi',
  ﬄ: 'ffl',
  ﬅ: 'st',
  ﬆ: 'st',
};

/** 识别时丢掉词首字母的常见词（沿用原版） */
const DROPPED_LETTER_WORDS: Readonly<Record<string, string>> = {
  ützlich: 'nützlich',
  ötig: 'nötig',
};

const wordAlternation = Object.keys(DROPPED_LETTER_WORDS).join('|');

export const REPAIR_RULES: readonly RepairRule[] = [
  /** 软连字符、零宽字符、BOM：从 PDF 或网页复制时常夹带，肉眼看不见却会导致判分不一致 */
  {
    id: 'invisible',
    pattern: /[\u00AD\u200B-\u200D\u2060\uFEFF]/gu,
    replace: remove,
    reported: true,
  },
  /** 表格竖线：识别表格或复制 Markdown 表格时出现 */
  { id: 'table-border', pattern: /[|│┃¦]/gu, replace: toSpace, reported: false },
  /** 列表圆点 */
  { id: 'bullet', pattern: /[▪•·●○◦‣∙]/gu, replace: toSpace, reported: false },
  /** 行首的列表编号：“1. ”、“2) ”、“3、” */
  {
    id: 'list-number',
    pattern: /^\s*\d{1,3}[.)、．]\s+(?=\S)/u,
    replace: remove,
    reported: false,
  },
  /** 全角字母与数字：ｄｅｒ → der */
  {
    id: 'full-width',
    pattern: /[Ａ-Ｚａ-ｚ０-９]/gu,
    replace: (match) => String.fromCharCode(match.charCodeAt(0) - FULL_WIDTH_OFFSET),
    reported: true,
  },
  /** 印刷连字：ﬁnden → finden */
  {
    id: 'ligature',
    pattern: /[ﬀﬁﬂﬃﬄﬅﬆ]/gu,
    replace: (match) => LIGATURES[match] ?? match,
    reported: true,
  },
  /** 丢失词首字母 */
  {
    id: 'dropped-letter',
    pattern: new RegExp(`(?<!\\p{L})(?:${wordAlternation})(?!\\p{L})`, 'gu'),
    replace: (match) => DROPPED_LETTER_WORDS[match] ?? match,
    reported: true,
  },
];

const NONE: readonly RepairId[] = [];

export interface RepairResult {
  readonly text: string;
  /** 改动了文字内容、需要提示用户的规则（按表中顺序） */
  readonly applied: readonly RepairId[];
}

/** 由规则表合成的“是否可能需要修复”判断：绝大多数行一次匹配即可跳过全部规则 */
function candidatePattern(rules: readonly RepairRule[]): RegExp {
  return new RegExp(rules.map(({ pattern }) => `(?:${pattern.source})`).join('|'), 'u');
}

const DEFAULT_CANDIDATE = candidatePattern(REPAIR_RULES);

export function repairLine(
  line: string,
  rules: readonly RepairRule[] = REPAIR_RULES,
): RepairResult {
  const candidate = rules === REPAIR_RULES ? DEFAULT_CANDIDATE : candidatePattern(rules);
  if (!candidate.test(line)) return { text: line, applied: NONE };
  let text = line;
  const applied: RepairId[] = [];
  for (const rule of rules) {
    // 规则可能复用同一个带 g 标志的正则；replace 会自行重置 lastIndex
    const next = text.replace(rule.pattern, rule.replace);
    if (next === text) continue;
    if (rule.reported) applied.push(rule.id);
    text = next;
  }
  return { text, applied };
}
