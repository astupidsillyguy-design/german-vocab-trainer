import { Search, X } from 'lucide-react';
import {
  Button as AriaButton,
  Input,
  Label,
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
} from 'react-aria-components';
import { componentGeometry, iconStroke } from '../../design/tokens';
import { useI18n } from '../../i18n';
import { cx } from '../../shared/cx';
import styles from './Field.module.css';

export interface SearchFieldProps extends Omit<
  AriaSearchFieldProps,
  'className' | 'style' | 'children'
> {
  readonly label: string;
  readonly placeholder?: string;
  readonly className?: string;
}

/** 搜索框：Esc 清空，回车触发 onSubmit。标签默认只对读屏可见。 */
export function SearchField({ label, placeholder, className, ...rest }: SearchFieldProps) {
  const { messages } = useI18n();
  return (
    <AriaSearchField
      {...rest}
      className={cx(styles.field, className)}
      data-size="md"
      data-variant="search"
    >
      {({ isEmpty }) => (
        <>
          <Label className="visually-hidden">{label}</Label>
          <div className={styles.control}>
            <span className={styles.leading} aria-hidden>
              <Search size={componentGeometry.iconSm} />
            </span>
            <Input
              className={styles.input}
              {...(placeholder === undefined ? {} : { placeholder })}
            />
            {!isEmpty && (
              <AriaButton className={styles.clear} aria-label={messages.common.clear}>
                <X size={componentGeometry.iconSm} strokeWidth={iconStroke.semibold} aria-hidden />
              </AriaButton>
            )}
          </div>
        </>
      )}
    </AriaSearchField>
  );
}
