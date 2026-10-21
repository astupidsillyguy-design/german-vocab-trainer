import { Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { componentGeometry } from '../../design/tokens';
import {
  chapterSelection,
  lessonKey,
  type ArchiveGroup,
  type ChapterGroup,
  type ChapterSelection,
  type Entry,
  type LessonGroup,
  type QuizSection,
} from '../../domain';
import { useI18n, type Messages } from '../../i18n';
import {
  AccordionGroup,
  Button,
  Checkbox,
  Disclosure,
  IconButton,
  ReorderHandle,
  useReorder,
  type ReorderControls,
} from '../../ui';
import { EntryRow } from './EntryRow';
import { focusKeyProps } from './focus';
import { useArchiveView, type ArchiveView } from './view';
import styles from './ArchivePage.module.css';

const DETAIL_SEPARATOR = ' · ';

interface GroupControlsProps {
  readonly view: ArchiveView;
  readonly text: Messages['archive'];
  readonly group: ArchiveGroup;
  readonly name: string;
  readonly selection: ChapterSelection;
  readonly onToggle: () => void;
  readonly reorder: ReorderControls;
  readonly index: number;
  readonly total: number;
}

/** 标题行左侧：组合模式下是复选框，可排序时是把手 */
function leadingOf({
  view,
  text,
  group,
  name,
  selection,
  onToggle,
  reorder,
  index,
  total,
}: GroupControlsProps): ReactNode {
  if (view.isCombo) {
    return (
      <Checkbox
        isSelected={selection === 'all'}
        isIndeterminate={selection === 'some'}
        onChange={onToggle}
      >
        <span className="visually-hidden">{text.combo.select(name)}</span>
      </Checkbox>
    );
  }
  if (!view.canReorder || total < 2) return undefined;
  return (
    <ReorderHandle
      {...reorder.handleProps(index)}
      label={group.kind === 'chapter' ? text.reorder.chapter(name) : text.reorder.lesson(name)}
      describedBy={view.reorderHintId}
    />
  );
}

/** 标题行右侧：浏览时“测本章 / 测本课”，编辑模式改名，删除模式删除 */
function actionsOf(
  view: ArchiveView,
  text: Messages['archive'],
  group: ArchiveGroup,
  name: string,
): ReactNode {
  if (view.isCombo) return undefined;
  const isChapter = group.kind === 'chapter';
  if (view.mode === 'edit') {
    return (
      <IconButton
        size="sm"
        variant="tinted"
        icon={<Pencil size={componentGeometry.iconSm} />}
        label={isChapter ? text.rename.chapterLabel(name) : text.rename.lessonLabel(name)}
        {...focusKeyProps(group)}
        onPress={() => {
          view.openRename(group);
        }}
      />
    );
  }
  if (view.mode === 'delete') {
    return (
      <IconButton
        size="sm"
        variant="destructive"
        icon={<Trash2 size={componentGeometry.iconSm} />}
        label={isChapter ? text.remove.chapterLabel(name) : text.remove.lessonLabel(name)}
        {...focusKeyProps(group)}
        onPress={() => {
          view.openRemove(group, name);
        }}
      />
    );
  }
  const section: QuizSection =
    group.kind === 'chapter'
      ? { chapter: group.chapter, lesson: null }
      : { chapter: group.chapter, lesson: group.lesson };
  return (
    <Button
      size="sm"
      variant="tinted"
      aria-label={isChapter ? text.testChapterLabel(name) : text.testLessonLabel(name)}
      onPress={() => {
        view.actions.test([section]);
      }}
    >
      {isChapter ? text.testChapter : text.testLesson}
    </Button>
  );
}

interface LessonCardProps {
  readonly lesson: LessonGroup<Entry>;
  readonly index: number;
  readonly total: number;
  readonly reorder: ReorderControls;
}

function LessonCard({ lesson, index, total, reorder }: LessonCardProps) {
  const { messages } = useI18n();
  const text = messages.archive;
  const view = useArchiveView();
  const name = lesson.lesson;
  const group: ArchiveGroup = { kind: 'lesson', chapter: lesson.chapter, lesson: name };
  const isExpanded = view.expansion.lessons(lesson.chapter).has(name);
  const isSelected = view.selected.has(lessonKey(lesson.chapter, name));
  return (
    <Disclosure
      ref={reorder.itemRef(index)}
      id={name}
      title={name}
      subtitle={text.wordCount(lesson.entries.length)}
      appearance="inset"
      headingLevel={3}
      leading={leadingOf({
        view,
        text,
        group,
        name,
        selection: isSelected ? 'all' : 'none',
        onToggle: () => {
          view.toggleLesson(lesson.chapter, name);
        },
        reorder,
        index,
        total,
      })}
      actions={actionsOf(view, text, group, name)}
    >
      {/* 只在展开时渲染词条：归档库可能有数千个词 */}
      {isExpanded ? (
        <ul className={styles.entries}>
          {lesson.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : null}
    </Disclosure>
  );
}

function LessonList({ group }: { readonly group: ChapterGroup<Entry> }) {
  const view = useArchiveView();
  const { lessons, chapter } = group;
  const reorder = useReorder({
    count: lessons.length,
    isDisabled: !view.canReorder,
    onMove: (from, to) => {
      const moved = lessons[from];
      if (moved !== undefined) view.actions.moveLesson(chapter, moved.lesson, to, lessons.length);
    },
  });
  return (
    <AccordionGroup
      allowsMultipleExpanded={view.expansion.multipleLessons}
      expandedKeys={view.expansion.lessons(chapter)}
      onExpandedChange={(keys) => {
        view.expansion.setLessons(chapter, keys);
      }}
      className={styles.lessons}
    >
      {lessons.map((lesson, index) => (
        <LessonCard
          key={lesson.lesson}
          lesson={lesson}
          index={index}
          total={lessons.length}
          reorder={reorder}
        />
      ))}
    </AccordionGroup>
  );
}

interface ChapterCardProps {
  readonly group: ChapterGroup<Entry>;
  readonly index: number;
  readonly total: number;
  readonly reorder: ReorderControls;
}

function ChapterCard({ group, index, total, reorder }: ChapterCardProps) {
  const { messages } = useI18n();
  const text = messages.archive;
  const view = useArchiveView();
  const name = group.chapter;
  const target: ArchiveGroup = { kind: 'chapter', chapter: name };
  return (
    <Disclosure
      ref={reorder.itemRef(index)}
      id={name}
      title={name}
      subtitle={[text.lessonCount(group.lessons.length), text.wordCount(group.entryCount)].join(
        DETAIL_SEPARATOR,
      )}
      headingLevel={2}
      leading={leadingOf({
        view,
        text,
        group: target,
        name,
        selection: chapterSelection(group, view.selected),
        onToggle: () => {
          view.toggleChapter(name);
        },
        reorder,
        index,
        total,
      })}
      actions={actionsOf(view, text, target, name)}
    >
      {view.expansion.chapters.has(name) ? <LessonList group={group} /> : null}
    </Disclosure>
  );
}

export interface ChapterListProps {
  readonly groups: readonly ChapterGroup<Entry>[];
}

/** 两级折叠列表（F-044）：章节与课时都可以拖动或用键盘排序（F-045 / F-046） */
export function ChapterList({ groups }: ChapterListProps) {
  const view = useArchiveView();
  const reorder = useReorder({
    count: groups.length,
    isDisabled: !view.canReorder,
    onMove: (from, to) => {
      const moved = groups[from];
      if (moved !== undefined) view.actions.moveChapter(moved.chapter, to, groups.length);
    },
  });
  return (
    <AccordionGroup
      allowsMultipleExpanded={view.expansion.multipleChapters}
      expandedKeys={view.expansion.chapters}
      onExpandedChange={view.expansion.setChapters}
    >
      {groups.map((group, index) => (
        <ChapterCard
          key={group.chapter}
          group={group}
          index={index}
          total={groups.length}
          reorder={reorder}
        />
      ))}
    </AccordionGroup>
  );
}
