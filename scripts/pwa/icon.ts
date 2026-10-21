import { encodePng } from './png.ts';

/**
 * 应用图标：靛蓝渐变底 + 白色“Ä”。
 * 图案由几何图形组成，SVG（favicon）与 PNG（安装图标）从同一份数据生成，
 * 不依赖字体，在任何系统上都一致。
 */

/** 图案坐标系的边长 */
const VIEWBOX = 64;
const CORNER_RADIUS = 14.4;
const SUPERSAMPLE = 4;

type Point = readonly [x: number, y: number];
type Rgb = readonly [red: number, green: number, blue: number];

const GRADIENT_FROM_HEX = '#7D7AFF';
const GRADIENT_TO_HEX = '#5856D6';
const GLYPH_HEX = '#FFFFFF';

const GRADIENT_FROM: Rgb = [0x7d, 0x7a, 0xff];
const GRADIENT_TO: Rgb = [0x58, 0x56, 0xd6];
const GLYPH_RGB: Rgb = [0xff, 0xff, 0xff];

interface Stroke {
  readonly points: readonly Point[];
  readonly width: number;
}

interface Dot {
  readonly center: Point;
  readonly radius: number;
}

/** A 的两条斜腿与横杠（圆头圆角），以及上方的两点 */
const STROKES: readonly Stroke[] = [
  {
    points: [
      [21.5, 49],
      [32, 24.5],
      [42.5, 49],
    ],
    width: 6.4,
  },
  {
    points: [
      [25.5, 39.5],
      [38.5, 39.5],
    ],
    width: 5,
  },
];

const DOTS: readonly Dot[] = [
  { center: [26, 15.5], radius: 3.1 },
  { center: [38, 15.5], radius: 3.1 },
];

export type IconShape = 'rounded' | 'full-bleed';

/** 圆角图标（常规用途、favicon）与铺满画布的图标（iOS 与可遮罩图标由系统裁切形状） */
export const ICON_SHAPES: readonly IconShape[] = ['rounded', 'full-bleed'];

function pathData(points: readonly Point[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${String(x)} ${String(y)}`)
    .join('');
}

/** 圆角方形图标的 SVG（public/favicon.svg 必须与它一致，由单元测试保证） */
export function iconSvg(): string {
  const strokes = STROKES.map(
    ({ points, width }) => `<path d="${pathData(points)}" stroke-width="${String(width)}"/>`,
  ).join('');
  const dots = DOTS.map(
    ({ center: [x, y], radius }) =>
      `<circle cx="${String(x)}" cy="${String(y)}" r="${String(radius)}"/>`,
  ).join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(VIEWBOX)} ${String(VIEWBOX)}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GRADIENT_FROM_HEX}"/><stop offset="1" stop-color="${GRADIENT_TO_HEX}"/></linearGradient></defs>`,
    `<rect width="${String(VIEWBOX)}" height="${String(VIEWBOX)}" rx="${String(CORNER_RADIUS)}" fill="url(#g)"/>`,
    `<g fill="none" stroke="${GLYPH_HEX}" stroke-linecap="round" stroke-linejoin="round">${strokes}</g>`,
    `<g fill="${GLYPH_HEX}">${dots}</g>`,
    '</svg>',
    '',
  ].join('\n');
}

function distanceToSegment([x, y]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** 字形的外接矩形（含线宽）。大部分像素落在它之外，先用它快速排除 */
const GLYPH_BOUNDS: Bounds = (() => {
  const extents = [
    ...STROKES.flatMap(({ points, width }) =>
      points.map(([x, y]) => ({ x, y, margin: width / 2 })),
    ),
    ...DOTS.map(({ center: [x, y], radius }) => ({ x, y, margin: radius })),
  ];
  return {
    minX: Math.min(...extents.map(({ x, margin }) => x - margin)),
    maxX: Math.max(...extents.map(({ x, margin }) => x + margin)),
    minY: Math.min(...extents.map(({ y, margin }) => y - margin)),
    maxY: Math.max(...extents.map(({ y, margin }) => y + margin)),
  };
})();

function inGlyph(point: Point): boolean {
  const [x, y] = point;
  if (x < GLYPH_BOUNDS.minX || x > GLYPH_BOUNDS.maxX) return false;
  if (y < GLYPH_BOUNDS.minY || y > GLYPH_BOUNDS.maxY) return false;
  const onStroke = STROKES.some(({ points, width }) =>
    points.some((from, index) => {
      const to = points[index + 1];
      return to !== undefined && distanceToSegment(point, from, to) <= width / 2;
    }),
  );
  return (
    onStroke ||
    DOTS.some(
      ({ center, radius }) => Math.hypot(point[0] - center[0], point[1] - center[1]) <= radius,
    )
  );
}

function inRoundedSquare([x, y]: Point): boolean {
  const half = VIEWBOX / 2;
  const dx = Math.max(Math.abs(x - half) - (half - CORNER_RADIUS), 0);
  const dy = Math.max(Math.abs(y - half) - (half - CORNER_RADIUS), 0);
  return dx * dx + dy * dy <= CORNER_RADIUS * CORNER_RADIUS;
}

function gradientAt([x, y]: Point): Rgb {
  const t = (x + y) / (2 * VIEWBOX);
  const channel = (index: 0 | 1 | 2): number =>
    GRADIENT_FROM[index] + (GRADIENT_TO[index] - GRADIENT_FROM[index]) * t;
  return [channel(0), channel(1), channel(2)];
}

/** 渲染为 RGBA 像素：每个像素取 4×4 个子采样，边缘抗锯齿 */
export function renderIconPixels(size: number, shape: IconShape): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const scale = VIEWBOX / size;
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let covered = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const point: Point = [
            (column + (sx + 0.5) / SUPERSAMPLE) * scale,
            (row + (sy + 0.5) / SUPERSAMPLE) * scale,
          ];
          if (shape === 'rounded' && !inRoundedSquare(point)) continue;
          const [r, g, b] = inGlyph(point) ? GLYPH_RGB : gradientAt(point);
          covered += 1;
          red += r;
          green += g;
          blue += b;
        }
      }
      if (covered === 0) continue;
      const offset = (row * size + column) * 4;
      pixels[offset] = Math.round(red / covered);
      pixels[offset + 1] = Math.round(green / covered);
      pixels[offset + 2] = Math.round(blue / covered);
      pixels[offset + 3] = Math.round((covered / samples) * 255);
    }
  }
  return pixels;
}

export function renderIconPng(size: number, shape: IconShape): Buffer {
  return encodePng(size, size, renderIconPixels(size, shape));
}
