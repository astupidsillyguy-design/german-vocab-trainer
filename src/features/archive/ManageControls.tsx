import { useRef, type Ref } from 'react';
import { gesture } from '../../design/tokens';
import { useI18n } from '../../i18n';
import { Button, Surface } from '../../ui';
import { afterDoublePress, afterSinglePress, type ManageMode } from './manageMode';
import styles from './ArchivePage.module.css';

interface FirstPress {
  readonly time: number;
  readonly before: ManageMode;
}

export interface ManageButtonProps {
  readonly mode: ManageMode;
  readonly onChange: (mode: ManageMode) => void;
  /** “单击编辑、双击删除”说明的元素 id */
  readonly describedBy: string;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** 导航栏上的“管理”：单击进入（或退出）编辑模式，双击进入删除模式（F-050） */
export function ManageButton({ mode, onChange, describedBy, ref }: ManageButtonProps) {
  const { messages } = useI18n();
  const text = messages.archive.manage;
  const firstPress = useRef<FirstPress | null>(null);

  return (
    <Button
      ref={ref}
      size="sm"
      variant={mode === 'none' ? 'glass' : 'filled'}
      aria-pressed={mode !== 'none'}
      aria-describedby={describedBy}
      onPress={() => {
        const now = performance.now();
        const previous = firstPress.current;
        if (previous !== null && now - previous.time <= gesture.doublePressMs) {
          firstPress.current = null;
          onChange(afterDoublePress(previous.before));
          return;
        }
        firstPress.current = { time: now, before: mode };
        onChange(afterSinglePress(mode));
      }}
    >
      {text.label}
    </Button>
  );
}

export interface ModeBannerProps {
  readonly mode: ManageMode;
  readonly isCombo: boolean;
  readonly onChange: (mode: ManageMode) => void;
}

/**
 * 当前模式的说明与切换（键盘与读屏用户不必双击即可进入删除模式）。
 * 进入模式时的读屏播报由调用方负责，这里只是可见的说明。
 */
export function ModeBanner({ mode, isCombo, onChange }: ModeBannerProps) {
  const { messages } = useI18n();
  const text = messages.archive;
  if (isCombo) {
    return (
      <Surface material="regular" radius="lg" elevation={1} className={styles.banner}>
        <p className={styles.bannerText}>{text.combo.hint}</p>
      </Surface>
    );
  }
  if (mode === 'none') return null;
  const isEditing = mode === 'edit';
  return (
    <Surface
      material="regular"
      radius="lg"
      elevation={1}
      className={styles.banner}
      data-mode={mode}
    >
      <p className={styles.bannerText}>
        {isEditing ? text.manage.editBanner : text.manage.deleteBanner}
      </p>
      <div className={styles.bannerActions}>
        <Button
          size="sm"
          variant="tinted"
          onPress={() => {
            onChange(isEditing ? 'delete' : 'edit');
          }}
        >
          {isEditing ? text.manage.toDelete : text.manage.toEdit}
        </Button>
        <Button
          size="sm"
          variant="filled"
          onPress={() => {
            onChange('none');
          }}
        >
          {text.manage.done}
        </Button>
      </div>
    </Surface>
  );
}
