/**
 * 测试用词条：固定的 id 与时间，便于断言。
 */
import { createEntry, isEntryId, type Entry, type EntryDraft, type EntryId } from '../domain';

export const TEST_NOW = new Date('2025-01-15T08:30:00.000Z');

const HEX_RADIX = 16;
const SERIAL_DIGITS = 12;
let serial = 0;

export function testId(index: number): EntryId {
  const id = `00000000-0000-4000-8000-${index.toString(HEX_RADIX).padStart(SERIAL_DIGITS, '0')}`;
  if (!isEntryId(id)) throw new Error(`不是合法 UUID：${id}`);
  return id;
}

export function nextTestId(): EntryId {
  serial += 1;
  return testId(serial);
}

export interface TestEntryOptions extends Partial<EntryDraft> {
  readonly id?: EntryId;
  readonly archivedAt?: string | null;
}

export function makeEntry({ id, archivedAt = null, ...draft }: TestEntryOptions = {}): Entry {
  const result = createEntry(
    { chapter: 'A1', lesson: '第30讲', prompt: '柜子', answers: ['der Schrank'], ...draft },
    { id: id ?? nextTestId(), now: TEST_NOW, archivedAt },
  );
  if (!result.ok) throw new Error(`测试词条无效：${JSON.stringify(result.issues)}`);
  return result.value;
}

/** 在指定章节 / 课时下生成若干词条 */
export function makeLesson(chapter: string, lesson: string, prompts: readonly string[]): Entry[] {
  return prompts.map((prompt, index) =>
    makeEntry({ chapter, lesson, prompt, answers: [`Wort${String(index)} ${prompt}`] }),
  );
}
