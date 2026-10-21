import type { ReactNode } from 'react';
import {
  Dialog,
  Heading,
  OverlayArrow,
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
} from 'react-aria-components';
import { Surface } from '../Surface/Surface';
import styles from './Popover.module.css';

export { DialogTrigger as PopoverTrigger } from 'react-aria-components';

export interface PopoverProps {
  /** 有标题时作为对话框名称；没有标题时必须提供 aria-label */
  readonly title?: string;
  readonly 'aria-label'?: string;
  readonly placement?: AriaPopoverProps['placement'];
  readonly children: ReactNode;
}

/** 非模态气泡：点击外部或 Esc 关闭，焦点在关闭后回到触发按钮。 */
export function Popover({
  title,
  'aria-label': ariaLabel,
  placement = 'bottom',
  children,
}: PopoverProps) {
  return (
    <AriaPopover placement={placement} className={styles.popover}>
      <OverlayArrow className={styles.arrow}>
        <svg viewBox="0 0 12 12" aria-hidden>
          <path d="M0 0 L6 6 L12 0" />
        </svg>
      </OverlayArrow>
      <Surface material="thick" radius="lg" elevation={3} className={styles.panel}>
        <Dialog
          className={styles.dialog}
          {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
        >
          {title !== undefined && (
            <Heading slot="title" className={styles.title}>
              {title}
            </Heading>
          )}
          {children}
        </Dialog>
      </Surface>
    </AriaPopover>
  );
}
