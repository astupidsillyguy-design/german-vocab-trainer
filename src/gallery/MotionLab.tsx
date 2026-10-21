import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { glassGroup, springRest, springs } from '../design/tokens';
import { useI18n } from '../i18n';
import { nearestSnapPoint, projectMomentum, rubberbandClamp, type Vector } from '../motion';
import {
  Badge,
  Button,
  GlassGroup,
  LiquidGlass,
  moveSpring,
  notifyGlassMotion,
  useDrag,
  useReducedMotion,
  useSpringAnimation,
} from '../ui';
import { GallerySection } from './GallerySection';
import styles from './MotionLab.module.css';

const CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const;
type Corner = (typeof CORNERS)[number];

/** 各角在活动范围内的相对位置（0 = 起始边，1 = 结束边） */
const CORNER_POSITION = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 0 },
  bottomLeft: { x: 0, y: 1 },
  bottomRight: { x: 1, y: 1 },
} as const satisfies Record<Corner, Vector>;

const ARROW_KEYS = {
  ArrowLeft: { x: 0 },
  ArrowRight: { x: 1 },
  ArrowUp: { y: 0 },
  ArrowDown: { y: 1 },
} as const satisfies Record<string, Partial<Vector>>;

function isArrowKey(key: string): key is keyof typeof ARROW_KEYS {
  return key in ARROW_KEYS;
}

function cornerAt(x: number, y: number): Corner {
  return (
    CORNERS.find((corner) => {
      const position = CORNER_POSITION[corner];
      return position.x === x && position.y === y;
    }) ?? 'topLeft'
  );
}

/** 合拢时两颗水滴平分要走的距离 */
const MERGE_TRAVEL = 1 / 2;
/** 合拢后每侧重叠的身位比例 */
const MERGE_OVERLAP = 0.25;
const DROPLET_SELECTOR = '[data-droplet]';

function FlingLab() {
  const { messages, locale } = useI18n();
  const text = messages.gallery.motion;
  const reducedMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const puckRef = useRef<HTMLElement>(null);
  const gestureStart = useRef<Vector>({ x: 0, y: 0 });
  const cornerRef = useRef<Corner>('topLeft');
  const [corner, setCorner] = useState<Corner>('topLeft');
  const [speed, setSpeed] = useState<number | null>(null);
  const speedFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

  const animation = useSpringAnimation<'x' | 'y'>({
    initial: { x: 0, y: 0 },
    config: springs.fling,
    precision: springRest.px,
    onUpdate: ({ x, y }) => {
      const puck = puckRef.current;
      if (puck === null) return;
      puck.style.translate = `${String(x)}px ${String(y)}px`;
      notifyGlassMotion(puck);
    },
  });

  /** 玻璃球左上角可到达的最大偏移 */
  const bounds = (): Vector => {
    const track = trackRef.current;
    const puck = puckRef.current;
    if (track === null || puck === null) return { x: 0, y: 0 };
    return {
      x: Math.max(track.clientWidth - puck.offsetWidth, 0),
      y: Math.max(track.clientHeight - puck.offsetHeight, 0),
    };
  };

  const settleAt = (next: Corner, velocity?: Vector): void => {
    const max = bounds();
    const position = CORNER_POSITION[next];
    cornerRef.current = next;
    setCorner(next);
    moveSpring(
      animation,
      { x: position.x * max.x, y: position.y * max.y },
      reducedMotion,
      velocity === undefined ? undefined : { velocity: { x: velocity.x, y: velocity.y } },
    );
  };

  useDrag(puckRef, {
    onStart: () => {
      // 飞行途中也能抓住：从当前位置接着拖
      gestureStart.current = { x: animation.value('x'), y: animation.value('y') };
      animation.stop();
    },
    onMove: ({ offset }) => {
      const max = bounds();
      animation.set({
        x: rubberbandClamp(gestureStart.current.x + offset.x, 0, max.x, max.x),
        y: rubberbandClamp(gestureStart.current.y + offset.y, 0, max.y, max.y),
      });
    },
    onEnd: ({ velocity }) => {
      const max = bounds();
      const projectedX = animation.value('x') + projectMomentum(velocity.x);
      const projectedY = animation.value('y') + projectMomentum(velocity.y);
      const x = nearestSnapPoint(projectedX, [0, max.x]) === 0 ? 0 : 1;
      const y = nearestSnapPoint(projectedY, [0, max.y]) === 0 ? 0 : 1;
      setSpeed(Math.hypot(velocity.x, velocity.y));
      settleAt(cornerAt(x, y), velocity);
    },
  });

  // 尺寸变化（旋转屏幕、调整窗口）后贴回当前所在的角
  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return undefined;
    const observer = new ResizeObserver(() => {
      if (animation.isAnimating) return;
      const max = bounds();
      const position = CORNER_POSITION[cornerRef.current];
      animation.set({ x: position.x * max.x, y: position.y * max.y });
    });
    observer.observe(track);
    return () => {
      observer.disconnect();
    };
    // 只需挂载时建立观察；回调读取的都是 ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!isArrowKey(event.key)) return;
    event.preventDefault();
    const current = CORNER_POSITION[cornerRef.current];
    const step: Partial<Vector> = ARROW_KEYS[event.key];
    settleAt(cornerAt(step.x ?? current.x, step.y ?? current.y));
  };

  return (
    <div className={styles.lab}>
      <h3 className={styles.title}>{text.flingTitle}</h3>
      <p className={styles.hint}>{text.flingHint}</p>
      <div className={styles.arena} data-testid="motion-arena">
        <div ref={trackRef} className={styles.track}>
          <LiquidGlass
            ref={puckRef}
            variant="clear"
            radius="capsule"
            interactive
            className={styles.puck}
            role="button"
            tabIndex={0}
            aria-label={text.puckLabel(text.corners[corner])}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
            onKeyDown={onKeyDown}
            data-corner={corner}
            data-testid="motion-puck"
          />
        </div>
      </div>
      <div className={styles.readout}>
        <Badge tone="neutral" data-testid="motion-velocity">
          {speed === null ? text.corners[corner] : text.velocity(speedFormat.format(speed))}
        </Badge>
      </div>
    </div>
  );
}

interface DropletProps {
  readonly side: -1 | 1;
  readonly isMerged: boolean;
  readonly testId: string;
}

function Droplet({ side, isMerged, testId }: DropletProps) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const gestureStart = useRef<Vector>({ x: 0, y: 0 });
  const animation = useSpringAnimation<'x' | 'y'>({
    initial: { x: 0, y: 0 },
    config: springs.bouncy,
    precision: springRest.px,
    onUpdate: ({ x, y }) => {
      const element = ref.current;
      if (element === null) return;
      element.style.translate = `${String(x)}px ${String(y)}px`;
      notifyGlassMotion(element);
    },
  });

  /** 合拢时两颗水滴各自朝中间移动，最终重叠 1/4 身位：WebGL 档下融成一体 */
  const restX = (): number => {
    const element = ref.current;
    if (!isMerged || element === null) return 0;
    const droplets = element.parentElement?.querySelectorAll<HTMLElement>(DROPLET_SELECTOR) ?? [];
    const [first, second] = [...droplets];
    if (first === undefined || second === undefined) return 0;
    const distance = Math.abs(second.offsetLeft - first.offsetLeft);
    const mergedDistance = element.offsetWidth * (1 - 2 * MERGE_OVERLAP);
    return -side * (distance - mergedDistance) * MERGE_TRAVEL;
  };

  useEffect(() => {
    moveSpring(animation, { x: restX(), y: 0 }, reducedMotion);
    // 只在合拢 / 分开切换时运动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMerged]);

  useDrag(ref, {
    onStart: () => {
      gestureStart.current = { x: animation.value('x'), y: animation.value('y') };
      animation.stop();
    },
    onMove: ({ offset }) => {
      animation.set({ x: gestureStart.current.x + offset.x, y: gestureStart.current.y + offset.y });
    },
    onEnd: ({ velocity }) => {
      moveSpring(animation, { x: restX(), y: 0 }, reducedMotion, {
        velocity: { x: velocity.x, y: velocity.y },
      });
    },
  });

  return (
    <LiquidGlass
      ref={ref}
      variant="clear"
      radius="capsule"
      className={styles.droplet}
      data-droplet=""
      data-testid={testId}
      aria-hidden
    />
  );
}

function MergeLab() {
  const { messages } = useI18n();
  const text = messages.gallery.motion;
  const [isMerged, setMerged] = useState(false);
  return (
    <div className={styles.lab}>
      <h3 className={styles.title}>{text.mergeTitle}</h3>
      <p className={styles.hint}>{text.mergeHint}</p>
      <GlassGroup
        variant="clear"
        spacing={glassGroup.spacing}
        className={styles.dropletGroup}
        data-testid="motion-droplets"
      >
        <Droplet side={-1} isMerged={isMerged} testId="motion-droplet-start" />
        <Droplet side={1} isMerged={isMerged} testId="motion-droplet-end" />
      </GlassGroup>
      <div className={styles.readout}>
        <Button
          variant="tinted"
          size="sm"
          aria-pressed={isMerged}
          onPress={() => {
            setMerged(!isMerged);
          }}
        >
          {isMerged ? text.separate : text.merge}
        </Button>
      </div>
    </div>
  );
}

/** 设计页的动效实验室：可打断的弹簧、速度投射与液态玻璃融合。 */
export function MotionLabSection() {
  const { messages } = useI18n();
  return (
    <GallerySection title={messages.gallery.sections.motion}>
      <p className={styles.description}>{messages.gallery.motion.description}</p>
      <div className={styles.labs}>
        <FlingLab />
        <MergeLab />
      </div>
    </GallerySection>
  );
}
