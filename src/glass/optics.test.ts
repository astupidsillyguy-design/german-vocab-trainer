import { describe, expect, it } from 'vitest';
import { blur, glassVariants, materials, type GlassVariant } from '../design/tokens';
import {
  OPTICS_OVERRIDE_KEYS,
  opticsEqual,
  premultipliedColor,
  resolveOptics,
  rgbColor,
  variantTint,
} from './optics';

const VARIANTS = Object.keys(glassVariants) as GlassVariant[];

describe('光学参数解析', () => {
  it('颜色：RGB 归一化到 0–1，着色预乘 alpha', () => {
    expect(rgbColor('#FF8000')).toEqual([1, 128 / 255, 0]);
    const [r, g, b, a] = premultipliedColor('rgba(255, 255, 255, 0.5)');
    expect([r, g, b, a]).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it.each(VARIANTS)('%s：着色、模糊、饱和度、描边与 CSS 档同源', (variant) => {
    const optics = glassVariants[variant];
    const material = materials[optics.material];
    const resolved = resolveOptics(variant);
    expect(resolved.blurPx).toBe(blur[material.blur]);
    expect(resolved.saturation).toBe(material.saturation);
    expect(resolved.rim).toEqual(premultipliedColor(material.rim));
    expect(resolved.tint).toEqual(variantTint(variant));
    for (const key of OPTICS_OVERRIDE_KEYS) expect(resolved[key]).toBe(optics[key]);
  });

  it('主色玻璃覆盖材质着色', () => {
    expect(variantTint('prominent')).not.toEqual(variantTint('regular'));
    expect(variantTint('prominent')[3]).toBeGreaterThan(0.9);
  });

  it('覆盖值：只替换提供的参数，undefined 沿用 token', () => {
    const resolved = resolveOptics('regular', { refraction: 40, bezel: undefined });
    expect(resolved.refraction).toBe(40);
    expect(resolved.bezel).toBe(glassVariants.regular.bezel);
  });

  it('按数值比较（含向量）', () => {
    expect(opticsEqual(resolveOptics('clear'), resolveOptics('clear'))).toBe(true);
    expect(opticsEqual(resolveOptics('clear'), resolveOptics('clear', { fresnel: 0 }))).toBe(false);
    expect(opticsEqual(resolveOptics('regular'), resolveOptics('prominent'))).toBe(false);
  });
});
