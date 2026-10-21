import { useEffect } from 'react';

/**
 * isActive 为真时，关闭或刷新页面前由浏览器弹出确认。
 * 浏览器只显示自带的提示文字，页面无法自定义，因此这里不需要任何文案。
 */
export function useBeforeUnloadWarning(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return undefined;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [isActive]);
}
