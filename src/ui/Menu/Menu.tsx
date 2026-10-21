import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  Popover as AriaPopover,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  type PopoverProps as AriaPopoverProps,
} from 'react-aria-components';
import { componentGeometry } from '../../design/tokens';
import { Surface } from '../Surface/Surface';
import styles from './Menu.module.css';

export { MenuTrigger } from 'react-aria-components';

export interface MenuProps<T extends object> extends Omit<AriaMenuProps<T>, 'className' | 'style'> {
  readonly placement?: AriaPopoverProps['placement'];
}

/**
 * 下拉菜单面板（selectionMode="single" 时为单选菜单，选中项前显示对勾）：方向键导航、首字母跳转、Esc 关闭并把焦点还给触发按钮。
 * 必须放在 <MenuTrigger> 内，菜单的可访问名称取自触发按钮（aria-labelledby）。
 */
export function Menu<T extends object>({ placement = 'bottom end', ...rest }: MenuProps<T>) {
  return (
    <AriaPopover placement={placement} className={styles.popover}>
      <Surface material="thick" radius="md" elevation={3} className={styles.panel}>
        <AriaMenu {...rest} className={styles.menu} />
      </Surface>
    </AriaPopover>
  );
}

export interface MenuItemProps extends Omit<
  AriaMenuItemProps,
  'className' | 'style' | 'children' | 'textValue'
> {
  readonly children: string;
  readonly icon?: ReactNode;
  readonly isDestructive?: boolean;
  /** 快捷键提示文字，例如 “⌘R” */
  readonly shortcut?: string;
}

export function MenuItem({
  children,
  icon,
  isDestructive = false,
  shortcut,
  ...rest
}: MenuItemProps) {
  return (
    <AriaMenuItem
      {...rest}
      textValue={children}
      className={styles.item}
      data-destructive={isDestructive ? '' : undefined}
    >
      {({ selectionMode, isSelected }) => (
        <>
          {selectionMode !== 'none' && (
            <span className={styles.check} aria-hidden>
              {isSelected && <Check size={componentGeometry.iconSm} />}
            </span>
          )}
          {icon !== undefined && (
            <span className={styles.icon} aria-hidden>
              {icon}
            </span>
          )}
          <span className={styles.itemLabel}>{children}</span>
          {shortcut !== undefined && <kbd className={styles.shortcut}>{shortcut}</kbd>}
        </>
      )}
    </AriaMenuItem>
  );
}
