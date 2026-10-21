import { useEffect, useEffectEvent } from 'react';

export interface FocusFallbackProps {
  /** 返回应获得焦点的元素；返回 null 时不处理 */
  readonly resolve: () => HTMLElement | null;
}

/**
 * 放在对话框 / 面板内容里，随内容一起卸载。
 *
 * 关闭时 React Aria 会在下一帧把焦点还给打开前的元素；但那个元素可能已经不在了
 * （例如删除按钮随词条一起消失、改名后整个章节以新的 key 重新挂载），焦点就会落到 body 上、
 * 读屏与键盘用户被送回页面开头。这里排在 React Aria 之后执行，只在焦点无处可回时接手。
 */
export function FocusFallback({ resolve }: FocusFallbackProps) {
  const restore = useEffectEvent((): void => {
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    resolve()?.focus();
  });
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        restore();
      });
    },
    [],
  );
  return null;
}
