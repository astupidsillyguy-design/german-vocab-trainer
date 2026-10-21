/**
 * 颜色 Token 的无障碍契约：用数学方式证明所有“可阅读”的颜色组合满足 WCAG AA。
 * 任何人修改颜色或玻璃材质后，只要破坏了对比度，这里就会失败。
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio, flattenLayers, parseColor, WCAG_AA, withAlpha } from '../math/contrast.ts';
import {
  GLASS_CANVAS_BLEED,
  glassLight,
  glassShadow,
  glassVariants,
  highContrastOverrides,
  materials,
  semanticColors,
  wallpaper,
  type GlassVariant,
  type MaterialToken,
} from './index.ts';

const colors = semanticColors.light;
const TONES = ['tint', 'success', 'danger', 'warning'] as const;

const READABLE_LABELS = {
  primary: colors.label.primary,
  secondary: colors.label.secondary,
  placeholder: colors.label.placeholder,
};

const TONE_TEXT = Object.fromEntries(TONES.map((tone) => [tone, colors[tone].text]));

/** 应用中玻璃背后可能出现的背景：壁纸各色块、分组背景、白色卡片 */
const BACKDROPS = {
  ...colors.wallpaper,
  grouped: colors.background.grouped,
  primary: colors.background.primary,
};

/** 承载正文的材质；clear 只用于图标与大号文字，单独校验 */
const TEXT_MATERIALS = ['regular', 'thick', 'chrome'] as const satisfies readonly MaterialToken[];

function surfacesFor(material: MaterialToken): [string, string][] {
  return Object.entries(BACKDROPS).map(([name, backdrop]) => [
    name,
    flattenLayers(backdrop, [materials[material].tint]),
  ]);
}

describe('不透明背景上的文字', () => {
  const backgrounds = {
    primary: colors.background.primary,
    grouped: colors.background.grouped,
    ...colors.wallpaper,
  };
  it.each(Object.entries({ ...READABLE_LABELS, ...TONE_TEXT }))(
    '%s ≥ 4.5:1',
    (_name, foreground) => {
      for (const background of Object.values(backgrounds)) {
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(WCAG_AA.normalText);
      }
    },
  );
});

describe.each(TEXT_MATERIALS)('%s 玻璃上的文字', (material) => {
  it.each(Object.entries({ ...READABLE_LABELS, ...TONE_TEXT }))(
    '%s ≥ 4.5:1（所有背景）',
    (_name, foreground) => {
      for (const [, surface] of surfacesFor(material)) {
        expect(contrastRatio(foreground, surface)).toBeGreaterThanOrEqual(WCAG_AA.normalText);
      }
    },
  );

  it.each(TONES)('%s 浅色底（徽标、选中态）上的同色文字 ≥ 4.5:1', (tone) => {
    for (const [, surface] of surfacesFor(material)) {
      const tinted = flattenLayers(surface, [colors[tone].subtle]);
      expect(contrastRatio(colors[tone].text, tinted)).toBeGreaterThanOrEqual(WCAG_AA.normalText);
    }
  });
});

describe('clear 玻璃', () => {
  it('主要与次要文字在壁纸上 ≥ 4.5:1', () => {
    for (const backdrop of Object.values(colors.wallpaper)) {
      const surface = flattenLayers(backdrop, [materials.clear.tint]);
      expect(contrastRatio(colors.label.primary, surface)).toBeGreaterThanOrEqual(
        WCAG_AA.normalText,
      );
      expect(contrastRatio(colors.label.secondary, surface)).toBeGreaterThanOrEqual(
        WCAG_AA.normalText,
      );
    }
  });
});

describe('系统栏（chrome）下方滚过彩色内容', () => {
  it.each([colors.tint.base, colors.danger.solid, colors.success.solid])(
    '背后是 %s 时次要文字仍 ≥ 4.5:1',
    (content) => {
      const surface = flattenLayers(content, [materials.chrome.tint]);
      expect(contrastRatio(colors.label.secondary, surface)).toBeGreaterThanOrEqual(
        WCAG_AA.normalText,
      );
    },
  );
});

describe('实心底上的白字', () => {
  const solids = {
    tint: colors.tint.base,
    tintPressed: colors.tint.pressed,
    success: colors.success.solid,
    danger: colors.danger.solid,
    warning: colors.warning.solid,
    neutralBadge: flattenLayers(colors.background.primary, [colors.label.secondary]),
  };
  it.each(Object.entries(solids))('%s ≥ 4.5:1', (_name, solid) => {
    expect(contrastRatio(colors.label.onSolid, solid)).toBeGreaterThanOrEqual(WCAG_AA.normalText);
  });
});

describe('非文字元素', () => {
  it('焦点环与背景 ≥ 3:1（WCAG 1.4.11）', () => {
    for (const background of [colors.background.primary, ...Object.values(colors.wallpaper)]) {
      expect(contrastRatio(colors.focusRing, background)).toBeGreaterThanOrEqual(WCAG_AA.nonText);
    }
  });
});

describe('增强对比度', () => {
  it('覆盖值的对比度高于默认值', () => {
    const background = colors.background.primary;
    expect(contrastRatio(highContrastOverrides.label.secondary, background)).toBeGreaterThan(
      contrastRatio(colors.label.secondary, background),
    );
    expect(contrastRatio(highContrastOverrides.label.placeholder, background)).toBeGreaterThan(
      contrastRatio(colors.label.placeholder, background),
    );
    expect(contrastRatio(highContrastOverrides.tint.text, background)).toBeGreaterThan(
      contrastRatio(colors.tint.text, background),
    );
  });
});

describe('材质', () => {
  it.each(Object.keys(materials) as MaterialToken[])(
    '%s：“降低透明度”时的替代色是不透明的',
    (material) => {
      expect(materials[material].solid).toMatch(/^#[0-9A-F]{6}$/i);
    },
  );
});

describe('Liquid Glass', () => {
  const variants = Object.entries(glassVariants) as [
    GlassVariant,
    (typeof glassVariants)[GlassVariant],
  ][];

  it.each(variants)('%s：沿用已有材质，光学参数在物理合理范围内', (_name, optics) => {
    expect(materials).toHaveProperty(optics.material);
    expect(optics.bezel).toBeGreaterThan(0);
    expect(optics.refraction).toBeGreaterThan(0);
    // 位移不超过弧面宽度的 1.5 倍，否则边缘会采样到远处的背景，看起来像“破碎”而不是透镜
    expect(optics.refraction).toBeLessThanOrEqual(optics.bezel * 1.5);
    expect(optics.ior).toBeGreaterThan(1);
    expect(optics.ior).toBeLessThan(2);
    for (const unit of [optics.dispersion, optics.fresnel, optics.specular]) {
      expect(unit).toBeGreaterThanOrEqual(0);
      expect(unit).toBeLessThanOrEqual(1);
    }
    expect(optics.specularSharpness).toBeGreaterThanOrEqual(1);
  });

  it('承载正文的变体只使用通过对比度校验的材质', () => {
    const textVariants: GlassVariant[] = ['regular', 'chrome', 'thick'];
    for (const variant of textVariants)
      expect(TEXT_MATERIALS).toContain(glassVariants[variant].material);
  });

  it('主色玻璃：白字在所有背景上 ≥ 4.5:1（含指针高光峰值）', () => {
    const { tint } = glassVariants.prominent;
    const highlight = withAlpha(colors.label.onSolid, glassLight.pointerStrength);
    for (const backdrop of Object.values(BACKDROPS)) {
      for (const layers of [[tint], [tint, highlight]]) {
        expect(
          contrastRatio(colors.label.onSolid, flattenLayers(backdrop, layers)),
        ).toBeGreaterThanOrEqual(WCAG_AA.normalText);
      }
    }
  });

  it('主色玻璃：不透明替代色不透明，且白字 ≥ 4.5:1', () => {
    const { solidTint } = glassVariants.prominent;
    expect(parseColor(solidTint).a).toBe(1);
    expect(contrastRatio(colors.label.onSolid, solidTint)).toBeGreaterThanOrEqual(
      WCAG_AA.normalText,
    );
  });

  it('画布外扩足以容纳投影', () => {
    expect(GLASS_CANVAS_BLEED).toBeGreaterThanOrEqual(glassShadow.radius + glassShadow.offsetY);
    expect(glassShadow.opacity).toBeLessThan(1 / 2);
  });

  it('壁纸色块：颜色均为语义色，位置与半径在视口比例范围内', () => {
    for (const blob of wallpaper.blobs) {
      expect(colors.wallpaper).toHaveProperty(blob.color);
      for (const ratio of [blob.x, blob.y, blob.radius, blob.softness])
        expect(ratio).toBeGreaterThanOrEqual(0);
      for (const ratio of [blob.x, blob.y, blob.softness]) expect(ratio).toBeLessThanOrEqual(1);
      expect(blob.periodS).toBeGreaterThan(0);
    }
    // 无理数周期比：x、y 周期之比不能是简单分数，否则轨迹闭合、能看出循环
    expect(Number.isInteger(wallpaper.yPeriodRatio * 10)).toBe(false);
  });
});
