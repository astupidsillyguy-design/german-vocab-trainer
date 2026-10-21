/**
 * 预览的分段与分页：按章节 · 课时分段，筛选“全部 / 有问题”，并限制一次渲染的行数。
 * 纯函数，与界面无关，便于单独测试。
 */
import type { ParsedLine } from '../../domain';

export const PREVIEW_FILTERS = ['all', 'problems'] as const;
export type PreviewFilter = (typeof PREVIEW_FILTERS)[number];

/** 预览中逐行显示的内容（章节、课时标题作为分段标题，不单独成行） */
export type PreviewLine = Exclude<ParsedLine, { readonly kind: 'chapter' | 'lesson' }>;

export interface PreviewSection {
  /** 本段第一行的行号，作为稳定的 key */
  readonly key: number;
  readonly chapter: string;
  readonly lesson: string;
  readonly lines: readonly PreviewLine[];
}

export interface PreviewPage {
  readonly sections: readonly PreviewSection[];
  /** 已显示的行数 */
  readonly shown: number;
  /** 符合筛选条件的总行数 */
  readonly total: number;
}

export interface SectionDefaults {
  readonly defaultChapter: string;
  readonly defaultLesson: string;
}

export function isProblemLine(line: PreviewLine): boolean {
  return line.kind !== 'entry';
}

/**
 * lines 按原文顺序。只有一段时也保留分段标题，用户能看到词条将被归入哪个章节与课时。
 */
export function previewPage(
  lines: readonly ParsedLine[],
  defaults: SectionDefaults,
  filter: PreviewFilter,
  limit: number,
): PreviewPage {
  const sections: PreviewSection[] = [];
  let chapter = defaults.defaultChapter;
  let lesson = defaults.defaultLesson;
  let current: { key: number; chapter: string; lesson: string; lines: PreviewLine[] } | null = null;
  let shown = 0;
  let total = 0;

  for (const line of lines) {
    if (line.kind === 'chapter') {
      chapter = line.name;
      lesson = defaults.defaultLesson;
      current = null;
      continue;
    }
    if (line.kind === 'lesson') {
      lesson = line.name;
      current = null;
      continue;
    }
    if (filter === 'problems' && !isProblemLine(line)) continue;
    total += 1;
    if (shown >= limit) continue;
    if (current === null) {
      current = { key: line.number, chapter, lesson, lines: [] };
      sections.push(current);
    }
    current.lines.push(line);
    shown += 1;
  }
  return { sections, shown, total };
}
