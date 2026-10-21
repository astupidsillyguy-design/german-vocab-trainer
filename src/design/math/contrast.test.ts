import { describe, expect, it } from 'vitest';
import {
  composite,
  contrastRatio,
  flattenLayers,
  parseColor,
  relativeLuminance,
} from './contrast.ts';

describe('parseColor', () => {
  it.each([
    ['#fff', { r: 255, g: 255, b: 255, a: 1 }],
    ['#0008', { r: 0, g: 0, b: 0, a: 136 / 255 }],
    ['#5856D6', { r: 88, g: 86, b: 214, a: 1 }],
    ['#FF000080', { r: 255, g: 0, b: 0, a: 128 / 255 }],
    ['rgb(1, 2, 3)', { r: 1, g: 2, b: 3, a: 1 }],
    ['rgba(60, 60, 67, 0.6)', { r: 60, g: 60, b: 67, a: 0.6 }],
    ['rgb(10 20 30 / 50%)', { r: 10, g: 20, b: 30, a: 0.5 }],
  ])('%s', (input, expected) => {
    const color = parseColor(input);
    expect(color.r).toBe(expected.r);
    expect(color.g).toBe(expected.g);
    expect(color.b).toBe(expected.b);
    expect(color.a).toBeCloseTo(expected.a);
  });

  it.each(['#12', '#12345', 'red', 'hsl(0 0% 0%)'])('拒绝无法解析的值 %s', (input) => {
    expect(() => parseColor(input)).toThrow();
  });
});

describe('contrastRatio', () => {
  it('黑白对比度为 21:1', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21);
  });

  it('同色对比度为 1:1', () => {
    expect(contrastRatio('#5856D6', '#5856D6')).toBeCloseTo(1);
  });

  it('与参数顺序无关', () => {
    expect(contrastRatio('#5856D6', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#5856D6'));
  });

  it('半透明前景会先与背景合成', () => {
    expect(contrastRatio('rgba(0, 0, 0, 0)', '#FFFFFF')).toBeCloseTo(1);
    expect(contrastRatio('rgba(0, 0, 0, 0.5)', '#FFFFFF')).toBeLessThan(
      contrastRatio('#000', '#FFF'),
    );
  });
});

describe('composite / flattenLayers', () => {
  it('不透明前景完全覆盖背景', () => {
    expect(composite(parseColor('#123456'), parseColor('#FFFFFF'))).toMatchObject({
      r: 0x12,
      g: 0x34,
      b: 0x56,
    });
  });

  it('按从下到上的顺序叠加', () => {
    expect(flattenLayers('#FFFFFF', ['rgba(0, 0, 0, 0.5)'])).toBe('#808080');
    expect(flattenLayers('#000000', ['#FFFFFF', 'rgba(0, 0, 0, 0.5)'])).toBe('#808080');
  });

  it('相对亮度：白 1，黑 0', () => {
    expect(relativeLuminance(parseColor('#FFFFFF'))).toBeCloseTo(1);
    expect(relativeLuminance(parseColor('#000000'))).toBeCloseTo(0);
  });
});
