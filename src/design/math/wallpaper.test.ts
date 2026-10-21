import { describe, expect, it } from 'vitest';
import { wallpaper, type WallpaperBlob } from '../tokens/index.ts';
import { blobCenter, blobMask, smoothstep, wallpaperGradientCss } from './wallpaper.ts';

const [first, second] = wallpaper.blobs;

describe('壁纸几何', () => {
  it.each(wallpaper.blobs.map((blob, index) => [index, blob] as const))(
    '色块 %s 在 t = 0 时位于 token 中的初始位置（CSS 档与 WebGL 首帧一致）',
    (_index, blob) => {
      const center = blobCenter(blob, 0, wallpaper.yPeriodRatio);
      expect(center.x).toBeCloseTo(blob.x, 10);
      expect(center.y).toBeCloseTo(blob.y, 10);
    },
  );

  it('漂移幅度不超过 token 的两倍，轨迹不闭合（x 周期过后 y 未回到原点）', () => {
    for (let time = 0; time < first.periodS * 3; time += 1) {
      const center = blobCenter(first, time, wallpaper.yPeriodRatio);
      expect(Math.abs(center.x - first.x)).toBeLessThanOrEqual(2 * first.driftX + 1e-9);
      expect(Math.abs(center.y - first.y)).toBeLessThanOrEqual(2 * first.driftY + 1e-9);
    }
    const afterPeriod = blobCenter(first, first.periodS, wallpaper.yPeriodRatio);
    expect(afterPeriod.x).toBeCloseTo(first.x);
    expect(afterPeriod.y).not.toBeCloseTo(first.y);
  });

  it('smoothstep：两端夹取，中点为 1/2', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 1 / 2)).toBe(1 / 2);
  });

  it('遮罩：内半径内为 1，半径外为 0', () => {
    const inner = first.radius * (1 - first.softness);
    expect(blobMask(first, inner / 2)).toBe(1);
    expect(blobMask(first, first.radius)).toBe(0);
    expect(blobMask(first, (inner + first.radius) / 2)).toBeCloseTo(1 / 2);
  });

  it('CSS 渐变：每个色块一层，后绘制的色块在最上层', () => {
    const blobs: readonly WallpaperBlob[] = [first, { ...second, color: 'stop4' }];
    const css = wallpaperGradientCss(blobs, (blob) => `var(--${blob.color})`);
    const layers = css.split('radial-gradient(').slice(1);
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('var(--stop4)');
    expect(layers[1]).toContain(`var(--${first.color})`);
    const percent = (value: number): string => Number((value * 100).toFixed(2)).toString();
    expect(css).toContain(`circle at ${percent(first.x)}% ${percent(first.y)}%`);
    expect(css).toMatch(/color-mix\(in srgb, var\(--stop4\) \d+(\.\d+)?%, transparent\)/);
    expect(css).not.toMatch(/NaN|undefined/);
  });
});
