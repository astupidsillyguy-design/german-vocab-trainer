import { useId, type ReactNode } from 'react';
import { Button, Sheet } from '../../ui';
import styles from './ArchivePage.module.css';

export interface FormSheetProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly title: string;
  readonly submitLabel: string;
  /** 有未保存的修改时不允许点遮罩或下滑关闭，避免误触丢失输入 */
  readonly isDirty: boolean;
  readonly onSubmit: () => void;
  readonly fallbackFocus?: () => HTMLElement | null;
  readonly children: ReactNode;
}

/** 表单面板：保存按钮在标题栏（同 iOS 的“完成”），输入框中按回车同样提交 */
export function FormSheet({
  isOpen,
  onOpenChange,
  title,
  submitLabel,
  isDirty,
  onSubmit,
  fallbackFocus,
  children,
}: FormSheetProps) {
  const formId = useId();
  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      isDismissable={!isDirty}
      {...(fallbackFocus === undefined ? {} : { fallbackFocus })}
      actions={
        <Button type="submit" form={formId} size="sm" variant="filled">
          {submitLabel}
        </Button>
      }
    >
      <form
        id={formId}
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
      </form>
    </Sheet>
  );
}
