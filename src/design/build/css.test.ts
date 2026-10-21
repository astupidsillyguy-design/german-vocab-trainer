import { describe, expect, it } from 'vitest';
import {
  GLASS_CANVAS_BLEED,
  GLASS_TIER_ATTRIBUTE,
  glassVariants,
  materials,
  semanticColors,
  springs,
  wallpaper,
} from '../tokens/index.ts';
import { buildTokenCss } from './css.ts';
import { cssVarName, kebab } from './naming.ts';

const css = buildTokenCss();

function mediaBlock(query: string): string {
  const start = css.indexOf(`@media ${query}`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('\n}\n', start));
}

describe('naming', () => {
  it('把 camelCase 与数字转换为 kebab-case', () => {
    expect(kebab('groupedElevated')).toBe('grouped-elevated');
    expect(kebab('caption1')).toBe('caption1');
    expect(cssVarName('color', 'label', 'onSolid')).toBe('--color-label-on-solid');
  });
});

describe('buildTokenCss', () => {
  it('输出合法：括号平衡，无 undefined / NaN', () => {
    expect(css.split('{').length).toBe(css.split('}').length);
    expect(css).not.toMatch(/undefined|NaN|Infinity/);
  });

  it('每个语义色都有对应变量', () => {
    expect(css).toContain(`--color-tint-base: ${semanticColors.light.tint.base};`);
    expect(css).toContain(`--color-label-secondary: ${semanticColors.light.label.secondary};`);
  });

  it.each(Object.keys(materials))('材质 %s 输出着色、模糊与饱和度', (material) => {
    expect(css).toContain(`--material-${material}-tint:`);
    expect(css).toContain(`--material-${material}-blur:`);
    expect(css).toContain(`--material-${material}-saturation:`);
  });

  it.each(Object.keys(springs))('弹簧 %s 输出 linear() 缓动与时长', (spring) => {
    expect(css).toMatch(new RegExp(`--spring-${spring}: linear\\(`));
    expect(css).toMatch(new RegExp(`--spring-${spring}-duration: \\d+ms;`));
  });

  it('减少动态效果：弹簧时长归零、按压不缩放', () => {
    const block = mediaBlock('(prefers-reduced-motion: reduce)');
    for (const spring of Object.keys(springs))
      expect(block).toContain(`--spring-${spring}-duration: 0ms;`);
    expect(block).toContain('--press-scale: 1;');
    expect(block).toContain('--lift-scale: 1;');
  });

  it('降低透明度：材质改为不透明并关闭模糊', () => {
    const block = mediaBlock('(prefers-reduced-transparency: reduce)');
    for (const [name, material] of Object.entries(materials)) {
      expect(block).toContain(`--material-${name}-tint: ${material.solid};`);
      expect(block).toContain(`--material-${name}-blur: 0px;`);
    }
  });

  it('增强对比度：覆盖次要文字颜色', () => {
    expect(mediaBlock('(prefers-contrast: more)')).toContain('--color-label-secondary:');
  });

  it('提供尺寸等级覆盖与强制颜色模式', () => {
    expect(css).toContain(":root[data-size-class='regular']");
    expect(css).toContain(":root[data-size-class='expanded']");
    expect(css).toContain('@media (forced-colors: active)');
  });

  it.each(Object.keys(glassVariants))(
    '玻璃变体 %s 输出着色、模糊、饱和度、高光与描边',
    (variant) => {
      for (const part of ['tint', 'blur', 'saturation', 'highlight', 'rim'])
        expect(css).toContain(`--glass-${variant}-${part}:`);
    },
  );

  it('主色玻璃使用自己的着色；画布外扩、指针高光与壁纸渐变来自 token', () => {
    expect(css).toContain(`--glass-prominent-tint: ${glassVariants.prominent.tint};`);
    expect(css).toContain(`--glass-regular-tint: ${materials.regular.tint};`);
    expect(css).toContain(`--glass-canvas-bleed: ${String(GLASS_CANVAS_BLEED)}px;`);
    expect(css).toMatch(/--glass-pointer-ease: \d+ms;/);
    const gradient = /--wallpaper-gradient: (.+);/.exec(css)?.[1] ?? '';
    expect(gradient.match(/radial-gradient\(/g)).toHaveLength(wallpaper.blobs.length);
    for (const blob of wallpaper.blobs)
      expect(gradient).toContain(`var(--color-wallpaper-${blob.color})`);
  });

  it('不透明档（应用内选择 / 不支持 backdrop-filter）与“降低透明度”输出相同的覆盖', () => {
    const selector = `:root[${GLASS_TIER_ATTRIBUTE}='opaque'] {`;
    const start = css.indexOf(selector);
    expect(start).toBeGreaterThanOrEqual(0);
    const declarations = (text: string): string[] =>
      text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('--'));
    const tierBlock = css.slice(start + selector.length, css.indexOf('}', start));
    expect(declarations(mediaBlock('(prefers-reduced-transparency: reduce)'))).toEqual(
      declarations(tierBlock),
    );
    expect(tierBlock).toContain(`--glass-prominent-tint: ${glassVariants.prominent.solidTint};`);
    expect(tierBlock).toContain(`--glass-clear-tint: ${materials.clear.solid};`);
    expect(tierBlock).toContain('--glass-regular-blur: 0px;');
    expect(tierBlock).toContain('--glass-pointer-strength: 0;');
  });

  it('增强对比度与强制颜色模式下玻璃不透明', () => {
    expect(mediaBlock('(prefers-contrast: more)')).toContain('--glass-regular-blur: 0px;');
    const forced = mediaBlock('(forced-colors: active)');
    for (const variant of Object.keys(glassVariants)) {
      expect(forced).toContain(`--glass-${variant}-tint: Canvas;`);
      expect(forced).toContain(`--glass-${variant}-rim: CanvasText;`);
    }
  });

  it('日文界面使用日文字体栈', () => {
    expect(css).toContain("[lang|='ja']");
  });
});
