import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { componentGeometry, interaction } from '../../design/tokens';
import { useI18n } from '../../i18n';
import { cx } from '../../shared/cx';
import { IconButton } from '../Button/IconButton';
import { useControllableState } from '../hooks/useControllableState';
import { LiquidGlass } from '../Glass/LiquidGlass';
import { usePressScale } from '../motion';
import { useSidebarIndicator } from './useSidebarIndicator';
import styles from './Sidebar.module.css';

export interface SidebarItem<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly href: string;
  readonly icon: ReactNode;
  /** 右侧计数（例如归档词数）；省略时不显示 */
  readonly count?: number;
}

export interface SidebarSection<Id extends string> {
  readonly id: string;
  /** 分组标题；省略时该组不显示标题 */
  readonly title?: string;
  readonly items: readonly SidebarItem<Id>[];
}

export interface SidebarProps<Id extends string> {
  /** 导航地标的读屏名称 */
  readonly label: string;
  /** 顶部的应用名称 */
  readonly header: string;
  readonly sections: readonly SidebarSection<Id>[];
  readonly activeId: Id | null;
  readonly isCollapsed?: boolean;
  readonly defaultCollapsed?: boolean;
  readonly onCollapsedChange?: (isCollapsed: boolean) => void;
  /** `fixed` 固定在视口左侧（应用内）；`inline` 用于设计系统展示 */
  readonly placement?: 'fixed' | 'inline';
  readonly className?: string;
}

interface SidebarLinkProps<Id extends string> {
  readonly item: SidebarItem<Id>;
  readonly isActive: boolean;
  readonly isCollapsed: boolean;
  readonly countFormat: Intl.NumberFormat;
}

function SidebarLink<Id extends string>({
  item,
  isActive,
  isCollapsed,
  countFormat,
}: SidebarLinkProps<Id>) {
  const ref = useRef<HTMLAnchorElement>(null);
  const onPressChange = usePressScale(ref, interaction.pressScale);
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
      </span>
      <span className={cx(styles.label, isCollapsed && 'visually-hidden')}>{item.label}</span>
      {item.count !== undefined && (
        <span className={cx(styles.count, isCollapsed && 'visually-hidden')}>
          {countFormat.format(item.count)}
        </span>
      )}
    </Link>
  );
}

/**
 * 平板 / 桌面的侧边栏：悬浮玻璃面板。
 * 选中背景是一块独立的指示块，切换页面时以弹簧滑到新的一项；
 * 收起后只显示图标，文字改为视觉隐藏（读屏仍能读到完整名称）。
 */
export function Sidebar<Id extends string>({
  label,
  header,
  sections,
  activeId,
  isCollapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  placement = 'fixed',
  className,
}: SidebarProps<Id>) {
  const { messages, locale } = useI18n();
  const [collapsed, setCollapsed] = useControllableState(
    isCollapsed,
    defaultCollapsed,
    onCollapsedChange,
  );
  const listId = useId();
  const sectionsRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useSidebarIndicator(sectionsRef, indicatorRef, activeId);
  const countFormat = new Intl.NumberFormat(locale);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <nav
      aria-label={label}
      className={cx(styles.container, className)}
      data-placement={placement}
      data-collapsed={collapsed ? '' : undefined}
    >
      <LiquidGlass
        variant="regular"
        renderer="css"
        radius="xl"
        elevation={2}
        className={styles.panel}
      >
        <div className={styles.header}>
          <span className={cx(styles.appName, collapsed && 'visually-hidden')}>{header}</span>
          <IconButton
            label={collapsed ? messages.nav.expandSidebar : messages.nav.collapseSidebar}
            icon={<ToggleIcon size={componentGeometry.iconMd} aria-hidden />}
            variant="plain"
            size="sm"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onPress={() => {
              setCollapsed(!collapsed);
            }}
          />
        </div>
        <div ref={sectionsRef} id={listId} className={styles.sections}>
          <span
            ref={indicatorRef}
            className={styles.indicator}
            aria-hidden
            data-selection-indicator=""
          />
          {sections.map((section) => (
            <section
              key={section.id}
              className={styles.section}
              {...(section.title === undefined ? {} : { 'aria-label': section.title })}
            >
              {section.title !== undefined && (
                <p className={cx(styles.sectionTitle, collapsed && 'visually-hidden')} aria-hidden>
                  {section.title}
                </p>
              )}
              <ul className={styles.list}>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <SidebarLink
                      item={item}
                      isActive={item.id === activeId}
                      isCollapsed={collapsed}
                      countFormat={countFormat}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </LiquidGlass>
    </nav>
  );
}
