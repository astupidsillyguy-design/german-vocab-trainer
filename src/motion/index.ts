/**
 * 动效核心（框架无关）：可打断弹簧、共享帧循环、手势数学、在场状态与页面过渡。
 * React 绑定位于 src/ui/motion。
 */
export {
  createFrameLoop,
  frameLoop,
  type FrameLoop,
  type FrameScheduler,
  type FrameTask,
} from './frameLoop';
export {
  Spring,
  SpringAnimation,
  type AnimateOptions,
  type SpringAnimationOptions,
  type SpringCallbacks,
  type SpringValues,
} from './spring';
export { VelocityTracker, type Vector } from './velocity';
export { clamp, nearestSnapPoint, projectMomentum, rubberband, rubberbandClamp } from './gesture';
export {
  presentEntries,
  reconcilePresence,
  removeExited,
  type PresenceEntry,
  type PresenceState,
} from './presence';
export {
  NAV_DIRECTION_ATTRIBUTE,
  navigationDirection,
  runViewTransition,
  type NavigationDirection,
  type TransitionDocument,
} from './navigation';
