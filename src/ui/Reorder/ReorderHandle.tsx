import { GripVertical } from 'lucide-react';
import { componentGeometry } from '../../design/tokens';
import { cx } from '../../shared/cx';
import type { ReorderHandleBindings } from './useReorder';
import styles from './ReorderHandle.module.css';

export interface ReorderHandleProps extends ReorderHandleBindings {
  /** 读屏标签，例如“调整章节‘第 1 章’的位置” */
  readonly label: string;
  /** 操作说明元素的 id（拖动、方向键、Home / End），聚焦时由读屏读出 */
  readonly describedBy?: string;
  readonly className?: string;
}

/**
 * 拖动排序的把手。原生按钮：可以 Tab 聚焦，用方向键移动；
 * `touch-action: none` 让触屏上的拖动不被页面滚动抢走（只作用于把手本身，列表其余部分照常滚动）。
 */
export function ReorderHandle({
  label,
  describedBy,
  className,
  onPointerDown,
  onKeyDown,
}: ReorderHandleProps) {
  return (
    <button
      type="button"
      className={cx(styles.handle, className)}
      aria-label={label}
      aria-describedby={describedBy}
      aria-keyshortcuts="ArrowUp ArrowDown Home End"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <GripVertical size={componentGeometry.iconMd} aria-hidden />
    </button>
  );
}
