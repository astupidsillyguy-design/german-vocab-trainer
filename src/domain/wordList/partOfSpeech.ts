/**
 * 词性标注（F-064）：德语部分末尾的 Adj. / Adv. / vt. / mst Sg 等标注会被移到释义末尾，
 * 写成“总算 [Adv.]”，这样标准答案里只剩单词本身。规则沿用原版。
 */

/** 可识别的标注（不含首尾括号与结尾的点） */
const TAG_SOURCE =
  '(?:(?:nur|mst)\\.?\\s+)?(?:Sg|Pl)\\.?|(?:Adj|Adv|vt|vi|vr|v\\.t\\.|v\\.i\\.|v\\.r\\.|v|part|prep|präp|pron|conj|konj|num|art|int|interj|refl)\\.?';

/** 括号里的标注：“froh (Adj.)” */
const BRACKETED_TAG = new RegExp(`\\s*[(（](${TAG_SOURCE})[)）]\\s*$`, 'iu');
/** 空格或逗号后的标注：“endlich Adv.”、“die Musik mst Sg,” */
const TRAILING_TAG = new RegExp(`[\\s,]+(${TAG_SOURCE})\\s*$`, 'iu');

/** 数量限定：nur Sg / mst Pl 等 */
const NUMBER_QUALIFIER = /^(nur|mst)\.?\s+(sg|pl)\.?$/iu;
const BARE_NUMBER = /^(sg|pl)\.?$/iu;

/** 按前缀识别的词性 → 标准写法 */
const PREFIX_TAGS: readonly (readonly [string, string])[] = [
  ['adj', 'Adj.'],
  ['adv', 'Adv.'],
  ['prep', 'Präp.'],
  ['präp', 'Präp.'],
  ['pron', 'Pron.'],
  ['conj', 'Konj.'],
  ['konj', 'Konj.'],
  ['num', 'Num.'],
  ['art', 'Art.'],
  ['refl', 'refl.'],
];

/** 需要完全一致的缩写 → 标准写法 */
const EXACT_TAGS: ReadonlyMap<string, string> = new Map([
  ['vt', 'vt.'],
  ['v.t.', 'vt.'],
  ['vi', 'vi.'],
  ['v.i.', 'vi.'],
  ['vr', 'Vr.'],
  ['vr.', 'Vr.'],
  ['v.r', 'Vr.'],
  ['v.r.', 'Vr.'],
  ['v', 'v.'],
  ['v.', 'v.'],
  ['part', 'part.'],
  ['part.', 'part.'],
]);

const NUMBER_LABELS: Readonly<Record<string, string>> = { sg: 'Sg', pl: 'Pl' };

/**
 * 去掉标注后只剩冠词（或什么都不剩）时，末尾那个词其实是名词本身，例如“die Art 方式”。
 * 原版会把它当成词性 Art.，标准答案只剩下“die”。
 */
const ARTICLE_ONLY = /^(?:(?:der|die|das)\s*)?$/iu;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 统一写法：“adv” → “Adv.”，“mst. sg” → “mst Sg”，“pl” → “Pl.” */
export function normalizePartOfSpeech(tag: string): string {
  const clean = tag
    .trim()
    .replace(/^[(（]+|[)）]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const lower = clean.toLowerCase();

  const qualified = NUMBER_QUALIFIER.exec(clean);
  if (qualified !== null) {
    const [, qualifier = '', number = ''] = qualified;
    return `${qualifier.toLowerCase()} ${NUMBER_LABELS[number.toLowerCase()] ?? number}`;
  }
  const bare = BARE_NUMBER.exec(clean);
  if (bare !== null) {
    const [, number = ''] = bare;
    return `${NUMBER_LABELS[number.toLowerCase()] ?? number}.`;
  }

  const exact = EXACT_TAGS.get(lower);
  if (exact !== undefined) return exact;
  const prefixed = PREFIX_TAGS.find(([prefix]) => lower.startsWith(prefix));
  if (prefixed !== undefined) return prefixed[1];

  return capitalize(clean) + (clean.endsWith('.') ? '' : '.');
}

export interface ExtractedPartOfSpeech {
  /** 去掉标注后的文本 */
  readonly text: string;
  /** 标准写法的标注；没有时为 null */
  readonly tag: string | null;
}

/** 取出末尾的词性标注 */
export function extractPartOfSpeech(text: string): ExtractedPartOfSpeech {
  const trimmed = text.trim();
  for (const pattern of [BRACKETED_TAG, TRAILING_TAG]) {
    const match = pattern.exec(trimmed);
    if (match?.[1] === undefined) continue;
    const rest = trimmed.slice(0, match.index).trim();
    if (ARTICLE_ONLY.test(rest)) continue;
    return { text: rest, tag: normalizePartOfSpeech(match[1]) };
  }
  return { text: trimmed, tag: null };
}
