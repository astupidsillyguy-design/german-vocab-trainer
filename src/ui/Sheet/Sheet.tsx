import { X } from 'lucide-react';
import { useRef, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { componentGeometry, sheetDetent, springRest, springs } from '../../design/tokens';
import { clamp, nearestSnapPoint, projectMomentum, rubberband } from '../../motion';
import { useI18n } from '../../i18n';
import { IconButton } from '../Button/IconButton';
import { FocusFallback } from '../Dialog/FocusFallback';
import { useControllableState } from '../hooks/useControllableState';
import { useSizeClass } from '../hooks/useSizeClass';
import { LiquidGlass } from '../Glass/LiquidGlass';
import { DRAGGING_ATTRIBUTE, useDrag, useReducedMotion, useSpringAnimation } from '../motion';
import styles from './Sheet.module.css';

export { DialogTrigger as SheetTrigger } from 'react-aria-components';

/** 底部面板的停靠档位（与 iOS UISheetPresentationController 一致）。 */
export type SheetDetent = 'medium' | 'large';

/** compact 尺寸下从底部升起；更宽的屏幕上以居中表单面板呈现。 */
export type SheetPresentation = 'bottom' | 'center';

export interface SheetProps {
  /** 受控用法；放在 <SheetTrigger> 内时可省略 */
  readonly isOpen?: boolean;
  readonly onOpenChange?: (isOpen: boolean) => void;
  readonly title: string;
  readonly children: ReactNode;
  /** 标题栏右侧的额外操作（关闭按钮始终存在） */
  readonly actions?: ReactNode;
  readonly detent?: SheetDetent;
  readonly defaultDetent?: SheetDetent;
  readonly onDetentChange?: (detent: SheetDetent) => void;
  /** 是否允许点击遮罩、下滑关闭；有未保存输入时应设为 false */
  readonly isDismissable?: boolean;
  /** 关闭后焦点无处可回时（例如打开面板的按钮已被替换）返回应获得焦点的元素 */
  readonly fallbackFocus?: () => HTMLElement | null;
}

const NEXT_DETENT = { medium: 'large', large: 'medium' } as const satisfies Record<
  SheetDetent,
  SheetDetent
>;

/** 滑走关闭时写在面板上：跳过退场动画（面板已经在屏幕外） */
const EXIT_ATTRIBUTE = 'data-exit';
const PERCENT = 100;
const FULL_OPACITY = 1;
const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"]';

/** 中档时面板相对全屏档下移的距离（与 CSS 中 --sheet-detent-offset 的算法一致） */
function mediumOffsetOf(modal: HTMLElement): number {
  const largeHeight = modal.offsetHeight;
  const mediumHeight = Math.min(
    (window.innerHeight * sheetDetent.mediumViewportPercent) / PERCENT,
    largeHeight,
  );
  return largeHeight - mediumHeight;
}

function detentOffsetOf(modal: HTMLElement, detent: SheetDetent): number {
  return detent === 'large' ? 0 : mediumOffsetOf(modal);
}

interface SheetChromeProps {
  readonly modalRef: RefObject<HTMLDivElement | null>;
  readonly presentation: SheetPresentation;
  readonly detent: SheetDetent;
  readonly onDetentChange: (detent: SheetDetent) => void;
  readonly isDismissable: boolean;
  readonly title: string;
  readonly actions: ReactNode;
  readonly close: () => void;
}

/**
 * 把手与标题栏，也是拖动区域：
 * - 上下拖动在“中档 / 全屏”之间切换，越过全屏档或（不可关闭时）中档以下有橡皮筋；
 * - 松手时按速度投射到最近的停靠位，并继承手指速度；
 * - 可关闭时向下甩出或拖过一半即滑走关闭，遮罩随之变淡。
 * 面板位置由 JS 弹簧写入独立的 `translate`，CSS 的档位 transform 保持不变。
 */
function SheetChrome({
  modalRef,
  presentation,
  detent,
  onDetentChange,
  isDismissable,
  title,
  actions,
  close,
}: SheetChromeProps) {
  const { messages } = useI18n();
  const reducedMotion = useReducedMotion();
  const regionRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  /** 当前档位在 CSS transform 中的偏移；translate 写的是相对它的差值 */
  const detentOffset = useRef(0);
  const gestureStart = useRef(0);
  const isDragging = useRef(false);
  const isClosing = useRef(false);

  const write = (y: number): void => {
    const modal = modalRef.current;
    if (modal === null) return;
    modal.style.translate = `0 ${String(y - detentOffset.current)}px`;
    const overlay = modal.parentElement;
    if (overlay === null || !isDismissable) return;
    const medium = mediumOffsetOf(modal);
    const dismiss = window.innerHeight - modal.offsetTop;
    const progress = clamp((y - medium) / Math.max(dismiss - medium, 1), 0, 1);
    overlay.style.setProperty('--sheet-scrim-opacity', String(FULL_OPACITY - progress));
  };

  const finish = (): void => {
    const modal = modalRef.current;
    if (isClosing.current) {
      isClosing.current = false;
      modal?.setAttribute(EXIT_ATTRIBUTE, 'swipe');
      close();
      return;
    }
    if (isDragging.current || modal === null) return;
    modal.removeAttribute(DRAGGING_ATTRIBUTE);
    modal.style.removeProperty('translate');
    modal.parentElement?.style.removeProperty('--sheet-scrim-opacity');
  };

  const animation = useSpringAnimation<'y'>({
    initial: { y: 0 },
    config: springs.sheet,
    precision: springRest.px,
    onUpdate: ({ y }) => {
      write(y);
    },
    onRest: finish,
  });

  const settle = (target: number, velocity: number): void => {
    if (reducedMotion) {
      animation.set({ y: target });
      finish();
      return;
    }
    animation.animateTo({ y: target }, { velocity: { y: velocity } });
  };

  const isDraggable = presentation === 'bottom';
  useDrag(regionRef, {
    axis: 'y',
    isDisabled: !isDraggable,
    shouldStart: (event) => {
      if (!(event.target instanceof Element)) return false;
      const interactive = event.target.closest(INTERACTIVE_SELECTOR);
      return interactive === null || interactive === handleRef.current;
    },
    onStart: () => {
      const modal = modalRef.current;
      if (modal === null) return;
      isClosing.current = false;
      const start = animation.isAnimating ? animation.value('y') : detentOffsetOf(modal, detent);
      isDragging.current = true;
      animation.stop();
      detentOffset.current = detentOffsetOf(modal, detent);
      gestureStart.current = start;
      modal.setAttribute(DRAGGING_ATTRIBUTE, '');
      animation.set({ y: start });
    },
    onMove: ({ offset }) => {
      const modal = modalRef.current;
      if (modal === null) return;
      const raw = gestureStart.current + offset.y;
      const medium = mediumOffsetOf(modal);
      let y = raw;
      if (raw < 0) y = rubberband(raw, modal.offsetHeight);
      else if (!isDismissable && raw > medium) {
        y = medium + rubberband(raw - medium, modal.offsetHeight);
      }
      animation.set({ y });
    },
    onEnd: ({ velocity }) => {
      isDragging.current = false;
      const modal = modalRef.current;
      if (modal === null) return;
      const current = animation.value('y');
      const medium = mediumOffsetOf(modal);
      const dismiss = window.innerHeight - modal.offsetTop;
      const candidates = isDismissable ? [0, medium, dismiss] : [0, medium];
      const target = nearestSnapPoint(current + projectMomentum(velocity.y), candidates);
      if (target === dismiss) {
        isClosing.current = true;
        settle(target, velocity.y);
        return;
      }
      const next: SheetDetent = target === 0 ? 'large' : 'medium';
      if (next !== detent) {
        flushSync(() => {
          onDetentChange(next);
        });
      }
      detentOffset.current = detentOffsetOf(modal, next);
      write(current);
      settle(target, velocity.y);
    },
    onCancel: () => {
      isDragging.current = false;
      const modal = modalRef.current;
      if (modal !== null) settle(detentOffsetOf(modal, detent), 0);
    },
  });

  return (
    <div ref={regionRef} className={styles.chrome}>
      {isDraggable && (
        <AriaButton
          ref={handleRef}
          className={styles.handle}
          aria-label={messages.overlay.sheetHandle}
          aria-expanded={detent === 'large'}
          onPress={() => {
            onDetentChange(NEXT_DETENT[detent]);
          }}
        >
          <span className={styles.grabber} aria-hidden />
        </AriaButton>
      )}
      <header className={styles.header}>
        <Heading slot="title" className={styles.title}>
          {title}
        </Heading>
        <div className={styles.actions}>
          {actions}
          <IconButton
            label={messages.common.close}
            icon={<X size={componentGeometry.iconMd} aria-hidden />}
            size="sm"
            onPress={close}
          />
        </div>
      </header>
    </div>
  );
}

/**
 * 模态面板。焦点锁定、Esc 关闭、关闭后焦点回到触发元素均由 React Aria 处理。
 *
 * 档位切换只改变 transform（translateY），不改变高度，因此不会触发布局；
 * 中档时内容区底部补足同样的距离，保证所有内容都能滚动到可见区域。
 * 手机上可拖动把手或标题栏调整档位、下滑关闭；把手同时是可聚焦的按钮（点击/回车切换档位）。
 */
export function Sheet({
  isOpen,
  onOpenChange,
  title,
  children,
  actions,
  detent,
  defaultDetent = 'medium',
  onDetentChange,
  isDismissable = true,
  fallbackFocus,
}: SheetProps) {
  const sizeClass = useSizeClass();
  const presentation: SheetPresentation = sizeClass === 'compact' ? 'bottom' : 'center';
  const [currentDetent, setDetent] = useControllableState(detent, defaultDetent, onDetentChange);
  const modalRef = useRef<HTMLDivElement>(null);
  const controlled = {
    ...(isOpen === undefined ? {} : { isOpen }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
  };

  return (
    <ModalOverlay {...controlled} isDismissable={isDismissable} className={styles.overlay}>
      <Modal
        ref={modalRef}
        className={styles.modal}
        data-presentation={presentation}
        data-detent={currentDetent}
      >
        <LiquidGlass
          variant="thick"
          renderer="css"
          radius="sheet"
          elevation={4}
          className={styles.panel}
        >
          <Dialog className={styles.dialog}>
            {({ close }) => (
              <>
                <SheetChrome
                  modalRef={modalRef}
                  presentation={presentation}
                  detent={currentDetent}
                  onDetentChange={setDetent}
                  isDismissable={isDismissable}
                  title={title}
                  actions={actions}
                  close={close}
                />
                <div className={styles.body}>{children}</div>
                {fallbackFocus !== undefined && <FocusFallback resolve={fallbackFocus} />}
              </>
            )}
          </Dialog>
        </LiquidGlass>
      </Modal>
    </ModalOverlay>
  );
}
