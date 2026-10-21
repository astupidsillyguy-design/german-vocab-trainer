/**
 * 单行解析（F-064 词条行、F-065 动词变形关系）。规则沿用原版，并修正了几处会吞词或拆错的情况：
 *
 * - 德语与释义的分界是第一个中日文字符；若它在括号里，从括号开始算释义，
 *   “das Apartment (小型、单人居住的)公寓住房”的括号说明不再丢失；
 * - 没有中日文字符时，可以用制表符或“ - ”、“：”分隔（英文等其他语言的释义）；
 * - 只有在整行加粗（**课时**）或以 # 开头时才算标题，“* der Schrank 柜子”这类列表行照常解析（F-062）。
 */
import { answerKey } from '../answer';
import type { VerbForm, VerbFormKind } from '../model';
import { collapseWhitespace, uniqueBy } from '../text';
import { extractPartOfSpeech } from './partOfSpeech';
import { repairLine, type RepairId } from './repairs';

/** 释义使用的文字：假名、汉字、谚文（码位区间，逐字判断时比正则快得多） */
const PROMPT_SCRIPT_RANGES: readonly { readonly from: number; readonly to: number }[] = [
  /** 平假名、片假名 */
  { from: 0x3040, to: 0x30ff },
  /** 片假名音标扩展 */
  { from: 0x31f0, to: 0x31ff },
  /** 中日韩统一表意文字扩展 A 与基本区 */
  { from: 0x3400, to: 0x9fff },
  /** 谚文音节 */
  { from: 0xac00, to: 0xd7af },
  /** 中日韩兼容表意文字 */
  { from: 0xf900, to: 0xfaff },
];
const FIRST_PROMPT_CODE = 0x3040;

function isPromptScript(code: number): boolean {
  if (code < FIRST_PROMPT_CODE) return false;
  return PROMPT_SCRIPT_RANGES.some(({ from, to }) => code >= from && code <= to);
}

function hasPromptScript(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (isPromptScript(text.charCodeAt(index))) return true;
  }
  return false;
}
const OPENING_BRACKETS = new Set(['(', '（', '[', '【']);
const CLOSING_BRACKETS = new Set([')', '）', ']', '】']);

/** 没有中日文释义时的显式分隔符：制表符、两侧有空格的短横线 / 破折号、冒号 */
const EXPLICIT_SEPARATOR = /\t+|\s+[-–—]\s+|\s*：\s*|\s+:\s+/u;

const CHAPTER_HEADING = /^#(?!#)\s*(.*)$/u;
const LESSON_HEADING = /^#{2,}\s*(.*)$/u;
const BOLD_HEADING = /^\*\*([^*]+)\*\*$/u;
/** Markdown 标题结尾可选的 # 与包住标题的 ** */
const HEADING_DECORATION = /^\*\*|\*\*$|\s+#+$/gu;

/** 不含任何字母的行（分隔线 ---、***、表格分隔行等）忽略 */
const HAS_LETTER = /\p{L}/u;

/** 德语部分首尾的标点与符号 */
const LEADING_NOISE = /^[:：\-–—=\t,，;；"“”„~!?#*^$+]+\s*/u;
const TRAILING_NOISE = /\s*[:：\-–—=\t,，;；"“”„~!?#*^$+]+$/u;
const BRACKETED_PROMPT_TEXT = /[(（][^)）]*[\u3400-\u9FFF][^)）]*[)）]/gu;
const PARENTHESES = /\([^)]*\)|（[^）]*）/gu;
/** “fernsehen = TV schauen”：等号后是德语解释，不属于答案 */
const EXPLANATION = /\s*=.*$/u;
const PROMPT_LEADING_NOISE = /^[，,：:\-–—=\s]+/u;

const NOUN = /^(der|die|das)\s+(.+?)(?=\s*,|\s*\([^)]*\)\s*$|$)/iu;
const NOUN_WORD = /^[\p{L}][\p{L}'-]*$/u;
const NUMBER_SUFFIX = /\s+(?:(?:nur|mst)\.?\s+)?(?:Sg|Pl)\.?\s*$/iu;
const TRAILING_BRACKET = /\s*[(（][^)）]*[)）]\s*$/u;

const VERB_FORM_SUFFIX =
  /\s*的\s*(二分词|第二分词|过去分词|第二过去分词|过去式|一般过去时|Präteritum|Partizip\s*II|Partizip\.II)\s*$/iu;
const PRETERITE_LABEL = /过去式|一般过去时|Präteritum/iu;
const VERB_FORM_BODY = /^(.*?)\s+[(（[]?([\p{L}][\p{L}0-9'/._-]*)[)）\]]?$/u;
const QUOTES = /[“”‘’"']/gu;
const VERB_FORM_PROMPT: Readonly<Record<VerbFormKind, string>> = {
  partizip2: '二分词',
  praeteritum: '过去式',
};

export interface LineDraft {
  readonly prompt: string;
  readonly answers: readonly string[];
  readonly verbForm: VerbForm | null;
}

export type LineParse =
  | { readonly kind: 'blank' }
  | { readonly kind: 'chapter'; readonly name: string }
  | { readonly kind: 'lesson'; readonly name: string }
  | { readonly kind: 'entry'; readonly draft: LineDraft; readonly repairs: readonly RepairId[] }
  | {
      readonly kind: 'error';
      readonly reason: 'no-prompt' | 'no-answer';
      readonly repairs: readonly RepairId[];
    };

function cleanAnswer(text: string): string {
  return collapseWhitespace(
    text
      .trim()
      .replace(LEADING_NOISE, '')
      .replace(TRAILING_NOISE, '')
      .replace(BRACKETED_PROMPT_TEXT, ' '),
  );
}

/** 释义从哪里开始：第一个中日文字符，若在括号里则从最外层括号开始 */
function promptStart(line: string): number | null {
  const openings: number[] = [];
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (OPENING_BRACKETS.has(char)) {
      openings.push(index);
    } else if (CLOSING_BRACKETS.has(char)) {
      openings.pop();
    } else if (isPromptScript(char.charCodeAt(0))) {
      return openings[0] ?? index;
    }
  }
  return null;
}

interface Split {
  readonly german: string;
  readonly prompt: string;
}

function splitLine(line: string): Split {
  const start = promptStart(line);
  if (start !== null) return { german: line.slice(0, start), prompt: line.slice(start) };
  const separator = EXPLICIT_SEPARATOR.exec(line);
  if (separator !== null) {
    return {
      german: line.slice(0, separator.index),
      prompt: line.slice(separator.index + separator[0].length),
    };
  }
  return { german: line, prompt: '' };
}

/** 名词：只接受带冠词的标准形式（已确认：名词必须写冠词）；不是“冠词 + 名词”时返回 null */
export function nounAnswer(german: string): string | null {
  const match = NOUN.exec(german);
  if (match === null) return null;
  const [, article = '', rest = ''] = match;
  const word = rest.replace(TRAILING_BRACKET, '').replace(NUMBER_SUFFIX, '').trim();
  if (!NOUN_WORD.test(word)) return null;
  return `${article.toLowerCase()} ${word}`;
}

/** 其他词：原文；去掉括号说明后的写法也算对（“jm bei etw.(D.) helfen” → “jm bei etw. helfen”） */
const OPENING_PARENTHESES = /[(（]/u;

function answersFor(german: string): readonly string[] {
  const noun = nounAnswer(german);
  if (noun !== null) return [noun];
  if (!OPENING_PARENTHESES.test(german)) return [german];
  const withoutParentheses = collapseWhitespace(german.replace(PARENTHESES, ' '));
  return uniqueBy([german, withoutParentheses].filter(Boolean), answerKey);
}

/** 变形题必须以“的……”结尾 */
const VERB_FORM_MARKER = '的';

function parseVerbForm(line: string): LineDraft | null {
  if (!line.includes(VERB_FORM_MARKER)) return null;
  const compact = collapseWhitespace(line.replace(QUOTES, ''));
  const suffix = VERB_FORM_SUFFIX.exec(compact);
  if (suffix === null) return null;
  const body = VERB_FORM_BODY.exec(compact.slice(0, suffix.index).trim());
  if (body === null) return null;
  const [, rawAnswer = '', rawBase = ''] = body;
  const answer = cleanAnswer(rawAnswer);
  const base = cleanAnswer(rawBase);
  if (answer === '' || base === '') return null;
  if (hasPromptScript(answer) || answerKey(answer) === answerKey(base)) return null;
  const kind: VerbFormKind = PRETERITE_LABEL.test(suffix[1] ?? '') ? 'praeteritum' : 'partizip2';
  return {
    prompt: `${base}的${VERB_FORM_PROMPT[kind]}`,
    answers: [answer],
    verbForm: { kind, base },
  };
}

function headingName(text: string): string {
  return collapseWhitespace(text.replace(HEADING_DECORATION, ''));
}

const HEADING_MARKER = '#';
const BOLD_MARKER = '**';

function parseHeading(line: string): LineParse | null {
  if (!line.startsWith(HEADING_MARKER) && !line.startsWith(BOLD_MARKER)) return null;
  const lesson = LESSON_HEADING.exec(line) ?? BOLD_HEADING.exec(line);
  if (lesson !== null) return { kind: 'lesson', name: headingName(lesson[1] ?? '') };
  const chapter = CHAPTER_HEADING.exec(line);
  if (chapter !== null) return { kind: 'chapter', name: headingName(chapter[1] ?? '') };
  return null;
}

/** 输出的文本都已规范化（NFC、空白折叠），可以直接用于词条 */
export function parseLine(raw: string): LineParse {
  const { text, applied: repairs } = repairLine(raw.normalize('NFC'));
  const line = text.trim();
  const heading = parseHeading(line);
  if (heading !== null) return heading;
  if (!HAS_LETTER.test(line)) return { kind: 'blank' };

  const verbForm = parseVerbForm(line);
  if (verbForm !== null) return { kind: 'entry', draft: verbForm, repairs };

  const split = splitLine(line);
  const { text: german, tag } = extractPartOfSpeech(
    cleanAnswer(cleanAnswer(split.german).replace(EXPLANATION, '')),
  );
  const answer = cleanAnswer(german);
  let prompt = collapseWhitespace(split.prompt.replace(PROMPT_LEADING_NOISE, ''));
  if (answer === '') return { kind: 'error', reason: 'no-answer', repairs };
  if (prompt === '') return { kind: 'error', reason: 'no-prompt', repairs };
  if (tag !== null && !prompt.includes(tag)) prompt = `${prompt} [${tag}]`;
  return { kind: 'entry', draft: { prompt, answers: answersFor(answer), verbForm: null }, repairs };
}
