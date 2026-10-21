import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { iconSvg, renderIconPixels, renderIconPng } from './icon.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const SIZE = 128;
const CHANNELS = 4;

function pixelAt(pixels: Uint8Array, size: number, x: number, y: number): number[] {
  const offset = (y * size + x) * CHANNELS;
  return [...pixels.subarray(offset, offset + CHANNELS)];
}

/** 图案坐标（64×64）换算为像素坐标 */
function at(pixels: Uint8Array, designX: number, designY: number): number[] {
  const scale = SIZE / 64;
  return pixelAt(pixels, SIZE, Math.floor(designX * scale), Math.floor(designY * scale));
}

describe('renderIconPixels', () => {
  const rounded = renderIconPixels(SIZE, 'rounded');
  const fullBleed = renderIconPixels(SIZE, 'full-bleed');

  it('圆角图标的四角透明，铺满图标的四角不透明', () => {
    expect(pixelAt(rounded, SIZE, 0, 0)[3]).toBe(0);
    expect(pixelAt(rounded, SIZE, SIZE - 1, SIZE - 1)[3]).toBe(0);
    expect(pixelAt(fullBleed, SIZE, 0, 0)[3]).toBe(255);
    expect(pixelAt(fullBleed, SIZE, SIZE - 1, SIZE - 1)[3]).toBe(255);
  });

  it('字形（横杠、上方两点）为白色，其余是渐变底色', () => {
    expect(at(fullBleed, 32, 39.5)).toEqual([255, 255, 255, 255]);
    expect(at(fullBleed, 26, 15.5)).toEqual([255, 255, 255, 255]);
    expect(at(fullBleed, 38, 15.5)).toEqual([255, 255, 255, 255]);
    const [red, green, blue, alpha] = at(fullBleed, 8, 32);
    expect(alpha).toBe(255);
    expect(blue).toBeGreaterThan(green ?? 0);
    expect(red).toBeLessThan(255);
  });

  it('渐变从左上的浅靛蓝过渡到右下的深靛蓝', () => {
    const topLeft = at(fullBleed, 1, 1);
    const bottomRight = at(fullBleed, 62, 62);
    expect(topLeft[0]).toBeGreaterThan(bottomRight[0] ?? 0);
    expect(topLeft[1]).toBeGreaterThan(bottomRight[1] ?? 0);
  });

  it('圆角边缘抗锯齿：出现半透明像素', () => {
    const alphas = Array.from(
      { length: SIZE },
      (_, index) => pixelAt(rounded, SIZE, index, index)[3],
    );
    expect(alphas.some((alpha) => alpha !== undefined && alpha > 0 && alpha < 255)).toBe(true);
  });
});

describe('renderIconPng', () => {
  it('输出指定尺寸的 PNG', () => {
    const png = renderIconPng(48, 'rounded');
    expect(png.readUInt32BE(16)).toBe(48);
    expect(png.readUInt32BE(20)).toBe(48);
  });

  it('像素与 renderIconPixels 一致', () => {
    const png = renderIconPng(16, 'full-bleed');
    const idatLength = png.readUInt32BE(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    const pixels = renderIconPixels(16, 'full-bleed');
    expect([...raw.subarray(1, 1 + 16 * CHANNELS)]).toEqual([...pixels.subarray(0, 16 * CHANNELS)]);
  });
});

describe('iconSvg', () => {
  it('public/favicon.svg 与生成结果一致（修改图案后需同步）', () => {
    const committed = readFileSync(resolve(ROOT, 'public/favicon.svg'), 'utf8');
    expect(committed).toBe(iconSvg());
  });
});
