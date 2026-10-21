/**
 * 动态壁纸的几何（纯函数）。
 *
 * WebGL 着色器与 CSS 静态渐变共用这里的公式：CSS 档显示的就是 t = 0 时 WebGL 的画面，
 * 档位切换（例如 WebGL 初始化完成后淡入）不会出现色块跳变。
 */
import type { WallpaperBlob } from '../tokens/glass.ts';

const TAU = 2 * Math.PI;
/** 柔和边缘在 CSS 渐变中的采样点数：越多越接近着色器的 smoothstep */
const SOFT_EDGE_STOPS = 6;
const CSS_PRECISION = 2;
const PERCENT = 100;
/** smoothstep 的三次 Hermite 系数：3t² − 2t³ */
const HERMITE_A = 3;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 色块在 `timeS` 秒时的中心（视口比例）。t = 0 时恰好等于 token 中的初始位置。 */
export function blobCenter(blob: WallpaperBlob, timeS: number, yPeriodRatio: number): Point {
  const angleX = (TAU * timeS) / blob.periodS + blob.phase;
  const angleY = (TAU * timeS) / (blob.periodS * yPeriodRatio) + blob.phase;
  return {
    x: blob.x + blob.driftX * (Math.sin(angleX) - Math.sin(blob.phase)),
    y: blob.y + blob.driftY * (Math.cos(angleY) - Math.cos(blob.phase)),
  };
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (HERMITE_A - 2 * t);
}

/** 色块遮罩：`distance` 以视口短边为单位。与着色器 wallpaper.frag 完全一致。 */
export function blobMask(blob: WallpaperBlob, distance: number): number {
  return 1 - smoothstep(blob.radius * (1 - blob.softness), blob.radius, distance);
}

function fmt(value: number): string {
  return Number(value.toFixed(CSS_PRECISION)).toString();
}

/**
 * 生成 CSS 档的静态壁纸（多层 radial-gradient）。
 * 着色器中后绘制的色块在上层，而 CSS 背景第一层在最上，因此逆序输出。
 */
export function wallpaperGradientCss(
  blobs: readonly WallpaperBlob[],
  colorOf: (blob: WallpaperBlob) => string,
): string {
  const layers = blobs.map((blob) => {
    const color = colorOf(blob);
    const inner = blob.radius * (1 - blob.softness);
    const stops = Array.from({ length: SOFT_EDGE_STOPS }, (_, index) => {
      const position = inner + ((blob.radius - inner) * index) / (SOFT_EDGE_STOPS - 1);
      const alpha = blobMask(blob, position);
      const stopColor =
        alpha >= 1 ? color : `color-mix(in srgb, ${color} ${fmt(alpha * PERCENT)}%, transparent)`;
      return `${stopColor} ${fmt(position * PERCENT)}vmin`;
    });
    return `radial-gradient(circle at ${fmt(blob.x * PERCENT)}% ${fmt(blob.y * PERCENT)}%, ${color} 0, ${stops.join(', ')})`;
  });
  return layers.reverse().join(', ');
}
