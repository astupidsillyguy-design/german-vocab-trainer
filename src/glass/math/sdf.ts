/**
 * 形状的有符号距离场（SDF），与着色器 glass.frag 中的同名函数逐行对应，
 * 供 SVG 位移贴图生成与单元测试使用。距离单位为 CSS px，内部为负。
 */
import { NATIVE_SQUIRCLE_RADIUS_SCALE } from '../../design/tokens';

/** 超椭圆指数：2 = 圆弧（胶囊），4 = 连续曲率（与 CSS `corner-shape: squircle` 相同） */
export const SHAPE_EXPONENT = { capsule: 2, squircle: 4 } as const;
export type ShapeKind = keyof typeof SHAPE_EXPONENT;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShapeGeometry {
  readonly centerX: number;
  readonly centerY: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  /** 实际参与计算的圆角半径（已按形状换算并限制在短边一半以内） */
  readonly radius: number;
  readonly exponent: number;
}

export function shapeGeometry(rect: Rect, cornerRadius: number, kind: ShapeKind): ShapeGeometry {
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const maxRadius = Math.min(halfWidth, halfHeight);
  // 超椭圆角在同样的半径下看起来更“方”，按 CSS corner-shape 的换算放大半径以保持视觉圆角一致
  const radius =
    kind === 'capsule'
      ? maxRadius
      : Math.min(cornerRadius * NATIVE_SQUIRCLE_RADIUS_SCALE, maxRadius);
  return {
    centerX: rect.x + halfWidth,
    centerY: rect.y + halfHeight,
    halfWidth,
    halfHeight,
    radius,
    exponent: SHAPE_EXPONENT[kind],
  };
}

/** Lp 范数：p = 2 时为欧氏长度 */
export function lengthN(x: number, y: number, exponent: number): number {
  return (Math.abs(x) ** exponent + Math.abs(y) ** exponent) ** (1 / exponent);
}

/** 超椭圆圆角矩形的 SDF */
export function roundedBoxDistance(x: number, y: number, shape: ShapeGeometry): number {
  const qx = Math.abs(x - shape.centerX) - shape.halfWidth + shape.radius;
  const qy = Math.abs(y - shape.centerY) - shape.halfHeight + shape.radius;
  return (
    lengthN(Math.max(qx, 0), Math.max(qy, 0), shape.exponent) +
    Math.min(Math.max(qx, qy), 0) -
    shape.radius
  );
}

export interface SmoothUnion {
  readonly distance: number;
  /** 第一个形状的权重（0–1），用于混合两者的着色 */
  readonly weight: number;
}

/**
 * 二次 smooth-min（Inigo Quilez）：两形状间距小于 k 时平滑“粘连”。
 * k ≤ 0 时退化为普通并集。
 */
export function smoothUnion(a: number, b: number, k: number): SmoothUnion {
  if (k <= 0) return { distance: Math.min(a, b), weight: a <= b ? 1 : 0 };
  const weight = Math.min(Math.max(1 / 2 + (b - a) / (2 * k), 0), 1);
  return { distance: b + (a - b) * weight - k * weight * (1 - weight), weight };
}

/** 一组形状融合后的距离场 */
export function fieldDistance(
  x: number,
  y: number,
  shapes: readonly ShapeGeometry[],
  spacing: number,
): number {
  let distance = Number.POSITIVE_INFINITY;
  for (const shape of shapes) {
    const next = roundedBoxDistance(x, y, shape);
    distance = Number.isFinite(distance) ? smoothUnion(next, distance, spacing).distance : next;
  }
  return distance;
}
