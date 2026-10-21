import { useState } from 'react';
import {
  chapterKey,
  lessonKey,
  type ArchiveGroup,
  type ChapterGroup,
  type Grouped,
} from '../../domain';

/**
 * 两级折叠的展开状态（F-044）。
 *
 * 浏览时与原版一致：章节一次只展开一个，每章内课时一次只展开一个；
 * 搜索时结果全部展开（结果很多时课时仍按浏览方式逐个展开，避免一次渲染上千行），
 * 用户在搜索结果中收起的组记在“已收起”里，换一个关键词就重新全部展开。
 * 章节或课时改名（以及撤销改名）后，展开状态跟随新名称，不会突然收起。
 */
export interface ArchiveExpansion {
  /** 是否允许同时展开多个章节 / 课时 */
  readonly multipleChapters: boolean;
  readonly multipleLessons: boolean;
  /** 已展开的章节名 */
  readonly chapters: ReadonlySet<string>;
  readonly setChapters: (chapters: ReadonlySet<string>) => void;
  /** 某章内已展开的课时名 */
  readonly lessons: (chapter: string) => ReadonlySet<string>;
  readonly setLessons: (chapter: string, lessons: ReadonlySet<string>) => void;
  /** 章节 / 课时改名后，让浏览时的展开状态跟随新名称 */
  readonly follow: (from: ArchiveGroup, to: ArchiveGroup) => void;
}

export interface BrowseState {
  readonly chapter: string | null;
  /** 章节 → 该章展开的课时（收起章节时保留，再展开时回到原来的课时） */
  readonly lessons: ReadonlyMap<string, string>;
}

interface SearchState {
  readonly query: string;
  readonly collapsed: ReadonlySet<string>;
}

const NOTHING: ReadonlySet<string> = new Set();
const INITIAL_BROWSE: BrowseState = { chapter: null, lessons: new Map() };
const INITIAL_SEARCH: SearchState = { query: '', collapsed: NOTHING };

function first(values: ReadonlySet<string>): string | null {
  for (const value of values) return value;
  return null;
}

/** 浏览状态里的旧名称换成新名称（搜索结果默认全部展开，无需跟随） */
export function followRename(
  state: BrowseState,
  from: ArchiveGroup,
  to: ArchiveGroup,
): BrowseState {
  if (from.kind === 'chapter') {
    const lessons = new Map(state.lessons);
    const lesson = lessons.get(from.chapter);
    lessons.delete(from.chapter);
    if (lesson !== undefined) lessons.set(to.chapter, lesson);
    return { chapter: state.chapter === from.chapter ? to.chapter : state.chapter, lessons };
  }
  if (to.kind !== 'lesson' || state.lessons.get(from.chapter) !== from.lesson) return state;
  return { ...state, lessons: new Map(state.lessons).set(from.chapter, to.lesson) };
}

export function useArchiveExpansion<T extends Grouped>(
  groups: readonly ChapterGroup<T>[],
  searchKey: string,
  expandAllLessons: boolean,
): ArchiveExpansion {
  const [browse, setBrowse] = useState(INITIAL_BROWSE);
  const [search, setSearch] = useState(INITIAL_SEARCH);
  const isSearching = searchKey !== '';
  const collapsed = search.query === searchKey ? search.collapsed : NOTHING;

  /** 搜索时：把 `keys` 中不在 `expanded` 里的记为已收起，其余取消收起 */
  const updateCollapsed = (entries: readonly (readonly [key: string, isExpanded: boolean])[]) => {
    const next = new Set(collapsed);
    for (const [key, isExpanded] of entries) {
      if (isExpanded) next.delete(key);
      else next.add(key);
    }
    setSearch({ query: searchKey, collapsed: next });
  };

  const browseLessons = (chapter: string): ReadonlySet<string> => {
    const lesson = browse.lessons.get(chapter);
    return lesson === undefined ? NOTHING : new Set([lesson]);
  };

  const setBrowseLessons = (chapter: string, lessons: ReadonlySet<string>): void => {
    setBrowse((current) => {
      const next = new Map(current.lessons);
      const lesson = first(lessons);
      if (lesson === null) next.delete(chapter);
      else next.set(chapter, lesson);
      return { ...current, lessons: next };
    });
  };

  const follow = (from: ArchiveGroup, to: ArchiveGroup): void => {
    setBrowse((current) => followRename(current, from, to));
  };

  if (!isSearching) {
    return {
      multipleChapters: false,
      multipleLessons: false,
      chapters: browse.chapter === null ? NOTHING : new Set([browse.chapter]),
      setChapters: (chapters) => {
        setBrowse((current) => ({ ...current, chapter: first(chapters) }));
      },
      lessons: browseLessons,
      setLessons: setBrowseLessons,
      follow,
    };
  }

  const groupOf = (chapter: string): ChapterGroup<T> | undefined =>
    groups.find((group) => group.chapter === chapter);

  return {
    multipleChapters: true,
    multipleLessons: expandAllLessons,
    chapters: new Set(
      groups.map(({ chapter }) => chapter).filter((chapter) => !collapsed.has(chapterKey(chapter))),
    ),
    setChapters: (chapters) => {
      updateCollapsed(groups.map(({ chapter }) => [chapterKey(chapter), chapters.has(chapter)]));
    },
    lessons: expandAllLessons
      ? (chapter) =>
          new Set(
            (groupOf(chapter)?.lessons ?? [])
              .map(({ lesson }) => lesson)
              .filter((lesson) => !collapsed.has(lessonKey(chapter, lesson))),
          )
      : browseLessons,
    setLessons: expandAllLessons
      ? (chapter, lessons) => {
          updateCollapsed(
            (groupOf(chapter)?.lessons ?? []).map(({ lesson }) => [
              lessonKey(chapter, lesson),
              lessons.has(lesson),
            ]),
          );
        }
      : setBrowseLessons,
    follow,
  };
}
