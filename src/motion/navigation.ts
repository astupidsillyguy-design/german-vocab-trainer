/**
 * 页面切换动画（View Transitions API）。
 *
 * - 同级页面（Tab 之间）：淡入淡出；
 * - 进入下一级：新页面从行尾方向推入，旧页面向行首退后并变暗；
 * - 返回上一级：反向。
 * 方向写在 <html data-nav-direction> 上，由 src/styles/view-transitions.css 读取；
 * 不支持该 API 的浏览器直接切换，“减少动态效果”时只保留淡入淡出（CSS 控制）。
 */

export type NavigationDirection = 'forward' | 'back' | 'lateral';

export const NAV_DIRECTION_ATTRIBUTE = 'data-nav-direction';

function depth(path: string): number {
  return (
    path
      .split(/[?#]/u)[0]
      ?.split('/')
      .filter((segment) => segment.length > 0).length ?? 0
  );
}

/** 按路径层级判断方向：更深为前进，更浅为返回，同级为平移 */
export function navigationDirection(from: string, to: string): NavigationDirection {
  const fromDepth = depth(from);
  const toDepth = depth(to);
  if (toDepth > fromDepth) return 'forward';
  if (toDepth < fromDepth) return 'back';
  return 'lateral';
}

interface TransitionHandle {
  readonly ready: Promise<unknown>;
  readonly finished: Promise<unknown>;
}

/** 只依赖需要的部分，便于在不支持的浏览器与测试中替换 */
export interface TransitionDocument {
  readonly documentElement: HTMLElement;
  readonly startViewTransition?: (update: () => void) => TransitionHandle;
}

const ignore = (): undefined => undefined;

/**
 * 以视图过渡执行 `update`（update 内必须同步完成 DOM 更新，例如 React 的 flushSync）。
 * 返回 true 表示使用了过渡；连续快速切换时前一个过渡会被跳过，其 Promise 的拒绝在这里吞掉，
 * 不会变成未处理的异常。
 */
export function runViewTransition(
  update: () => void,
  direction: NavigationDirection,
  doc: TransitionDocument = document,
): boolean {
  if (typeof doc.startViewTransition !== 'function') {
    update();
    return false;
  }
  const root = doc.documentElement;
  root.setAttribute(NAV_DIRECTION_ATTRIBUTE, direction);
  const transition = doc.startViewTransition(update);
  transition.ready.catch(ignore);
  void transition.finished.catch(ignore).finally(() => {
    if (root.getAttribute(NAV_DIRECTION_ATTRIBUTE) === direction) {
      root.removeAttribute(NAV_DIRECTION_ATTRIBUTE);
    }
  });
  return true;
}
