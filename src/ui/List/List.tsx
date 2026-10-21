import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button as AriaButton, Link } from 'react-aria-components';
import { componentGeometry } from '../../design/tokens';
import { cx } from '../../shared/cx';
import { Heading, type HeadingLevel } from '../Heading/Heading';
import { Surface } from '../Surface/Surface';
import styles from './List.module.css';

export interface ListGroupProps {
  readonly header?: string;
  readonly footer?: ReactNode;
  readonly headingLevel?: Exclude<HeadingLevel, 1>;
  readonly className?: string;
  readonly children: ReactNode;
}

/** iOS“分组列表”（Inset Grouped）：一组行放在同一块玻璃面板上，行间为缩进分隔线。 */
export function ListGroup({
  header,
  footer,
  headingLevel = 2,
  className,
  children,
}: ListGroupProps) {
  const headerId = useId();
  return (
    <section
      className={cx(styles.group, className)}
      {...(header === undefined ? {} : { 'aria-labelledby': headerId })}
    >
      {header !== undefined && (
        <Heading level={headingLevel} id={headerId} className={styles.header}>
          {header}
        </Heading>
      )}
      <Surface material="regular" radius="lg" elevation={1}>
        <ul className={styles.rows}>{children}</ul>
      </Surface>
      {footer !== undefined && <div className={styles.footer}>{footer}</div>}
    </section>
  );
}

interface ListRowBaseProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly leading?: ReactNode;
  /** 标题文字的语言（例如德语单词用 de），影响读屏发音与断字 */
  readonly titleLang?: string;
  readonly className?: string;
}

interface StaticRowProps extends ListRowBaseProps {
  /** 静态行右侧内容，可以放 Switch 等交互控件 */
  readonly trailing?: ReactNode;
  readonly onAction?: never;
  readonly href?: never;
}

interface ActionRowProps extends ListRowBaseProps {
  /** 整行可点；为避免交互元素嵌套，右侧只能放非交互内容（例如数值） */
  readonly detail?: string;
  readonly onAction: () => void;
  readonly showChevron?: boolean;
  readonly href?: never;
}

interface LinkRowProps extends ListRowBaseProps {
  readonly detail?: string;
  readonly href: string;
  readonly showChevron?: boolean;
  readonly onAction?: never;
}

export type ListRowProps = StaticRowProps | ActionRowProps | LinkRowProps;

function RowContent({
  title,
  subtitle,
  leading,
  titleLang,
  trailing,
}: ListRowBaseProps & { readonly trailing: ReactNode }) {
  return (
    <>
      {leading !== undefined && (
        <span className={styles.leading} aria-hidden>
          {leading}
        </span>
      )}
      <span className={styles.text}>
        <span className={styles.title} {...(titleLang === undefined ? {} : { lang: titleLang })}>
          {title}
        </span>
        {subtitle !== undefined && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
      {trailing}
    </>
  );
}

function Accessory({
  detail,
  showChevron,
}: {
  readonly detail: string | undefined;
  readonly showChevron: boolean;
}) {
  return (
    <span className={styles.trailing}>
      {detail !== undefined && <span className={styles.detail}>{detail}</span>}
      {showChevron && (
        <ChevronRight className={styles.chevron} size={componentGeometry.iconMd} aria-hidden />
      )}
    </span>
  );
}

export function ListRow(props: ListRowProps) {
  const { title, subtitle, leading, titleLang, className } = props;
  const base = {
    title,
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(leading === undefined ? {} : { leading }),
    ...(titleLang === undefined ? {} : { titleLang }),
  };

  if (props.onAction !== undefined) {
    return (
      <li className={cx(styles.row, className)}>
        <AriaButton className={styles.interactive} onPress={props.onAction}>
          <RowContent
            {...base}
            trailing={<Accessory detail={props.detail} showChevron={props.showChevron ?? false} />}
          />
        </AriaButton>
      </li>
    );
  }

  if (props.href !== undefined) {
    return (
      <li className={cx(styles.row, className)}>
        <Link className={styles.interactive} href={props.href}>
          <RowContent
            {...base}
            trailing={<Accessory detail={props.detail} showChevron={props.showChevron ?? true} />}
          />
        </Link>
      </li>
    );
  }

  return (
    <li className={cx(styles.row, className)}>
      <div className={styles.static}>
        <RowContent
          {...base}
          trailing={
            props.trailing === undefined ? null : (
              <span className={styles.trailing}>{props.trailing}</span>
            )
          }
        />
      </div>
    </li>
  );
}

export interface ListItemProps {
  readonly className?: string;
  readonly children: ReactNode;
}

/** 自定义内容行（例如标签在上、分段控件或滑块在下），与其他行共用分隔线 */
export function ListItem({ className, children }: ListItemProps) {
  return (
    <li className={cx(styles.row, className)}>
      <div className={styles.custom}>{children}</div>
    </li>
  );
}
