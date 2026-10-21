/**
 * CSS 折射档的位移贴图（SVG feDisplacementMap 使用）。
 *
 * feDisplacementMap 的公式：P'(x, y) = P(x + s·(R/255 − ½), y + s·(G/255 − ½))。
 * 取 s = 2 × 最大位移，则 R、G 通道 128 表示不偏移，0/255 表示向负/正方向偏移最大位移。
 * 位移方向与 WebGL 档一致：沿法线向内采样，边缘把内侧的背景“拉”出来，形成透镜感。
 */
import { bezelProfile, sampleProfile } from './profile';
import { roundedBoxDistance, shapeGeometry, type ShapeKind } from './sdf';

const CHANNEL_MAX = 255;
const NEUTRAL = 128;
const RGBA = 4;
const ALPHA_INDEX = 3;
/** 法线的中心差分步长（CSS px） */
const NORMAL_STEP = 0.5;

export interface DisplacementMapOptions {
  /** 元素尺寸（CSS px） */
  readonly width: number;
  readonly height: number;
  readonly cornerRadius: number;
  readonly kind: ShapeKind;
  readonly bezel: number;
  readonly refraction: number;
  readonly ior: number;
  /** 贴图像素 / CSS px；位移场很平滑，半分辨率即可 */
  readonly scale: number;
}

export interface DisplacementMap {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

/** feDisplacementMap 的 scale 属性 */
export function displacementScale(refraction: number): number {
  return 2 * refraction;
}

function encode(offset: number, refraction: number): number {
  if (refraction <= 0) return NEUTRAL;
  return Math.round(NEUTRAL + (offset / (2 * refraction)) * CHANNEL_MAX);
}

export function displacementMap(options: DisplacementMapOptions): DisplacementMap {
  const width = Math.max(Math.ceil(options.width * options.scale), 1);
  const height = Math.max(Math.ceil(options.height * options.scale), 1);
  const shape = shapeGeometry(
    { x: 0, y: 0, width: options.width, height: options.height },
    options.cornerRadius,
    options.kind,
  );
  const profile = bezelProfile(options.ior);
  const data = new Uint8ClampedArray(width * height * RGBA);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const x = (column + 1 / 2) / options.scale;
      const y = (row + 1 / 2) / options.scale;
      const distance = roundedBoxDistance(x, y, shape);
      let offsetX = 0;
      let offsetY = 0;
      if (distance < 0 && -distance < options.bezel) {
        const gradX =
          roundedBoxDistance(x + NORMAL_STEP, y, shape) -
          roundedBoxDistance(x - NORMAL_STEP, y, shape);
        const gradY =
          roundedBoxDistance(x, y + NORMAL_STEP, shape) -
          roundedBoxDistance(x, y - NORMAL_STEP, shape);
        const length = Math.hypot(gradX, gradY);
        if (length > 0) {
          const amount =
            sampleProfile(profile, -distance / options.bezel).displacement * options.refraction;
          offsetX = (-gradX / length) * amount;
          offsetY = (-gradY / length) * amount;
        }
      }
      const index = (row * width + column) * RGBA;
      data[index] = encode(offsetX, options.refraction);
      data[index + 1] = encode(offsetY, options.refraction);
      data[index + 2] = NEUTRAL;
      data[index + ALPHA_INDEX] = CHANNEL_MAX;
    }
  }
  return { width, height, data };
}
