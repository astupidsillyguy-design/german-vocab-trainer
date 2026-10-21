import { useId, type ReactNode } from 'react';
import type { MaterialToken } from '../../design/tokens';
import { cx } from '../../shared/cx';
import { Heading, type HeadingLevel } from '../Heading/Heading';
import { Surface } from '../Surface/Surface';
import styles from './Card.module.css';

export interface CardProps {
  readonly title?: string;
  readonly subtitle?: string;
  /** 标题行右侧的内容（按钮、角标等） */
  readonly accessory?: ReactNode;
  readonly headingLevel?: Exclude<HeadingLevel, 1>;
  readonly material?: MaterialToken;
  /** 有标题的卡片默认是 section 地标；纯展示内容可用 div */
  readonly as?: 'section' | 'article' | 'div';
  readonly className?: string;
  readonly children?: ReactNode;
}

/** 玻璃卡片：可选标题行 + 内容区。有标题时自动用标题为区块命名。 */
export function Card({
  title,
  subtitle,
  accessory,
  headingLevel = 2,
  material = 'regular',
  as = 'section',
  className,
  children,
}: CardProps) {
  const titleId = useId();
  const hasHeader = title !== undefined || accessory !== undefined;

  return (
    <Surface
      as={as}
      material={material}
      radius="xl"
      elevation={2}
      className={cx(styles.card, className)}
      {...(title === undefined ? {} : { 'aria-labelledby': titleId })}
    >
      {hasHeader && (
        <div className={styles.header}>
          <div className={styles.text}>
            {title !== undefined && (
              <Heading level={headingLevel} id={titleId} className={styles.title}>
                {title}
              </Heading>
            )}
            {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {accessory !== undefined && <div className={styles.accessory}>{accessory}</div>}
        </div>
      )}
      {children !== undefined && <div className={styles.body}>{children}</div>}
    </Surface>
  );
}
