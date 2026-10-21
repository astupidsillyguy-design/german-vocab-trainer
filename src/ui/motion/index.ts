/**
 * 动效的 React 绑定（组件内部使用）。核心算法位于 src/motion，与框架无关。
 */
export { notifyGlassMotion } from './glassMotion';
export {
  useDrag,
  type DragAxis,
  type DragControls,
  type DragOptions,
  type DragState,
} from './useDrag';
export { usePresenceList, type PresenceList } from './usePresenceList';
export { usePressScale } from './usePressScale';
export { useReducedMotion } from './useReducedMotion';
export {
  DRAGGING_ATTRIBUTE,
  useSelectionIndicator,
  type SelectionIndicatorOptions,
} from './useSelectionIndicator';
export { moveSpring, useSpringAnimation } from './useSpringAnimation';
