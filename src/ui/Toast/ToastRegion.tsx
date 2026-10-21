import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { componentGeometry, gesture, springRest, springs } from '../../design/tokens';
import { useI18n } from '../../i18n';
import { projectMomentum, rubberband, type PresenceEntry } from '../../motion';
import { Button } from '../Button/Button';
import { IconButton } from '../Button/IconButton';
import { useSizeClass } from '../hooks/useSizeClass';
import { useDrag, usePresenceList, useReducedMotion, useSpringAnimation } from '../motion';
import { Surface } from '../Surface/Surface';
import {
  toastQueue as defaultQueue,
  type ToastQueue,
  type ToastRecord,
  type ToastTone,
} from './toastQueue';
import { useHoverOrFocusWithin } from './useHoverOrFocusWithin';
import { useToastTimer } from './useToastTimer';
import styles from './Toast.module.css';

/** 手机：顶部居中（避开软键盘与 Tab Bar）；平板与桌面：右下角（不遮挡内容区顶部的标题与操作） */
export type ToastPlacement = 'top' | 'bottom-end';

const TONE_ICON = {
  neutral: null,
  success: <CircleCheck size={componentGeometry.iconMd} aria-hidden />,
  danger: <CircleAlert size={componentGeometry.iconMd} aria-hidden />,
} as const satisfies Record<ToastTone, unknown>;

const INTERACTIVE_SELECTOR = 'button, a, [role="button"]';

/** 滑走的方向：顶部向上，右下角向右（从右到左排版时向左） */
function dismissSign(placement: ToastPlacement, element: HTMLElement): number {
  if (placement === 'top') return -1;
  return getComputedStyle(element).direction === 'rtl' ? -1 : 1;
}

/** 从当前位置完全滑出屏幕还需的距离 */
function offscreenDistance(placement: ToastPlacement, element: HTMLElement, sign: number): number {
  const rect = element.getBoundingClientRect();
  if (placement === 'top') return rect.bottom;
  return sign > 0 ? window.innerWidth - rect.left : rect.right;
}

interface ToastItemProps {
  readonly entry: PresenceEntry<ToastRecord>;
  readonly placement: ToastPlacement;
  readonly isPaused: boolean;
  readonly onDismiss: (id: string) => void;
  readonly onExited: (id: string) => void;
}

function ToastItem({ entry, placement, isPaused, onDismiss, onExited }: ToastItemProps) {
  const { messages } = useI18n();
  const toast = entry.item;
  const isExiting = entry.state === 'exiting';
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLLIElement>(null);
  const [isDragging, setDragging] = useState(false);
  const swipedAway = useRef(false);
  const isSwiping = useRef(false);
  const layoutTop = useRef<number | null>(null);
  const dismiss = (): void => {
    onDismiss(toast.id);
  };
  useToastTimer(toast.timeoutMs, isPaused || isDragging, dismiss);
  const icon = TONE_ICON[toast.tone];

  const animation = useSpringAnimation<'swipe' | 'reflow'>({
    initial: { swipe: 0, reflow: 0 },
    config: springs.smooth,
    precision: springRest.px,
    onUpdate: ({ swipe, reflow }) => {
      const element = ref.current;
      if (element === null) return;
      element.style.translate =
        placement === 'top'
          ? `0 ${String(swipe + reflow)}px`
          : `${String(swipe)}px ${String(reflow)}px`;
    },
    onRest: () => {
      if (!swipedAway.current || isSwiping.current) return;
      dismiss();
    },
  });

  const axisOf = (point: { readonly x: number; readonly y: number }): number =>
    placement === 'top' ? point.y : point.x;

  useDrag(ref, {
    axis: placement === 'top' ? 'y' : 'x',
    isDisabled: isExiting,
    shouldStart: (event) =>
      event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR) === null,
    onStart: () => {
      isSwiping.current = true;
      setDragging(true);
    },
    onMove: ({ offset }) => {
      const element = ref.current;
      if (element === null) return;
      const sign = dismissSign(placement, element);
      const distance = axisOf(offset);
      // 朝关闭方向自由移动；反方向有橡皮筋
      const swipe = distance * sign >= 0 ? distance : rubberband(distance, element.offsetHeight);
      animation.set({ swipe });
    },
    onEnd: ({ velocity }) => {
      isSwiping.current = false;
      setDragging(false);
      const element = ref.current;
      if (element === null) return;
      const sign = dismissSign(placement, element);
      const size = placement === 'top' ? element.offsetHeight : element.offsetWidth;
      const swipe = animation.value('swipe');
      const speed = axisOf(velocity);
      const projected = swipe + projectMomentum(speed);
      const shouldDismiss = swipe * sign > size * gesture.dismissRatio || projected * sign > size;
      if (!shouldDismiss) {
        animation.animateTo({ swipe: 0 }, { velocity: { swipe: speed } });
        return;
      }
      swipedAway.current = true;
      // 已经滑出屏幕，不再播放退场动画
      element.setAttribute('data-exit', 'swipe');
      const target = swipe + sign * offscreenDistance(placement, element, sign);
      if (reducedMotion) {
        animation.set({ swipe: target });
        dismiss();
      } else {
        animation.animateTo({ swipe: target }, { velocity: { swipe: speed } });
      }
    },
    onCancel: () => {
      isSwiping.current = false;
      setDragging(false);
      animation.animateTo({ swipe: 0 });
    },
  });

  // 退场：滑走的直接移除；其余播完（或被取消）退场动画再移除（环境不支持动画时立即移除）。
  // 直接监听原生事件：只认通知项自身的动画，子元素冒泡上来的不算
  useLayoutEffect(() => {
    if (!isExiting) return undefined;
    const element = ref.current;
    const hasAnimation =
      element !== null &&
      typeof element.getAnimations === 'function' &&
      element.getAnimations().length > 0;
    if (element === null || swipedAway.current || !hasAnimation) {
      onExited(toast.id);
      return undefined;
    }
    const onEnd = (event: AnimationEvent): void => {
      if (event.target === element) onExited(toast.id);
    };
    element.addEventListener('animationend', onEnd);
    element.addEventListener('animationcancel', onEnd);
    return () => {
      element.removeEventListener('animationend', onEnd);
      element.removeEventListener('animationcancel', onEnd);
    };
  }, [isExiting, onExited, toast.id]);

  // 重排（上方的通知移除、新通知把旧的推上去）：FLIP —— 从旧位置以弹簧滑到新位置
  // 用布局位置（offset*）而不是 getBoundingClientRect：不受入场动画与滑动的 transform 影响
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const parent = element.offsetParent;
    const top = element.offsetTop + (parent instanceof HTMLElement ? parent.offsetTop : 0);
    const previous = layoutTop.current;
    layoutTop.current = top;
    if (previous === null || previous === top || reducedMotion) return;
    animation.set({ reflow: animation.value('reflow') + previous - top });
    animation.animateTo({ reflow: 0 }, { config: springs.snappy });
  });

  return (
    <li
      ref={ref}
      className={styles.item}
      data-tone={toast.tone}
      data-exiting={isExiting ? '' : undefined}
      data-dragging={isDragging ? '' : undefined}
      inert={isExiting}
    >
      {/* 错误通知需要立即打断读屏；其余通知由外层 polite 区域播报 */}
      <Surface
        material="thick"
        radius="xl"
        elevation={3}
        className={styles.toast}
        {...(toast.tone === 'danger' && !isExiting ? { role: 'alert' } : {})}
      >
        <div className={styles.content}>
          {icon !== null && <span className={styles.icon}>{icon}</span>}
          <div className={styles.text}>
            <p className={styles.title}>{toast.title}</p>
            {toast.description !== undefined && (
              <p className={styles.description}>{toast.description}</p>
            )}
          </div>
          {toast.action !== undefined && (
            <Button
              variant="tinted"
              size="sm"
              onPress={() => {
                toast.action?.onAction();
                dismiss();
              }}
            >
              {toast.action.label}
            </Button>
          )}
          <IconButton
            label={messages.overlay.dismissNotification}
            icon={<X size={componentGeometry.iconSm} aria-hidden />}
            variant="plain"
            size="sm"
            onPress={dismiss}
          />
        </div>
      </Surface>
    </li>
  );
}

export interface ToastRegionProps {
  /** 测试或嵌入场景可注入独立队列 */
  readonly queue?: ToastQueue;
}

const keyOfToast = (toast: ToastRecord): string => toast.id;

/**
 * 通知区域：手机在顶部，平板与桌面在右下角。
 * 新通知弹入，关闭时淡出缩小，其余通知以弹簧补位；可以朝屏幕边缘滑走关闭。
 * 指针悬停、焦点进入或正在拖动时暂停所有计时，确保用户来得及操作（WCAG 2.2.1）。
 */
export function ToastRegion({ queue = defaultQueue }: ToastRegionProps) {
  const { messages } = useI18n();
  const sizeClass = useSizeClass();
  const placement: ToastPlacement = sizeClass === 'compact' ? 'top' : 'bottom-end';
  const toasts = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const { entries, onExited } = usePresenceList(toasts, keyOfToast);
  const [regionRef, isPaused] = useHoverOrFocusWithin<HTMLElement>();
  const dismiss = (id: string): void => {
    queue.dismiss(id);
  };

  return (
    <section
      ref={regionRef}
      aria-label={messages.overlay.notifications}
      className={styles.region}
      data-placement={placement}
    >
      <ol className={styles.list} aria-live="polite" aria-relevant="additions">
        {entries.map((entry) => (
          <ToastItem
            key={entry.key}
            entry={entry}
            placement={placement}
            isPaused={isPaused}
            onDismiss={dismiss}
            onExited={onExited}
          />
        ))}
      </ol>
    </section>
  );
}
