import { useCallback, type RefObject } from 'react';
import { interaction } from '../../design/tokens';
import { usePointerHighlight } from '../Glass/usePointerHighlight';
import { usePressScale } from '../motion';
import type { ButtonVariant } from './Button';

export type PressableVariant = ButtonVariant | 'key';

/** 玻璃按钮像水滴一样微微鼓起；实色按钮缩小；特殊字符键缩得更明显（像真实按键被按下） */
export function pressScaleFor(variant: PressableVariant): number {
  if (variant === 'glass') return interaction.glassPressScale;
  if (variant === 'key') return interaction.pressScaleKey;
  return interaction.pressScale;
}

/**
 * 按钮类控件共用的动效：弹簧按压缩放 + 玻璃变体跟随指针的高光。
 * 返回值传给 React Aria 组件的 `onPressChange`（同时转发调用方自己的回调）。
 */
export function useButtonMotion(
  ref: RefObject<HTMLElement | null>,
  variant: PressableVariant,
  onPressChange?: (isPressed: boolean) => void,
): (isPressed: boolean) => void {
  const pressScale = usePressScale(ref, pressScaleFor(variant));
  usePointerHighlight(ref, { isEnabled: variant === 'glass', sink: null });
  return useCallback(
    (isPressed: boolean) => {
      pressScale(isPressed);
      onPressChange?.(isPressed);
    },
    [pressScale, onPressChange],
  );
}
