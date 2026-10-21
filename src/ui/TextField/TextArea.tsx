import type { Ref } from 'react';
import {
  FieldError,
  Label,
  Text,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components';
import { cx } from '../../shared/cx';
import styles from './Field.module.css';

export interface TextAreaProps extends Omit<
  AriaTextFieldProps,
  'className' | 'style' | 'children'
> {
  readonly label: string;
  readonly hideLabel?: boolean;
  readonly description?: string;
  readonly errorMessage?: string;
  readonly placeholder?: string;
  readonly rows?: number;
  /** 等宽字体，适合编辑结构化词表 */
  readonly monospace?: boolean;
  readonly autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** 需要操作选区或滚动位置时（例如把光标定位到出错的行） */
  readonly inputRef?: Ref<HTMLTextAreaElement>;
  readonly className?: string;
}

const DEFAULT_ROWS = 8;

export function TextArea({
  label,
  hideLabel = false,
  description,
  errorMessage,
  placeholder,
  rows = DEFAULT_ROWS,
  monospace = false,
  autoCapitalize,
  inputRef,
  className,
  ...rest
}: TextAreaProps) {
  return (
    <AriaTextField {...rest} className={cx(styles.field, className)} data-size="md">
      <Label className={cx(styles.label, hideLabel && 'visually-hidden')}>{label}</Label>
      <AriaTextArea
        ref={inputRef}
        className={styles.textarea}
        rows={rows}
        {...(autoCapitalize === undefined ? {} : { autoCapitalize })}
        data-monospace={monospace ? '' : undefined}
        {...(placeholder === undefined ? {} : { placeholder })}
      />
      {description !== undefined && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
