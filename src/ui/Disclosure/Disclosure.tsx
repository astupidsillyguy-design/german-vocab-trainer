import { ChevronDown } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosureGroup,
  DisclosurePanel,
  Heading as AriaHeading,
  type Key,
} from 'react-aria-components';
import { componentGeometry } from '../../design/tokens';
import { cx } from '../../shared/cx';
import type { HeadingLevel } from '../Heading/Heading';
import { Surface } from '../Surface/Surface';
import styles from './Disclosure.module.css';

export type DisclosureAppearance = 'card' | 'inset';

export interface DisclosureProps {
  /** 在 AccordionGroup 中用于标识展开项 */
  readonly id?: string;
  readonly title: string;
  readonly subtitle?: string;
  /** 标题文字的语言（例如德语课时名用 de），影响读屏发音与断字 */
  readonly titleLang?: string;
  /** 标题行右侧的非交互信息（例如词数角标） */
  readonly accessory?: ReactNode;
  /** 标题行最左侧的控件（例如排序把手、复选框），与展开按钮并列而不是嵌在其中 */
  readonly leading?: ReactNode;
  /** 标题行右侧的操作按钮（例如“测本章”），同样与展开按钮并列 */
  readonly actions?: ReactNode;
  /** card：独立的玻璃卡片；inset：卡片内的次级分组（不再叠一层玻璃） */
  readonly appearance?: DisclosureAppearance;
  readonly headingLevel?: Exclude<HeadingLevel, 1>;
  readonly isExpanded?: boolean;
  readonly defaultExpanded?: boolean;
  readonly onExpandedChange?: (isExpanded: boolean) => void;
  readonly className?: string;
  /** 根元素（拖动排序时移动的就是它） */
  readonly ref?: Ref<HTMLDivElement>;
  /** 收起时仍保留在 DOM 中（隐藏）；内容很多时由调用方只在展开时传入 */
  readonly children: ReactNode;
}

function Frame({
  appearance,
  children,
}: {
  readonly appearance: DisclosureAppearance;
  readonly children: ReactNode;
}) {
  return appearance === 'card' ? (
    <Surface material="regular" radius="lg" elevation={1}>
      {children}
    </Surface>
  ) : (
    <div className={styles.inset}>{children}</div>
  );
}

/**
 * 展开状态写在箭头与面板自身上，而不是只靠根元素的 data-expanded：
 * 章节里嵌套着课时，后代选择器会让展开的章节把内部所有课时的箭头和面板都当作“已展开”。
 */
function expandedAttribute(isExpanded: boolean): { readonly 'data-expanded'?: true } {
  return isExpanded ? { 'data-expanded': true } : {};
}

/**
 * 可折叠区块（原版“章节/课时”折叠列表）。
 * 标题是带 aria-expanded 的按钮，包在语义标题内，读屏可以按标题跳转。
 * 展开按钮的点击区域铺满整个标题行（伪元素），把手与操作按钮浮在其上，互不嵌套。
 * 展开时只旋转箭头（transform）；面板高度不做动画，避免触发逐帧布局。
 */
export function Disclosure({
  id,
  title,
  subtitle,
  titleLang,
  accessory,
  leading,
  actions,
  appearance = 'card',
  headingLevel = 3,
  isExpanded,
  defaultExpanded,
  onExpandedChange,
  className,
  ref,
  children,
}: DisclosureProps) {
  const state = {
    ...(id === undefined ? {} : { id }),
    ...(isExpanded === undefined ? {} : { isExpanded }),
    ...(defaultExpanded === undefined ? {} : { defaultExpanded }),
    ...(onExpandedChange === undefined ? {} : { onExpandedChange }),
  };

  return (
    <AriaDisclosure
      {...state}
      ref={ref}
      className={cx(styles.disclosure, className)}
      data-appearance={appearance}
    >
      {({ isExpanded: expanded }) => (
        <Frame appearance={appearance}>
          <div className={styles.header}>
            {leading !== undefined && <div className={styles.leading}>{leading}</div>}
            <AriaHeading level={headingLevel} className={styles.heading}>
              <AriaButton slot="trigger" className={styles.trigger}>
                <span className={styles.text}>
                  <span
                    className={styles.title}
                    {...(titleLang === undefined ? {} : { lang: titleLang })}
                  >
                    {title}
                  </span>
                  {subtitle !== undefined && <span className={styles.subtitle}>{subtitle}</span>}
                </span>
                {accessory !== undefined && <span className={styles.accessory}>{accessory}</span>}
              </AriaButton>
            </AriaHeading>
            {actions !== undefined && <div className={styles.actions}>{actions}</div>}
            <ChevronDown
              className={styles.chevron}
              size={componentGeometry.iconMd}
              aria-hidden
              {...expandedAttribute(expanded)}
            />
          </div>
          <DisclosurePanel className={styles.panel} {...expandedAttribute(expanded)}>
            {children}
          </DisclosurePanel>
        </Frame>
      )}
    </AriaDisclosure>
  );
}

export interface AccordionGroupProps {
  /** 默认一次只展开一项（与原版一致） */
  readonly allowsMultipleExpanded?: boolean;
  /** 在组内时展开状态由组统一管理（子项的 defaultExpanded 不生效），用子项 id 指定 */
  readonly expandedKeys?: Iterable<string>;
  readonly defaultExpandedKeys?: Iterable<string>;
  readonly onExpandedChange?: (keys: Set<string>) => void;
  readonly className?: string;
  readonly children: ReactNode;
}

export function AccordionGroup({
  allowsMultipleExpanded = false,
  expandedKeys,
  defaultExpandedKeys,
  onExpandedChange,
  className,
  children,
}: AccordionGroupProps) {
  const state = {
    ...(expandedKeys === undefined ? {} : { expandedKeys }),
    ...(defaultExpandedKeys === undefined ? {} : { defaultExpandedKeys }),
    ...(onExpandedChange === undefined
      ? {}
      : {
          onExpandedChange: (keys: Set<Key>) => {
            onExpandedChange(new Set([...keys].map(String)));
          },
        }),
  };
  return (
    <DisclosureGroup
      {...state}
      allowsMultipleExpanded={allowsMultipleExpanded}
      className={cx(styles.group, className)}
    >
      {children}
    </DisclosureGroup>
  );
}
