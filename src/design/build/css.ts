/**
 * Token → CSS 变量。
 *
 * 由 Vite 插件 `virtual:design-tokens.css` 在构建期调用，保证 CSS 与 TS 永远同源。
 * 组件 CSS 只引用这里生成的变量；系统偏好（降低透明度、增强对比度、减少动态效果）
 * 也在这里统一覆盖变量值，组件内部无需写任何媒体查询。
 */
import { springToCss } from '../math/spring.ts';
import { wallpaperGradientCss } from '../math/wallpaper.ts';
import {
  blur,
  cjkLeading,
  componentGeometry,
  contentMaxWidth,
  controlHeight,
  CAPSULE_RADIUS,
  fadeDuration,
  fontWeight,
  GLASS_CANVAS_BLEED,
  GLASS_TIER_ATTRIBUTE,
  glassLight,
  glassVariants,
  highContrastOverrides,
  interaction,
  layoutMargin,
  materials,
  monoFontStack,
  NATIVE_SQUIRCLE_RADIUS_SCALE,
  radius,
  BROWSER_DEFAULT_FONT_SIZE_PX,
  ROOT_FONT_SIZE_PX,
  semanticColors,
  shadow,
  sheetDetent,
  sidebarWidth,
  SIZE_CLASSES,
  space,
  spinner,
  springs,
  textFontStack,
  typeScale,
  wallpaper,
  zIndex,
} from '../tokens/index.ts';
import { cssVarName } from './naming.ts';

type Declarations = (readonly [name: string, value: string])[];

const REM_PRECISION = 4;
const RATIO_PRECISION = 4;
const RETINA_DPPX = 2;
const HAIRLINE_STANDARD = '1px';
const HAIRLINE_RETINA = '0.5px';

const px = (value: number): string => `${value}px`;
const ms = (value: number): string => `${value}ms`;
const rem = (valuePx: number): string =>
  `${Number((valuePx / ROOT_FONT_SIZE_PX).toFixed(REM_PRECISION))}rem`;
const ratio = (value: number): string => Number(value.toFixed(RATIO_PRECISION)).toString();
const PERCENT = 100;

/** 递归展开嵌套对象：{ label: { primary } } → --color-label-primary */
function flatten(prefix: readonly string[], node: unknown, out: Declarations): Declarations {
  if (typeof node === 'string' || typeof node === 'number') {
    out.push([cssVarName(...prefix), String(node)]);
    return out;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) flatten([...prefix, key], value, out);
  }
  return out;
}

function block(selector: string, declarations: Declarations): string {
  const body = declarations.map(([name, value]) => `  ${name}: ${value};`).join('\n');
  return `${selector} {\n${body}\n}`;
}

function media(query: string, inner: string): string {
  const indented = inner
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  return `@media ${query} {\n${indented}\n}`;
}

function colorDeclarations(): Declarations {
  return flatten(['color'], semanticColors.light, []);
}

function materialDeclarations(): Declarations {
  const out: Declarations = [];
  for (const [name, material] of Object.entries(materials)) {
    out.push(
      [cssVarName('material', name, 'tint'), material.tint],
      [cssVarName('material', name, 'blur'), px(blur[material.blur])],
      [cssVarName('material', name, 'saturation'), String(material.saturation)],
      [cssVarName('material', name, 'highlight'), material.highlight],
      [cssVarName('material', name, 'rim'), material.rim],
    );
  }
  return out;
}

/** Liquid Glass 各变体的 CSS 档参数（WebGL 档读取同一组 token）。 */
function glassDeclarations(): Declarations {
  const out: Declarations = [];
  for (const [name, optics] of Object.entries(glassVariants)) {
    const material = materials[optics.material];
    out.push(
      [cssVarName('glass', name, 'tint'), 'tint' in optics ? optics.tint : material.tint],
      [cssVarName('glass', name, 'blur'), px(blur[material.blur])],
      [cssVarName('glass', name, 'saturation'), String(material.saturation)],
      [cssVarName('glass', name, 'highlight'), material.highlight],
      [cssVarName('glass', name, 'rim'), material.rim],
    );
  }
  out.push(
    ['--glass-pointer-radius', px(glassLight.pointerRadius)],
    ['--glass-pointer-strength', String(glassLight.pointerStrength)],
    ['--glass-pointer-ease', ms(glassLight.pointerEaseMs)],
    ['--glass-canvas-bleed', px(GLASS_CANVAS_BLEED)],
    [
      '--wallpaper-gradient',
      wallpaperGradientCss(
        wallpaper.blobs,
        (blob) => `var(${cssVarName('color', 'wallpaper', blob.color)})`,
      ),
    ],
  );
  return out;
}

function opaqueGlassDeclarations(): Declarations {
  const out: Declarations = [];
  for (const [name, optics] of Object.entries(glassVariants)) {
    const material = materials[optics.material];
    out.push(
      [
        cssVarName('glass', name, 'tint'),
        'solidTint' in optics ? optics.solidTint : material.solid,
      ],
      [cssVarName('glass', name, 'blur'), '0px'],
      [cssVarName('glass', name, 'saturation'), '1'],
    );
  }
  out.push(['--glass-pointer-strength', '0']);
  return out;
}

/** 不透明材质：用于“降低透明度”与“增强对比度”。 */
function opaqueMaterialDeclarations(): Declarations {
  const out: Declarations = [];
  for (const [name, material] of Object.entries(materials)) {
    out.push(
      [cssVarName('material', name, 'tint'), material.solid],
      [cssVarName('material', name, 'blur'), '0px'],
      [cssVarName('material', name, 'saturation'), '1'],
    );
  }
  return out;
}

function typographyDeclarations(cjk: boolean): Declarations {
  const out: Declarations = [];
  for (const [name, style] of Object.entries(typeScale)) {
    const latinRatio = style.lineHeight / style.size;
    const cjkRatio =
      style.size >= cjkLeading.displayThresholdPx ? cjkLeading.display : cjkLeading.text;
    out.push([
      cssVarName('type', name, 'line-height'),
      ratio(cjk ? Math.max(latinRatio, cjkRatio) : latinRatio),
    ]);
  }
  out.push(['--tracking-enabled', cjk ? '0' : '1']);
  return out;
}

function typeScaleDeclarations(): Declarations {
  const out: Declarations = [];
  for (const [name, style] of Object.entries(typeScale)) {
    out.push(
      [cssVarName('type', name, 'size'), rem(style.size)],
      [cssVarName('type', name, 'weight'), String(fontWeight[style.weight])],
      [cssVarName('type', name, 'tracking'), px(style.tracking)],
    );
  }
  return out;
}

/** Windows 高对比度（强制颜色）模式：玻璃退化为系统画布色并加描边。 */
function forcedColorDeclarations(): Declarations {
  const out: Declarations = [['--color-focus-ring', 'Highlight']];
  for (const name of Object.keys(materials)) {
    out.push(
      [cssVarName('material', name, 'tint'), 'Canvas'],
      [cssVarName('material', name, 'blur'), '0px'],
      [cssVarName('material', name, 'rim'), 'CanvasText'],
    );
  }
  for (const name of Object.keys(glassVariants)) {
    out.push(
      [cssVarName('glass', name, 'tint'), 'Canvas'],
      [cssVarName('glass', name, 'blur'), '0px'],
      [cssVarName('glass', name, 'rim'), 'CanvasText'],
    );
  }
  out.push(['--glass-pointer-strength', '0']);
  return out;
}

/** 根字号：见 typography.ts 中 ROOT_FONT_SIZE_PX 的说明。 */
function rootFontSize(): string {
  const percent = Number(
    ((ROOT_FONT_SIZE_PX / BROWSER_DEFAULT_FONT_SIZE_PX) * PERCENT).toFixed(RATIO_PRECISION),
  );
  const standard = block('html', [['font-size', `${percent}%`]]);
  // -webkit-touch-callout 只在 iOS Safari 上受支持，用来避免 macOS Safari 采用 13px 的系统正文字号
  const ios = `@supports (font: -apple-system-body) and (-webkit-touch-callout: none) {\n${block('  html', [['font', '-apple-system-body']])}\n}`;
  return `${standard}\n\n${ios}`;
}

function typeClasses(): string {
  return Object.keys(typeScale)
    .map((name) =>
      block(`.type-${name}`, [
        ['font-family', 'var(--font-text)'],
        ['font-size', `var(${cssVarName('type', name, 'size')})`],
        ['line-height', `var(${cssVarName('type', name, 'line-height')})`],
        ['font-weight', `var(${cssVarName('type', name, 'weight')})`],
        [
          'letter-spacing',
          `calc(var(${cssVarName('type', name, 'tracking')}) * var(--tracking-enabled, 1))`,
        ],
      ]),
    )
    .join('\n\n');
}

function motionDeclarations(): Declarations {
  const out: Declarations = [];
  for (const [name, config] of Object.entries(springs)) {
    const { easing, durationMs } = springToCss(config);
    out.push(
      [cssVarName('spring', name), easing],
      [cssVarName('spring', name, 'duration'), ms(durationMs)],
    );
  }
  for (const [name, value] of Object.entries(fadeDuration))
    out.push([cssVarName('fade', name), ms(value)]);
  out.push(
    ['--press-scale', String(interaction.pressScale)],
    ['--press-scale-key', String(interaction.pressScaleKey)],
    ['--hover-lift', px(interaction.hoverLift)],
    ['--disabled-opacity', String(interaction.disabledOpacity)],
    ['--overlay-enter-scale', String(interaction.overlayEnterScale)],
    ['--lift-scale', String(interaction.liftScale)],
    ['--spinner-period', ms(spinner.periodMs)],
  );
  return out;
}

/** 减少动态效果：位移类动画瞬间完成，保留透明度渐变作为替代反馈。 */
function reducedMotionDeclarations(): Declarations {
  const out: Declarations = Object.keys(springs).map(
    (name) => [cssVarName('spring', name, 'duration'), '0ms'] as const,
  );
  out.push(
    ['--press-scale', '1'],
    ['--press-scale-key', '1'],
    ['--hover-lift', '0px'],
    ['--overlay-enter-scale', '1'],
    ['--lift-scale', '1'],
  );
  return out;
}

function scalarDeclarations(): Declarations {
  const out: Declarations = [];
  for (const [name, value] of Object.entries(radius))
    out.push([cssVarName('radius', name), px(value)]);
  out.push(
    ['--radius-capsule', px(CAPSULE_RADIUS)],
    ['--radius-squircle-scale', String(NATIVE_SQUIRCLE_RADIUS_SCALE)],
  );
  for (const [name, value] of Object.entries(space))
    out.push([cssVarName('space', name), px(value)]);
  for (const [name, value] of Object.entries(layoutMargin))
    out.push([cssVarName('layout-margin', name), px(value)]);
  out.push(['--layout-margin', px(layoutMargin.compact)]);
  for (const [name, value] of Object.entries(controlHeight))
    out.push([cssVarName('control-height', name), px(value)]);
  for (const [name, value] of Object.entries(componentGeometry))
    out.push([cssVarName('geometry', name), px(value)]);
  for (const [name, value] of Object.entries(contentMaxWidth))
    out.push([cssVarName('content-max-width', name), px(value)]);
  for (const [name, value] of Object.entries(sidebarWidth))
    out.push([cssVarName('sidebar-width', name), px(value)]);
  for (const [name, value] of Object.entries(shadow)) out.push([cssVarName('shadow', name), value]);
  for (const [name, value] of Object.entries(blur)) out.push([cssVarName('blur', name), px(value)]);
  for (const [name, value] of Object.entries(zIndex))
    out.push([cssVarName('z', name), String(value)]);
  out.push(
    ['--sheet-detent-medium', `${sheetDetent.mediumViewportPercent}dvh`],
    ['--sheet-large-top-inset', px(sheetDetent.largeTopInset)],
    ['--font-mono', monoFontStack],
    ['--hairline', HAIRLINE_STANDARD],
  );
  return out;
}

export function buildTokenCss(): string {
  const root = block(':root', [
    ['color-scheme', 'light'],
    ...colorDeclarations(),
    ...materialDeclarations(),
    ...glassDeclarations(),
    ...typeScaleDeclarations(),
    ...scalarDeclarations(),
    ...motionDeclarations(),
  ]);

  const sizeClasses = SIZE_CLASSES.filter((sizeClass) => sizeClass !== 'compact')
    .map((sizeClass) =>
      block(`:root[data-size-class='${sizeClass}']`, [
        ['--layout-margin', px(layoutMargin[sizeClass])],
      ]),
    )
    .join('\n\n');

  // 字体与行高按语言切换；嵌套的 lang 属性（如中文界面里的德语单词）会重新生效
  const latinLang = block(":root, [lang|='zh'], [lang|='de'], [lang|='en']", [
    ['--font-text', textFontStack('zh')],
  ]);
  const japaneseLang = block("[lang|='ja']", [['--font-text', textFontStack('ja')]]);
  const cjkMetrics = block(":root, [lang|='zh'], [lang|='ja']", typographyDeclarations(true));
  const latinMetrics = block("[lang|='de'], [lang|='en']", typographyDeclarations(false));

  const hairline = media(
    `(min-resolution: ${RETINA_DPPX}dppx)`,
    block(':root', [['--hairline', HAIRLINE_RETINA]]),
  );
  const opaque = [...opaqueMaterialDeclarations(), ...opaqueGlassDeclarations()];
  const reducedTransparency = media(
    '(prefers-reduced-transparency: reduce)',
    block(':root', opaque),
  );
  // 浏览器不支持 backdrop-filter，或用户在应用内选择“不透明”时由 GlassProvider 设置
  const opaqueTier = block(`:root[${GLASS_TIER_ATTRIBUTE}='opaque']`, opaque);
  const highContrast = media(
    '(prefers-contrast: more)',
    block(':root', [...flatten(['color'], highContrastOverrides, []), ...opaque]),
  );
  const reducedMotion = media(
    '(prefers-reduced-motion: reduce)',
    block(':root', reducedMotionDeclarations()),
  );
  const forcedColors = media('(forced-colors: active)', block(':root', forcedColorDeclarations()));

  return [
    '/* 由 src/design/build/css.ts 自动生成，请勿手动修改。 */',
    root,
    sizeClasses,
    latinLang,
    japaneseLang,
    cjkMetrics,
    latinMetrics,
    hairline,
    reducedTransparency,
    opaqueTier,
    highContrast,
    reducedMotion,
    forcedColors,
    rootFontSize(),
    typeClasses(),
  ].join('\n\n');
}
