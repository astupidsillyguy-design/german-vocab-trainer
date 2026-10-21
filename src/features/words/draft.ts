/**
 * 词表草稿：编辑到一半时暂存在 sessionStorage，刷新页面不会丢失。
 * 草稿同时记下“开始编辑时的待测库文本”（base），以便发现待测库在其他标签页被改过。
 * 读取的内容来自页面之外，一律经过 schema 校验；格式不对的草稿直接丢弃。
 */
import { literal, object, parse, string } from '../../shared/schema';
import { readSessionValue, removeSessionValue, writeSessionValue } from '../../shared/session';

export interface WordListDraft {
  /** 编辑器中的文本 */
  readonly text: string;
  /** 开始编辑时待测库对应的词表文本 */
  readonly base: string;
}

const DRAFT_KEY = 'draft.word-list';
const DRAFT_VERSION = 1;

/**
 * 草稿文本的长度上限（字符）。sessionStorage 通常只有约 5 MB（UTF-16 约 250 万字符），
 * 草稿要同时保存 text 与 base，超过上限时不暂存（仍可正常编辑与保存）。
 */
export const DRAFT_MAX_LENGTH = 1_000_000;

const draftSchema = object({
  version: literal(DRAFT_VERSION),
  text: string({ max: DRAFT_MAX_LENGTH }),
  base: string({ max: DRAFT_MAX_LENGTH }),
});

export function readDraft(): WordListDraft | null {
  const raw = readSessionValue(DRAFT_KEY);
  if (raw === null) return null;
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    removeSessionValue(DRAFT_KEY);
    return null;
  }
  const result = parse(draftSchema, input);
  if (!result.ok) {
    removeSessionValue(DRAFT_KEY);
    return null;
  }
  return { text: result.value.text, base: result.value.base };
}

/** 返回是否已暂存（过长或存储不可用时为否） */
export function writeDraft(draft: WordListDraft): boolean {
  if (draft.text.length > DRAFT_MAX_LENGTH || draft.base.length > DRAFT_MAX_LENGTH) {
    removeSessionValue(DRAFT_KEY);
    return false;
  }
  return writeSessionValue(
    DRAFT_KEY,
    JSON.stringify({ version: DRAFT_VERSION, text: draft.text, base: draft.base }),
  );
}

export function clearDraft(): void {
  removeSessionValue(DRAFT_KEY);
}
