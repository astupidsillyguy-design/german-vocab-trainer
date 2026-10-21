/**
 * 词条的创建与编辑：整理文本、按判分规则去重答案，再按上限校验。
 */
import { parse, type ParseResult } from '../shared/schema';
import { answerKey } from './answer';
import { newEntryId, type EntryId } from './id';
import type { Entry, EntryContent, EntryDraft } from './model';
import { entryContentSchema } from './schemas';
import { normalizeText, uniqueBy } from './text';

const isNonEmpty = (text: string): boolean => text !== '';

function cleanList(values: readonly string[]): string[] {
  return uniqueBy(values.map(normalizeText).filter(isNonEmpty), answerKey);
}

/** 整理文本（规范化、去空、按判分规则去重）后按上限校验 */
export function normalizeContent(draft: EntryDraft): ParseResult<EntryContent> {
  const verbForm = draft.verbForm ?? null;
  return parse(entryContentSchema, {
    chapter: normalizeText(draft.chapter),
    lesson: normalizeText(draft.lesson),
    prompt: normalizeText(draft.prompt),
    answers: cleanList(draft.answers),
    verbForm:
      verbForm === null ? null : { kind: verbForm.kind, base: normalizeText(verbForm.base) },
    linkedForms: cleanList(draft.linkedForms ?? []),
  });
}

/** 已经整理过的内容（例如解析器的输出）只做上限校验，不再重复规范化与去重 */
export function validateContent(content: Required<EntryDraft>): ParseResult<EntryContent> {
  return parse(entryContentSchema, content);
}

export interface EntryContext {
  readonly id?: EntryId;
  readonly now?: Date;
  readonly archivedAt?: string | null;
}

export function createEntry(
  draft: EntryDraft,
  { id = newEntryId(), now = new Date(), archivedAt = null }: EntryContext = {},
): ParseResult<Entry> {
  const content = normalizeContent(draft);
  if (!content.ok) return content;
  return { ok: true, value: { id, ...content.value, createdAt: now.toISOString(), archivedAt } };
}

/** 编辑内容；id、创建时间与归档时间保持不变 */
export function updateEntry(entry: Entry, patch: Partial<EntryDraft>): ParseResult<Entry> {
  const content = normalizeContent({ ...entry, ...patch });
  if (!content.ok) return content;
  return {
    ok: true,
    value: {
      ...content.value,
      id: entry.id,
      createdAt: entry.createdAt,
      archivedAt: entry.archivedAt,
    },
  };
}
