import { describe, expect, it } from 'vitest';
import { WCAG_AA } from '../design/math/contrast';
import { semanticColors } from '../design/tokens';
import { colorSwatches } from './colorTokens';

describe('colorSwatches', () => {
  const swatches = colorSwatches(semanticColors.light);

  it('每个语义色都有唯一的 CSS 变量', () => {
    const vars = swatches.map((swatch) => swatch.cssVar);
    expect(new Set(vars).size).toBe(vars.length);
    expect(vars.every((name) => name.startsWith('--color-'))).toBe(true);
  });

  it('文字类颜色计算对比度且达到 AA', () => {
    const text = swatches.filter((swatch) => swatch.path.endsWith('.text'));
    expect(text.length).toBeGreaterThan(0);
    for (const swatch of text) {
      expect(swatch.contrast, swatch.path).not.toBeNull();
      expect(swatch.contrast ?? 0, swatch.path).toBeGreaterThanOrEqual(WCAG_AA.normalText);
    }
  });

  it('装饰性颜色（壁纸）不计算对比度', () => {
    const wallpaper = swatches.filter((swatch) => swatch.path.startsWith('wallpaper.'));
    expect(wallpaper.every((swatch) => swatch.contrast === null)).toBe(true);
  });
});
