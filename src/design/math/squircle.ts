/**
 * 连续曲率（超椭圆）圆角路径生成。
 *
 * 算法来自 Figma “Corner smoothing” 的公开推导，参考实现：
 * figma-squircle（MIT License，https://github.com/phamfoo/figma-squircle）。
 * 每个角由「三次贝塞尔过渡 → 圆弧 → 三次贝塞尔过渡」组成，曲率连续变化，
 * 视觉上与 iOS 的 continuous corner 一致。
 */

export interface SquircleOptions {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  /** 0–1，Apple 风格约 0.6 */
  readonly smoothing: number;
}

interface CornerParams {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  /** 圆角在边上占用的总长度 */
  readonly p: number;
  readonly arcSectionLength: number;
  readonly radius: number;
}

const RIGHT_ANGLE_DEG = 90;
const HALF_RIGHT_ANGLE_DEG = 45;
const DEGREES_PER_HALF_TURN = 180;
const DEG_TO_RAD = Math.PI / DEGREES_PER_HALF_TURN;
/** 平滑段被三次贝塞尔的两个控制点分成三等份（figma-squircle 推导） */
const BEZIER_THIRDS = 3;
const PATH_PRECISION = 3;

function toRadians(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

function cornerParams(
  requestedRadius: number,
  requestedSmoothing: number,
  budget: number,
): CornerParams {
  const radius = Math.min(requestedRadius, budget);
  if (radius <= 0) {
    return { a: 0, b: 0, c: 0, d: 0, p: 0, arcSectionLength: 0, radius: 0 };
  }
  // 平滑会让圆角“占用”更长的边；空间不足时降低平滑度而不是溢出
  const maxSmoothing = budget / radius - 1;
  const smoothing = Math.max(0, Math.min(requestedSmoothing, maxSmoothing));
  const p = Math.min((1 + smoothing) * radius, budget);

  const arcMeasure = RIGHT_ANGLE_DEG * (1 - smoothing);
  const arcSectionLength = Math.sin(toRadians(arcMeasure / 2)) * radius * Math.SQRT2;
  const angleAlpha = (RIGHT_ANGLE_DEG - arcMeasure) / 2;
  const p3ToP4Distance = radius * Math.tan(toRadians(angleAlpha / 2));
  const angleBeta = HALF_RIGHT_ANGLE_DEG * smoothing;
  const c = p3ToP4Distance * Math.cos(toRadians(angleBeta));
  const d = c * Math.tan(toRadians(angleBeta));
  const b = (p - arcSectionLength - c - d) / BEZIER_THIRDS;
  const a = 2 * b;
  return { a, b, c, d, p, arcSectionLength, radius };
}

function fmt(value: number): string {
  return Number(value.toFixed(PATH_PRECISION)).toString();
}

/** 生成 SVG path 字符串（左上角为原点），可直接用于 `clip-path: path(...)`。 */
export function squirclePath({ width, height, radius, smoothing }: SquircleOptions): string {
  const budget = Math.min(width, height) / 2;
  const k = cornerParams(radius, smoothing, budget);
  const { a, b, c, d, p, arcSectionLength: s, radius: r } = k;
  if (r === 0) {
    return `M 0 0 L ${fmt(width)} 0 L ${fmt(width)} ${fmt(height)} L 0 ${fmt(height)} Z`;
  }
  const n = fmt;
  return [
    `M ${n(width - p)} 0`,
    // 右上角
    `c ${n(a)} 0 ${n(a + b)} 0 ${n(a + b + c)} ${n(d)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(s)} ${n(s)}`,
    `c ${n(d)} ${n(c)} ${n(d)} ${n(b + c)} ${n(d)} ${n(a + b + c)}`,
    `L ${n(width)} ${n(height - p)}`,
    // 右下角
    `c 0 ${n(a)} 0 ${n(a + b)} ${n(-d)} ${n(a + b + c)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(-s)} ${n(s)}`,
    `c ${n(-c)} ${n(d)} ${n(-(b + c))} ${n(d)} ${n(-(a + b + c))} ${n(d)}`,
    `L ${n(p)} ${n(height)}`,
    // 左下角
    `c ${n(-a)} 0 ${n(-(a + b))} 0 ${n(-(a + b + c))} ${n(-d)}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(-s)} ${n(-s)}`,
    `c ${n(-d)} ${n(-c)} ${n(-d)} ${n(-(b + c))} ${n(-d)} ${n(-(a + b + c))}`,
    `L 0 ${n(p)}`,
    // 左上角
    `c 0 ${n(-a)} 0 ${n(-(a + b))} ${n(d)} ${n(-(a + b + c))}`,
    `a ${n(r)} ${n(r)} 0 0 1 ${n(s)} ${n(-s)}`,
    `c ${n(c)} ${n(-d)} ${n(b + c)} ${n(-d)} ${n(a + b + c)} ${n(-d)}`,
    'Z',
  ].join(' ');
}
