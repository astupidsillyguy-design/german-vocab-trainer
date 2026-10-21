import { X } from 'lucide-react';
import { useRef, type ReactNode, type Ref } from 'react';
import {
  Button as AriaButton,
  FieldError,
  Input,
  Label,
  Text,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components';
import { componentGeometry, iconStroke } from '../../design/tokens';
import { useI18n } from '../../i18n';
import { cx } from '../../shared/cx';
import { useMergedRefs } from '../hooks/mergeRefs';
import { useControllableState } from '../hooks/useControllableState';
import styles from './Field.module.css';

export interface TextFieldProps extends Omit<
  AriaTextFieldProps,
  'className' | 'style' | 'children' | 'value' | 'defaultValue' | 'onChange'
> {
  readonly label: string;
  /** 视觉上隐藏标签（读屏仍可读到） */
  readonly hideLabel?: boolean;
  readonly description?: string;
  readonly errorMessage?: string;
  readonly placeholder?: string;
  readonly size?: 'md' | 'xl';
  readonly isClearable?: boolean;
  readonly leadingIcon?: ReactNode;
  /** 输入内容的语言（例如德语答案用 de），影响读屏发音与输入法 */
  readonly inputLang?: string;
  readonly autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly className?: string;
}

/** 单行文本输入，支持清除按钮、说明文字与错误提示。 */
export function TextField({
  label,
  hideLabel = false,
  description,
  errorMessage,
  placeholder,
  size = 'md',
  isClearable = false,
  leadingIcon,
  inputLang,
  autoCapitalize,
  value,
  defaultValue = '',
  onChange,
  inputRef,
  className,
  ...rest
}: TextFieldProps) {
  const { messages } = useI18n();
  const [current, setCurrent] = useControllableState(value, defaultValue, onChange);
  const localInputRef = useRef<HTMLInputElement>(null);
  const mergedInputRef = useMergedRefs(inputRef, localInputRef);
  const showClear =
    isClearable && current.length > 0 && rest.isDisabled !== true && rest.isReadOnly !== true;

  return (
    <AriaTextField
      {...rest}
      value={current}
      onChange={setCurrent}
      className={cx(styles.field, className)}
      data-size={size}
    >
      <Label className={cx(styles.label, hideLabel && 'visually-hidden')}>{label}</Label>
      <div className={styles.control}>
        {leadingIcon !== undefined && (
          <span className={styles.leading} aria-hidden>
            {leadingIcon}
          </span>
        )}
        <Input
          ref={mergedInputRef}
          className={styles.input}
          {...(placeholder === undefined ? {} : { placeholder })}
          {...(inputLang === undefined ? {} : { lang: inputLang })}
          {...(autoCapitalize === undefined ? {} : { autoCapitalize })}
        />
        {showClear && (
          <AriaButton
            className={styles.clear}
            aria-label={messages.common.clear}
            excludeFromTabOrder
            preventFocusOnPress
            onPress={() => {
              setCurrent('');
              localInputRef.current?.focus();
            }}
          >
            <X size={componentGeometry.iconSm} strokeWidth={iconStroke.semibold} aria-hidden />
          </AriaButton>
        )}
      </div>
      {description !== undefined && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
