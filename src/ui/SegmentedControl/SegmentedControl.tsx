import { useRef, type ReactNode } from 'react';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { interaction } from '../../design/tokens';
import { cx } from '../../shared/cx';
import { usePressScale, useSelectionIndicator } from '../motion';
import styles from './SegmentedControl.module.css';

export interface SegmentedItem<Key extends string> {
  readonly id: Key;
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface SegmentedControlProps<Key extends string> {
  /** 读屏标签 */
  readonly label: string;
  readonly items: readonly SegmentedItem<Key>[];
  readonly selectedKey: Key;
  readonly onSelectionChange: (key: Key) => void;
  readonly size?: 'sm' | 'md';
  readonly isDisabled?: boolean;
  readonly className?: string;
}

interface SegmentProps<Key extends string> {
  readonly item: SegmentedItem<Key>;
}

function Segment<Key extends string>({ item }: SegmentProps<Key>) {
  const ref = useRef<HTMLButtonElement>(null);
  const onPressChange = usePressScale(ref, interaction.pressScale);
  return (
    <ToggleButton ref={ref} id={item.id} className={styles.segment} onPressChange={onPressChange}>
      {item.icon !== undefined && (
        <span className={styles.icon} aria-hidden>
          {item.icon}
        </span>
      )}
      {item.label}
    </ToggleButton>
  );
}

/**
 * 分段控件。各段等宽（与 iOS 一致），因此选中块只需 translate，不触发布局；
 * 选中块可以按住拖到另一段（松手即选中），方向键在各段之间移动，读屏识别为单选组。
 */
export function SegmentedControl<Key extends string>({
  label,
  items,
  selectedKey,
  onSelectionChange,
  size = 'md',
  isDisabled = false,
  className,
}: SegmentedControlProps<Key>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    items.findIndex((item) => item.id === selectedKey),
    0,
  );
  const indicator = useSelectionIndicator({
    containerRef: groupRef,
    count: items.length,
    index: selectedIndex,
    isDisabled,
    onSelect: (index) => {
      const next = items[index];
      if (next !== undefined) onSelectionChange(next.id);
    },
  });

  return (
    <ToggleButtonGroup
      ref={groupRef}
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[selectedKey]}
      isDisabled={isDisabled}
      onSelectionChange={(keys) => {
        // 拖动结束时由指示块负责选择；忽略拖动途中按钮自身触发的变更
        if (indicator.didDrag()) return;
        const next = items.find((item) => keys.has(item.id));
        if (next) onSelectionChange(next.id);
      }}
      className={cx(styles.group, className)}
      data-size={size}
      style={{ '--segment-count': items.length }}
    >
      <span className={styles.thumb} aria-hidden data-selection-indicator="" />
      {items.map((item) => (
        <Segment key={item.id} item={item} />
      ))}
    </ToggleButtonGroup>
  );
}
