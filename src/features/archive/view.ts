import { createContext, useContext } from 'react';
import type { ArchiveGroup, ArchiveTarget, Entry } from '../../domain';
import type { ArchiveActions } from './actions';
import type { ArchiveExpansion } from './expansion';
import type { ManageMode } from './manageMode';

/**
 * 归档页内各层组件共享的状态与操作（章节 → 课时 → 词条三层，避免逐层传递十几个属性）。
 */
export interface ArchiveView {
  readonly mode: ManageMode;
  readonly isCombo: boolean;
  /** 浏览且未处于删除 / 组合模式时才能排序（搜索结果只是部分课时，无法确定位置） */
  readonly canReorder: boolean;
  /** 组合测试中已选的课时（lessonKey） */
  readonly selected: ReadonlySet<string>;
  readonly expansion: ArchiveExpansion;
  readonly actions: ArchiveActions;
  /** 排序操作说明的元素 id（把手的 aria-describedby） */
  readonly reorderHintId: string;
  readonly formatDate: (iso: string) => string;
  readonly openEdit: (entry: Entry) => void;
  readonly openRename: (group: ArchiveGroup) => void;
  /** name：对话框中显示的名称（词、课时或章节） */
  readonly openRemove: (target: ArchiveTarget, name: string) => void;
  readonly toggleLesson: (chapter: string, lesson: string) => void;
  readonly toggleChapter: (chapter: string) => void;
}

export const ArchiveViewContext = createContext<ArchiveView | null>(null);

export function useArchiveView(): ArchiveView {
  const view = useContext(ArchiveViewContext);
  if (view === null) throw new Error('useArchiveView 必须在归档页内部使用');
  return view;
}
