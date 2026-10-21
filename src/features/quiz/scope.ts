/**
 * 测验范围与课时的显示名称。
 */
import type { QuizScope, QuizSection } from '../../domain';
import type { Messages } from '../../i18n';

const SECTION_SEPARATOR = ' + ';

export function sectionLabel(section: QuizSection, messages: Messages): string {
  return section.lesson === null
    ? section.chapter
    : messages.entry.section(section.chapter, section.lesson);
}

/** 整个集合：“全部待测词汇”；一个章节或课时：它的名称；多个：“组合测试 · A + B” */
export function scopeLabel(scope: QuizScope, messages: Messages): string {
  const [first, ...rest] = scope.sections;
  if (first === undefined) return messages.quiz.scope[scope.source];
  if (rest.length === 0) return sectionLabel(first, messages);
  return messages.quiz.scope.combined(
    scope.sections.map((section) => sectionLabel(section, messages)).join(SECTION_SEPARATOR),
  );
}
