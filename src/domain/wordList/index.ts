/**
 * 词表：文本 ↔ 词条（F-060–F-068）。
 */
export { formatEntryLine, formatWordList } from './format';
export { nounAnswer, parseLine, type LineDraft, type LineParse } from './line';
export {
  createWordListParser,
  parseWordList,
  type LineLocation,
  type LineProblem,
  type ParsedLine,
  type ParsedWordList,
  type ProblemField,
  type WordListCounts,
  type WordListOptions,
  type WordListParser,
} from './parse';
export { extractPartOfSpeech, normalizePartOfSpeech } from './partOfSpeech';
export { REPAIR_IDS, REPAIR_RULES, repairLine, type RepairId, type RepairRule } from './repairs';
export { isSamePool, replacePool, sameContent, type ReplaceContext } from './replace';
