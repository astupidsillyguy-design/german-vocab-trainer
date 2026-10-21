import { useRef, type ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { interaction } from '../../design/tokens';
import { useI18n } from '../../i18n';
import { cx } from '../../shared/cx';
import { LiquidGlass } from '../Glass/LiquidGlass';
import { usePressScale, useSelectionIndicator } from '../motion';
import styles from './TabBar.module.css';

export interface TabBarItem<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly href: string;
  readonly icon: ReactNode;
  /** 角标计数；0 或省略时不显示 */
  readonly badge?: number;
}

export interface TabBarProps<Id extends string> {
  /** 导航地标的读屏名称 */
  readonly label: string;
  readonly items: readonly TabBarItem<Id>[];
  readonly activeId: Id | null;
  /** `fixed` 固定在视口底部（应用内）；`inline` 用于设计系统展示 */
  readonly placement?: 'fixed' | 'inline';
  readonly className?: string;
}

interface TabLinkProps<Id extends string> {
  readonly item: TabBarItem<Id>;
  readonly isActive: boolean;
  readonly badgeFormat: Intl.NumberFormat;
}

function TabLink<Id extends string>({ item, isActive, badgeFormat }: TabLinkProps<Id>) {
  const ref = useRef<HTMLAnchorElement>(null);
  const onPressChange = usePressScale(ref, interaction.pressScale);
  const hasBadge = item.badge !== undefined && item.badge > 0;
  return (
    <Link
      ref={ref}
      href={item.href}
      className={styles.link}
      onPressChange={onPressChange}
      {...(isActive ? { 'aria-current': 'page' } : {})}
      data-active={isActive ? '' : undefined}
    >
      <span className={styles.icon} aria-hidden>
        {item.icon}
        {hasBadge && <span className={styles.badge}>{badgeFormat.format(item.badge ?? 0)}</span>}
      </span>
      <span className={styles.label}>{item.label}</span>
      {hasBadge && (
        <span className="visually-hidden">{` (${badgeFormat.format(item.badge ?? 0)})`}</span>
      )}
    </Link>
  );
}

/**
 * 手机底部 Tab Bar：悬浮的胶囊形玻璃（固定在视口上，背后滚过页面内容，因此始终用 CSS 玻璃）。
 * 各项等宽，选中指示块只做 translate（不触发布局）。按住横向拖动时指示块变成“水滴”跟随手指，
 * 松手落到哪一项就切换到哪一页（等同点击该项的链接）。
 * 使用普通链接 + aria-current，浏览器前进/后退、中键新开等行为天然可用。
 */
export function TabBar<Id extends string>({
  label,
  items,
  activeId,
  placement = 'fixed',
  className,
}: TabBarProps<Id>) {
  const { locale } = useI18n();
  const barRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const badgeFormat = new Intl.NumberFormat(locale);
  useSelectionIndicator({
    containerRef: barRef,
    count: items.length,
    index: activeIndex,
    onSelect: (index) => {
      listRef.current?.querySelectorAll('a').item(index).click();
    },
  });

  return (
    <nav aria-label={label} className={cx(styles.container, className)} data-placement={placement}>
      <LiquidGlass
        ref={barRef}
        variant="chrome"
        renderer="css"
        radius="capsule"
        elevation={3}
        className={styles.bar}
        style={{ '--tab-count': items.length }}
      >
        {activeIndex >= 0 && (
          <span className={styles.indicator} aria-hidden data-selection-indicator="" />
        )}
        <ul ref={listRef} className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <TabLink item={item} isActive={item.id === activeId} badgeFormat={badgeFormat} />
            </li>
          ))}
        </ul>
      </LiquidGlass>
    </nav>
  );
}
