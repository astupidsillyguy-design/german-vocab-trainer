import type { ReactNode } from 'react';
import { cx } from '../../shared/cx';
import { Heading, type HeadingLevel } from '../Heading/Heading';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  /** 引导操作（例如“导入词表”） */
  readonly actions?: ReactNode;
  readonly headingLevel?: Exclude<HeadingLevel, 1>;
  readonly className?: string;
}

/** 空状态：说明为什么是空的，并给出下一步操作。 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, className)}>
      {icon !== undefined && (
        <div className={styles.icon} aria-hidden>
          {icon}
        </div>
      )}
      <Heading level={headingLevel} className={styles.title}>
        {title}
      </Heading>
      {description !== undefined && <div className={styles.description}>{description}</div>}
      {actions !== undefined && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
