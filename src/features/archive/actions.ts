/**
 * 归档库的修改操作：测验、编辑、改名、删除与排序。
 * 每个修改都同步生效（界面立即更新），写入存储在后台完成；成功后的通知带“撤销”，
 * 撤销只回退这一次修改涉及的词条，期间的其他修改不受影响。
 */
import {
  editArchiveEntry,
  entriesInSections,
  moveChapter,
  moveLesson,
  phaseOf,
  removeFromArchive,
  renameArchiveGroup,
  renamedGroup,
  restoreEntry,
  restoreRemoval,
  revertRename,
  type ArchiveGroup,
  type ArchiveTarget,
  type EditError,
  type EntryEdit,
  type EntryId,
  type Library,
  type QuizSection,
  type RenameError,
} from '../../domain';
import { useI18n } from '../../i18n';
import type { LibraryStore, UpdateOptions, UpdateResult } from '../../storage';
import { announce, toast, type ToastAction } from '../../ui';
import { useLibraryStore } from '../library';
import { useAppNavigation } from '../navigation';
import { useQuizStore } from '../quiz';

/**
 * 同步应用修改，返回后台写入的 Promise；词库尚不可写、或修改没有带来任何变化时返回 null。
 * 调用方应先确认修改确实有内容（例如编辑后与原词条不同）。
 */
function applyChange(
  store: LibraryStore,
  recipe: (library: Library) => Library,
  options?: UpdateOptions,
): Promise<UpdateResult> | null {
  const before = store.getState().library;
  const saving = store.update(recipe, options);
  if (store.getState().library === before) {
    saving.catch(() => undefined);
    return null;
  }
  return saving;
}

interface UndoText {
  readonly label: string;
  readonly done: string;
  readonly failed: string;
}

/** `onUndone` 在撤销已应用到内存中的词库后同步调用 */
function undoAction(
  store: LibraryStore,
  recipe: (library: Library) => Library,
  text: UndoText,
  onUndone?: () => void,
): ToastAction {
  return {
    label: text.label,
    onAction: () => {
      const saving = applyChange(store, recipe);
      if (saving === null) {
        toast.error({ title: text.failed });
        return;
      }
      onUndone?.();
      void saving.then(
        () => toast.success({ title: text.done }),
        () => toast.error({ title: text.failed }),
      );
    },
  };
}

export interface ArchiveActions {
  /** F-048 / F-055：测试若干章节或课时（同一范围的测验尚未结束时继续，不打乱进度） */
  readonly test: (sections: readonly QuizSection[]) => void;
  /** F-051：成功（或内容没有变化）时返回 null */
  readonly edit: (id: EntryId, edit: EntryEdit) => EditError | null;
  /** F-052 / F-053：成功（或名称没有变化）时返回 null */
  readonly rename: (group: ArchiveGroup, name: string) => RenameError | null;
  /** F-054 */
  readonly remove: (target: ArchiveTarget) => void;
  /** F-045：把章节移到第 to 位（共 total 位） */
  readonly moveChapter: (chapter: string, to: number, total: number) => void;
  /** F-046 */
  readonly moveLesson: (chapter: string, lesson: string, to: number, total: number) => void;
}

export interface ArchiveActionOptions {
  /** 章节 / 课时改名（或撤销改名）已应用到内存中的词库后调用 */
  readonly onRenamed?: (from: ArchiveGroup, to: ArchiveGroup) => void;
}

export function useArchiveActions({ onRenamed }: ArchiveActionOptions = {}): ArchiveActions {
  const { messages } = useI18n();
  const text = messages.archive;
  const store = useLibraryStore();
  const quiz = useQuizStore();
  const navigation = useAppNavigation();

  const reportFailure = (): void => {
    toast.error({ title: text.failed });
  };

  const test = (sections: readonly QuizSection[]): void => {
    const questions = entriesInSections(store.getState().library.archive, sections);
    if (questions.length === 0) return;
    const previous = quiz.getState().session;
    const session = quiz.resumeOrStart(questions, { source: 'archive', sections });
    if (session === null) return;
    navigation.navigate('quiz');
    if (previous === null || previous === session || phaseOf(previous) === 'finished') return;
    // 换掉了一个还没做完的测验：给出撤销，回到之前的进度
    toast.show({
      title: text.review.replaced,
      description: text.review.replacedDescription,
      action: {
        label: messages.common.undo,
        onAction: () => {
          quiz.replace(previous);
          toast.success({ title: text.review.restored });
        },
      },
    });
  };

  const edit = (id: EntryId, change: EntryEdit): EditError | null => {
    const result = editArchiveEntry(store.getState().library, id, change);
    if (!result.ok) return result.error;
    const { previous } = result;
    if (previous === null) return null;
    const saving = applyChange(store, (library) => {
      const latest = editArchiveEntry(library, id, change);
      return latest.ok ? latest.library : library;
    });
    if (saving === null) {
      reportFailure();
      return null;
    }
    void saving.then(() => {
      toast.success({
        title: text.edit.saved,
        action: undoAction(store, (library) => restoreEntry(library, previous), {
          label: messages.common.undo,
          done: text.edit.undone,
          failed: text.failed,
        }),
      });
    }, reportFailure);
    return null;
  };

  const rename = (group: ArchiveGroup, name: string): RenameError | null => {
    const result = renameArchiveGroup(store.getState().library, group, name);
    if (!result.ok) return result.error;
    const { rename: change } = result;
    if (change === null) return null;
    const saving = applyChange(store, (library) => {
      const latest = renameArchiveGroup(library, group, name);
      return latest.ok ? latest.library : library;
    });
    if (saving === null) {
      reportFailure();
      return null;
    }
    const renamed = renamedGroup(change.group, change.name);
    onRenamed?.(change.group, renamed);
    void saving.then(() => {
      toast.success({
        title: text.rename.renamed(change.name),
        action: undoAction(
          store,
          (library) => revertRename(library, change),
          { label: messages.common.undo, done: text.rename.undone, failed: text.failed },
          () => onRenamed?.(renamed, change.group),
        ),
      });
    }, reportFailure);
    return null;
  };

  const remove = (target: ArchiveTarget): void => {
    const { removal } = removeFromArchive(store.getState().library, target);
    if (removal.removed.length === 0) return;
    // 删除整个课时或章节前保存快照（设置 → 快照历史可找回）；单个词只靠通知撤销
    const saving = applyChange(
      store,
      (library) => removeFromArchive(library, target).library,
      target.kind === 'entry' ? {} : { snapshot: 'delete' },
    );
    if (saving === null) {
      reportFailure();
      return;
    }
    void saving.then(() => {
      toast.success({
        title: text.remove.removed(removal.removed.length),
        action: undoAction(store, (library) => restoreRemoval(library, removal), {
          label: messages.common.undo,
          done: text.remove.undone,
          failed: text.failed,
        }),
      });
    }, reportFailure);
  };

  const reorder = (
    recipe: (library: Library) => Library,
    name: string,
    to: number,
    total: number,
  ) => {
    const saving = applyChange(store, recipe);
    if (saving === null) {
      toast.error({ title: text.reorder.failed });
      return;
    }
    announce(text.reorder.moved(name, to + 1, total));
    saving.catch(() => {
      toast.error({ title: text.reorder.failed });
    });
  };

  return {
    test,
    edit,
    rename,
    remove,
    moveChapter: (chapter, to, total) => {
      reorder(
        (library) => ({ ...library, order: moveChapter(library.order, chapter, to) }),
        chapter,
        to,
        total,
      );
    },
    moveLesson: (chapter, lesson, to, total) => {
      reorder(
        (library) => ({ ...library, order: moveLesson(library.order, chapter, lesson, to) }),
        lesson,
        to,
        total,
      );
    },
  };
}
