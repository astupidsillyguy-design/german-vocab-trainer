/**
 * 持久化数据与外部数据的结构定义。类型标注为 Schema<领域类型>，结构若与类型不一致会在编译期报错。
 */
import {
  array,
  literal,
  nonEmptyArray,
  nullable,
  number,
  object,
  parse,
  refine,
  string,
  type Schema,
} from '../shared/schema';
import { isEntryId, isUuid } from './id';
import { LIMITS } from './limits';
import { VERB_FORM_KINDS, type Entry, type EntryContent } from './model';
import type { ArchiveOrder } from './order';
import { SNAPSHOT_REASONS, type SnapshotSummary } from './snapshot';

const UUID_LENGTH = 36;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

export const uuidSchema = refine(string({ max: UUID_LENGTH }), isUuid);
export const entryIdSchema = refine(string({ max: UUID_LENGTH }), isEntryId);

export const timestampSchema = refine(
  string({ max: LIMITS.timestampLength, pattern: ISO_TIMESTAMP }),
  (value) => !Number.isNaN(Date.parse(value)),
);

export const groupNameSchema = string({ min: 1, max: LIMITS.groupNameLength });
export const promptSchema = string({ min: 1, max: LIMITS.promptLength });
export const answerSchema = string({ min: 1, max: LIMITS.answerLength });
export const answersSchema = nonEmptyArray(answerSchema, { max: LIMITS.answersPerEntry });
export const verbFormSchema = nullable(
  object({ kind: literal(...VERB_FORM_KINDS), base: answerSchema }),
);

export const countSchema = number({ min: 0, max: LIMITS.entriesPerCollection, integer: true });

const contentShape = {
  chapter: groupNameSchema,
  lesson: groupNameSchema,
  prompt: promptSchema,
  answers: answersSchema,
  verbForm: verbFormSchema,
  linkedForms: array(answerSchema, { max: LIMITS.linkedFormsPerEntry }),
};

export const entryContentSchema: Schema<EntryContent> = object(contentShape);

export const entrySchema: Schema<Entry> = object({
  id: entryIdSchema,
  ...contentShape,
  createdAt: timestampSchema,
  archivedAt: nullable(timestampSchema),
});

export const archiveOrderSchema: Schema<ArchiveOrder> = array(
  object({
    chapter: groupNameSchema,
    lessons: array(groupNameSchema, { max: LIMITS.lessonsPerChapter }),
  }),
  { max: LIMITS.chapters },
);

export const snapshotSummarySchema: Schema<SnapshotSummary> = object({
  id: uuidSchema,
  createdAt: timestampSchema,
  reason: literal(...SNAPSHOT_REASONS),
  counts: object({ pool: countSchema, archive: countSchema }),
});

export function parseSnapshotSummary(record: unknown): SnapshotSummary | null {
  const result = parse(snapshotSummarySchema, record);
  return result.ok ? result.value : null;
}
