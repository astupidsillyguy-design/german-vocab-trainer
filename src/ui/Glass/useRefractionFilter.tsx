import { useEffect, useId, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { displacementScale, type ResolvedOptics, type ShapeKind } from '../../glass';
import { refractionMapUrl } from './refractionMap';
import styles from './Glass.module.css';

/** 贴图分辨率（相对 CSS px）：位移场非常平滑，半分辨率足够 */
const MAP_SCALE = 0.5;
/** 尺寸量化步长（px）：元素尺寸变化不足一步时不重新生成贴图 */
const SIZE_STEP = 4;

interface Size {
  readonly width: number;
  readonly height: number;
}

interface RefractionOptions {
  readonly enabled: boolean;
  readonly elementRef: RefObject<HTMLElement | null>;
  readonly cornerRadius: number;
  readonly kind: ShapeKind;
  readonly optics: ResolvedOptics;
}

export interface RefractionFilter {
  /** 可用于 `url(#id)` 的滤镜 id；未就绪时为 null（此时只有模糊） */
  readonly filterId: string | null;
  /** 需要渲染的 SVG（通过 portal 挂到 body） */
  readonly filter: ReactNode;
}

function quantize(value: number): number {
  return Math.max(Math.ceil(value / SIZE_STEP) * SIZE_STEP, SIZE_STEP);
}

function useQuantizedSize(enabled: boolean, elementRef: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const element = elementRef.current;
    if (!enabled || element === null || typeof ResizeObserver === 'undefined') return undefined;
    const measure = (): void => {
      const width = quantize(element.offsetWidth);
      const height = quantize(element.offsetHeight);
      setSize((previous) =>
        previous?.width === width && previous.height === height ? previous : { width, height },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [enabled, elementRef]);
  return enabled ? size : null;
}

/**
 * CSS 折射档：为元素生成一张与其尺寸匹配的位移贴图，作为 backdrop-filter 中的 SVG 滤镜。
 * 尺寸按 4px 向上取整（滤镜区域总能覆盖整个元素），避免拖动、动画时频繁重新生成。
 */
export function useRefractionFilter({
  enabled,
  elementRef,
  cornerRadius,
  kind,
  optics,
}: RefractionOptions): RefractionFilter {
  const id = `glass-refraction-${useId().replace(/[^\w-]/g, '')}`;
  const size = useQuantizedSize(enabled, elementRef);
  const { bezel, refraction, ior } = optics;
  const url = useMemo(
    () =>
      size === null
        ? null
        : refractionMapUrl({
            width: size.width,
            height: size.height,
            cornerRadius,
            kind,
            bezel,
            refraction,
            ior,
            scale: MAP_SCALE,
          }),
    [size, cornerRadius, kind, bezel, refraction, ior],
  );
  if (size === null || url === null) return { filterId: null, filter: null };

  const filter = createPortal(
    <svg className={styles.filterDefs} aria-hidden focusable="false">
      <filter
        id={id}
        x="0"
        y="0"
        width={size.width}
        height={size.height}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          href={url}
          x="0"
          y="0"
          width={size.width}
          height={size.height}
          preserveAspectRatio="none"
          result="map"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale={displacementScale(refraction)}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>,
    document.body,
  );
  return { filterId: id, filter };
}
