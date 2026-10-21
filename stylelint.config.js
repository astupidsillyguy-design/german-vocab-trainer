/**
 * 样式约束：所有颜色、间距、字号、圆角、层级都必须来自 design tokens（CSS 变量），
 * 杜绝散落在各处的魔法数字与硬编码颜色。
 * @type {import('stylelint').Config}
 */
const TOKEN_ONLY = [
  '/^var\\(--/',
  '/^calc\\(/',
  '/^min\\(/',
  '/^max\\(/',
  '/^clamp\\(/',
  '/^env\\(safe-area-/',
];

export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['dist/**', 'coverage/**'],
  rules: {
    // CSS Modules 类名在 TSX 中以 styles.camelCase 访问
    'selector-class-pattern': [
      '^[a-z][a-zA-Z0-9]*$',
      { message: 'CSS Module 类名请使用 camelCase' },
    ],
    'keyframes-name-pattern': ['^[a-z][a-zA-Z0-9]*$', { message: '关键帧名称请使用 camelCase' }],
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklch'],
    'declaration-property-value-allowed-list': {
      '/^(margin|padding|gap|row-gap|column-gap)/': [...TOKEN_ONLY, '0', 'auto'],
      '/^inset/': [...TOKEN_ONLY, '0', 'auto', '50%', '100%'],
      'font-size': TOKEN_ONLY,
      'line-height': TOKEN_ONLY,
      'font-weight': TOKEN_ONLY,
      'letter-spacing': TOKEN_ONLY,
      '/^border(-.*)?-radius$/': [...TOKEN_ONLY, 'inherit', '50%'],
      'z-index': ['/^var\\(--z-/', '-1'],
      'transition-duration': TOKEN_ONLY,
      'animation-duration': TOKEN_ONLY,
    },
    // backdrop-filter 在 Safari 16/17 仍需前缀；其余前缀交给构建工具
    'property-no-vendor-prefix': [
      true,
      { ignoreProperties: ['backdrop-filter', '-webkit-backdrop-filter', 'text-size-adjust'] },
    ],
    'value-no-vendor-prefix': true,
    // 渐进增强：原生连续曲率圆角（Chrome 139+）
    'property-no-unknown': [true, { ignoreProperties: ['corner-shape'] }],
    // calc() 中的长度必须带单位（0px），否则整条声明失效
    'length-zero-no-unit': [true, { ignore: ['custom-properties'] }],
    'declaration-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'no-descending-specificity': null,
  },
  overrides: [
    {
      // 全局样式表：工具类使用 kebab-case；视觉隐藏使用业界标准写法
      files: ['src/styles/**/*.css'],
      rules: {
        'selector-class-pattern': '^[a-z][a-z0-9-]*$',
        'declaration-property-value-allowed-list': null,
      },
    },
  ],
};
