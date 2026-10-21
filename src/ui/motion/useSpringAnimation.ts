import { useEffect, useLayoutEffect, useState } from 'react';
import {
  SpringAnimation,
  type AnimateOptions,
  type SpringAnimationOptions,
  type SpringValues,
} from '../../motion';

/**
 * 组件内的弹簧动画：实例在组件生命周期内保持不变，卸载时移出帧循环。
 * 每次渲染后换上最新的回调，因此回调里可以放心读取 props。
 * 动画只写 DOM 样式，不触发 React 渲染。
 */
export function useSpringAnimation<Key extends string>(
  options: SpringAnimationOptions<Key>,
): SpringAnimation<Key> {
  const [animation] = useState(() => new SpringAnimation<Key>(options));
  useLayoutEffect(() => {
    animation.setCallbacks(options);
  });
  useEffect(
    () => () => {
      animation.dispose();
    },
    [animation],
  );
  return animation;
}

/** 以弹簧运动到目标；“减少动态效果”时直接跳到终点 */
export function moveSpring<Key extends string>(
  animation: SpringAnimation<Key>,
  targets: Partial<SpringValues<Key>>,
  reducedMotion: boolean,
  options?: AnimateOptions<Key>,
): void {
  if (reducedMotion) animation.set(targets);
  else animation.animateTo(targets, options);
}
