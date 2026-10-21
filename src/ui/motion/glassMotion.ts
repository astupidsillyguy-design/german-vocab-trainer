import { GLASS_MOTION_EVENT } from '../../glass';

/**
 * 通知元素所在的 WebGL 玻璃组“本帧形状移动了”（事件冒泡到组根）。
 * 不在玻璃组内时没有监听者，开销只是一次事件派发。
 */
export function notifyGlassMotion(element: Element | null): void {
  element?.dispatchEvent(new Event(GLASS_MOTION_EVENT, { bubbles: true }));
}
