/**
 * WCAG 2.x 对比度计算工具。
 * 支持半透明前景：先与背景做 alpha 合成，再计算相对亮度。
 */

export interface Rgba {
  /** 0–255 */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0–1 */
  readonly a: number;
}

export const WCAG_AA = {
  normalText: 4.5,
  largeText: 3,
  nonText: 3,
} as const;

const CHANNEL_MAX = 255;
const HEX_BASE = 16;
/** 十六进制颜色的各种写法对应的位数：#RGB、#RGBA、#RRGGBB、#RRGGBBAA */
const HEX_LENGTH = { rgb: 3, rgba: 4, rrggbb: 6, rrggbbaa: 8 } as const;
const SHORT_HEX_LENGTHS = new Set<number>([HEX_LENGTH.rgb, HEX_LENGTH.rgba]);
const LONG_HEX_LENGTHS = new Set<number>([HEX_LENGTH.rrggbb, HEX_LENGTH.rrggbbaa]);
const CHANNEL_INDEX = { r: 0, g: 1, b: 2, a: 3 } as const;
/** sRGB → 线性光的分段阈值与系数（IEC 61966-2-1）。 */
const SRGB_LINEAR_THRESHOLD = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
/** 相对亮度的通道权重（ITU-R BT.709）。 */
const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;
/** WCAG 对比度公式中的眩光补偿项。 */
const FLARE = 0.05;

function parseHex(hex: string): Rgba {
  const digits = hex.slice(1);
  let expanded: string;
  if (SHORT_HEX_LENGTHS.has(digits.length)) {
    expanded = Array.from(digits, (digit) => digit + digit).join('');
  } else if (LONG_HEX_LENGTHS.has(digits.length)) {
    expanded = digits;
  } else {
    throw new Error(`无法解析的十六进制颜色：${hex}`);
  }
  const channel = (index: number): number =>
    Number.parseInt(expanded.slice(index * 2, index * 2 + 2), HEX_BASE);
  const hasAlpha = expanded.length === HEX_LENGTH.rrggbbaa;
  return {
    r: channel(CHANNEL_INDEX.r),
    g: channel(CHANNEL_INDEX.g),
    b: channel(CHANNEL_INDEX.b),
    a: hasAlpha ? channel(CHANNEL_INDEX.a) / CHANNEL_MAX : 1,
  };
}

const RGB_FUNCTION = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;

function parseRgbFunction(input: string): Rgba {
  const match = RGB_FUNCTION.exec(input);
  if (!match) throw new Error(`无法解析的 rgb() 颜色：${input}`);
  const [, r = '0', g = '0', b = '0', alpha] = match;
  let a = 1;
  if (alpha !== undefined) {
    a = alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha);
  }
  return { r: Number(r), g: Number(g), b: Number(b), a };
}

export function parseColor(input: string): Rgba {
  const value = input.trim();
  if (value.startsWith('#')) return parseHex(value);
  if (/^rgba?\(/i.test(value)) return parseRgbFunction(value);
  throw new Error(`不支持的颜色格式：${input}`);
}

/** 把半透明前景合成到不透明背景上。 */
export function composite(foreground: Rgba, background: Rgba): Rgba {
  if (background.a < 1) throw new Error('合成背景必须是不透明颜色');
  const mix = (front: number, back: number): number =>
    front * foreground.a + back * (1 - foreground.a);
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: 1,
  };
}

function toLinear(channel: number): number {
  const srgb = channel / CHANNEL_MAX;
  return srgb <= SRGB_LINEAR_THRESHOLD
    ? srgb / SRGB_LINEAR_DIVISOR
    : ((srgb + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}

export function relativeLuminance(color: Rgba): number {
  return (
    LUMINANCE_WEIGHTS.r * toLinear(color.r) +
    LUMINANCE_WEIGHTS.g * toLinear(color.g) +
    LUMINANCE_WEIGHTS.b * toLinear(color.b)
  );
}

/** 计算前景（可半透明）在不透明背景上的对比度，结果范围 1–21。 */
export function contrastRatio(foreground: string, background: string): number {
  const back = parseColor(background);
  const front = composite(parseColor(foreground), back);
  const l1 = relativeLuminance(front);
  const l2 = relativeLuminance(back);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + FLARE) / (darker + FLARE);
}

/** 把一组半透明图层按从下到上的顺序叠加到底色上，返回 `#RRGGBB`。 */
export function flattenLayers(base: string, layers: readonly string[]): string {
  const result = layers.reduce<Rgba>(
    (under, layer) => composite(parseColor(layer), under),
    parseColor(base),
  );
  const hex = (channel: number): string => Math.round(channel).toString(HEX_BASE).padStart(2, '0');
  return `#${hex(result.r)}${hex(result.g)}${hex(result.b)}`.toUpperCase();
}

const ALPHA_PRECISION = 3;

/** 给颜色换上新的不透明度，输出 `rgba()`。用于从色板派生半透明着色。 */
export function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseColor(color);
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(Number(alpha.toFixed(ALPHA_PRECISION)))})`;
}
