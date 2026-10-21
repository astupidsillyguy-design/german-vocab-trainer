import type { ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useI18n } from '../../i18n';
import { Button } from '../Button/Button';
import { Surface } from '../Surface/Surface';
import { FocusFallback } from './FocusFallback';
import styles from './Dialog.module.css';

export { DialogTrigger } from 'react-aria-components';

export interface AlertDialogProps {
  /** 受控用法；放在 <DialogTrigger> 内时可省略 */
  readonly isOpen?: boolean;
  readonly onOpenChange?: (isOpen: boolean) => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: 'default' | 'destructive';
  readonly onConfirm: () => void;
  /**
   * 关闭后焦点无处可回时（例如打开对话框的按钮随删除一起消失）返回应获得焦点的元素。
   * 默认由 React Aria 把焦点还给打开前的元素。
   */
  readonly fallbackFocus?: () => HTMLElement | null;
}

/**
 * 替代原版的 window.confirm()：模态、焦点锁定、Esc 取消。
 * 破坏性操作默认聚焦“取消”，防止误按回车造成数据丢失。
 */
export function AlertDialog({
  isOpen,
  onOpenChange,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  fallbackFocus,
}: AlertDialogProps) {
  const { messages } = useI18n();
  const controlled = {
    ...(isOpen === undefined ? {} : { isOpen }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
  };

  return (
    <ModalOverlay {...controlled} className={styles.overlay}>
      <Modal className={styles.modal}>
        <Surface material="thick" radius="xl" elevation={4} className={styles.panel}>
          <Dialog role="alertdialog" className={styles.dialog}>
            {({ close }) => (
              <>
                <Heading slot="title" className={styles.title}>
                  {title}
                </Heading>
                <div className={styles.message}>{children}</div>
                <div className={styles.actions}>
                  {/* 打开时焦点落在“安全”的按钮上（WAI-ARIA APG 警告对话框模式） */}
                  <Button
                    variant="glass"
                    fullWidth
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={tone === 'destructive'}
                    onPress={close}
                  >
                    {cancelLabel ?? messages.common.cancel}
                  </Button>
                  <Button
                    variant={tone === 'destructive' ? 'destructive' : 'filled'}
                    fullWidth
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={tone !== 'destructive'}
                    onPress={() => {
                      onConfirm();
                      close();
                    }}
                  >
                    {confirmLabel}
                  </Button>
                </div>
                {fallbackFocus !== undefined && <FocusFallback resolve={fallbackFocus} />}
              </>
            )}
          </Dialog>
        </Surface>
      </Modal>
    </ModalOverlay>
  );
}
