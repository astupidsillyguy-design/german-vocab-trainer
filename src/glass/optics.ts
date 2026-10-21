/**
 * 把 design token（CSS 颜色字符串、模糊档位名）解析成着色器直接可用的数值。
 * CSS 档与 WebGL 档读取同一组 token，两者的着色与对比度契约一致。
 */
import { parseColor } from '../design/math/contrast';
import {
  blur,
  glassVariants,
  materials,
  type GlassOptics,
  type GlassVariant,
} from '../design/tokens';

/** RGBA，0–1，颜色已预乘 alpha */
export type Vec4 = readonly [r: number, g: number, b: number, a: number];
export type Vec3 = readonly [r: number, g: number, b: number];

/** 可在实验室中实时调整的光学参数 */
export const OPTICS_OVERRIDE_KEYS = [
  'bezel',
  'refraction',
  'ior',
  'dispersion',
  'fresnel',
  'specular',
  'specularSharpness',
] as const satisfies readonly (keyof GlassOptics)[];
type OverrideKey = (typeof OPTICS_OVERRIDE_KEYS)[number];

/** 未提供（或为 undefined）的参数沿用变体的 token 值 */
export type GlassOpticsOverrides = Readonly<Partial<Record<OverrideKey, number | undefined>>>;

export interface ResolvedOptics {
  readonly tint: Vec4;
  readonly rim: Vec4;
  /** 高斯模糊 σ（CSS px，与 CSS `blur()` 的参数含义相同） */
  readonly blurPx: number;
  readonly saturation: number;
  readonly bezel: number;
  readonly refraction: number;
  readonly ior: number;
  readonly dispersion: number;
  readonly fresnel: number;
  readonly specular: number;
  readonly specularSharpness: number;
}

const CHANNEL_MAX = 255;

/** 不透明颜色 → 0–1 的 RGB */
export function rgbColor(color: string): Vec3 {
  const { r, g, b } = parseColor(color);
  return [r / CHANNEL_MAX, g / CHANNEL_MAX, b / CHANNEL_MAX];
}

export function premultipliedColor(color: string): Vec4 {
  const { r, g, b, a } = parseColor(color);
  const scale = a / CHANNEL_MAX;
  return [r * scale, g * scale, b * scale, a];
}

function opticsOf(variant: GlassVariant): GlassOptics {
  return glassVariants[variant];
}

/** 变体的着色（主色玻璃覆盖材质着色） */
export function variantTint(variant: GlassVariant): Vec4 {
  const optics = opticsOf(variant);
  return premultipliedColor(optics.tint ?? materials[optics.material].tint);
}

export function resolveOptics(
  variant: GlassVariant,
  overrides: GlassOpticsOverrides = {},
): ResolvedOptics {
  const optics = opticsOf(variant);
  const material = materials[optics.material];
  const pick = (key: OverrideKey): number => overrides[key] ?? optics[key];
  return {
    tint: variantTint(variant),
    rim: premultipliedColor(material.rim),
    blurPx: blur[material.blur],
    saturation: material.saturation,
    bezel: pick('bezel'),
    refraction: pick('refraction'),
    ior: pick('ior'),
    dispersion: pick('dispersion'),
    fresnel: pick('fresnel'),
    specular: pick('specular'),
    specularSharpness: pick('specularSharpness'),
  };
}

function vecEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function opticsEqual(a: ResolvedOptics, b: ResolvedOptics): boolean {
  return (Object.keys(a) as (keyof ResolvedOptics)[]).every((key) => {
    const left = a[key];
    const right = b[key];
    return typeof left === 'number' || typeof right === 'number'
      ? left === right
      : vecEqual(left, right);
  });
}
