import type { ReactNode } from 'react';
import { componentGeometry } from '../../design/tokens';
import { cx } from '../../shared/cx';
import { Heading } from '../Heading/Heading';
import { useScrolledPast } from './useScrolledPast';
import styles from './NavigationBar.module.css';

export interface NavigationBarProps {
  readonly title: string;
  /** 大标题模式：标题先以 Large Title 显示在内容顶部，滚出后收进导航栏 */
  readonly largeTitle?: boolean;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  /** 标题元素的 id，便于页面 `<main aria-labelledby>` 引用 */
  readonly titleId?: string;
  readonly className?: string;
}

/**
 * 页面导航栏（每页唯一的 h1）。
 * 静止时透明，内容滚到其下方时才出现玻璃背景 —— 与 iOS 26 的滚动边缘效果一致；
 * 过渡只改变 opacity。
 */
export function NavigationBar({
  title,
  largeTitle = true,
  leading,
  trailing,
  titleId,
  className,
}: NavigationBarProps) {
  const [sentinelRef, isCollapsed] = useScrolledPast<HTMLDivElement>(
    componentGeometry.navBarHeight,
  );
  const idProps = titleId === undefined ? {} : { id: titleId };

  return (
    <>
      <div
        className={cx(styles.bar, className)}
        data-collapsed={isCollapsed ? '' : undefined}
        data-large-title={largeTitle ? '' : undefined}
      >
        <div className={styles.leading}>{leading}</div>
        {largeTitle ? (
          <div className={styles.inlineTitle} aria-hidden>
            {title}
          </div>
        ) : (
          <Heading level={1} className={styles.inlineTitle} {...idProps}>
            {title}
          </Heading>
        )}
        <div className={styles.trailing}>{trailing}</div>
      </div>
      {largeTitle && (
        <Heading level={1} className={styles.largeTitle} {...idProps}>
          {title}
        </Heading>
      )}
      <div ref={sentinelRef} className={styles.sentinel} aria-hidden />
    </>
  );
}
