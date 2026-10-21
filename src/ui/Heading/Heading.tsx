import type { ReactNode } from 'react';

export type HeadingLevel = 1 | 2 | 3 | 4;

const TAGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const satisfies Record<HeadingLevel, string>;

export interface HeadingProps {
  readonly level: HeadingLevel;
  readonly id?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/** 语义标题：层级由使用方决定，避免组件内部写死 h2/h3 打乱文档大纲。 */
export function Heading({ level, id, className, children }: HeadingProps) {
  const Tag = TAGS[level];
  return (
    <Tag {...(id === undefined ? {} : { id })} className={className}>
      {children}
    </Tag>
  );
}
