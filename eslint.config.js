// @ts-check
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** 允许直接出现的数字：0/1/-1/2（取半、成对）与 100（百分比），其余必须是具名常量或 token。 */
const ALLOWED_NUMBERS = [-1, 0, 1, 2, 100];

/**
 * 分层依赖规则：design（纯数据）→ glass（渲染引擎）/ motion（动效核心），二者都框架无关
 * → ui（组件）→ app / gallery（页面）。
 * 下层不得依赖上层。每条规则为 [禁止的路径模式, 提示]；区分大小写（src/glass 与 src/ui/Glass 是不同的层）。
 */
const layer = (...rules) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: rules.flatMap(([forbidden, message]) =>
        forbidden.map((group) => ({ group: [group], message, caseSensitive: true })),
      ),
    },
  ],
});

const UPPER_LAYERS = ['**/app/**', '**/gallery/**', '**/features/**'];
/** 设备同步的传输层（src/sync）：只有 features 层可以使用 */
const TRANSPORT = ['**/sync', '**/sync/**'];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'node_modules',
      '**/*.d.css.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-alert': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: '禁止 dangerouslySetInnerHTML：所有用户数据都必须以文本渲染（XSS 防护）。',
        },
        {
          selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
          message: '禁止写入 innerHTML/outerHTML（XSS 防护），请使用 textContent 或 React。',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: '禁止 insertAdjacentHTML（XSS 防护）。',
        },
        {
          selector: "CallExpression[callee.name='eval'], NewExpression[callee.name='Function']",
          message: '禁止动态执行代码（CSP 也会拦截）。',
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: ALLOWED_NUMBERS,
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          detectObjects: false,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['src/**/*.tsx'],
    ...jsxA11y.flatConfigs.strict,
  },
  // —— 分层依赖 ——
  {
    files: ['src/design/**'],
    rules: layer([
      [
        'react',
        'react-*',
        '**/glass',
        '**/glass/**',
        '**/ui/**',
        '**/i18n/**',
        ...TRANSPORT,
        ...UPPER_LAYERS,
      ],
      'design 层只能是纯数据与纯函数。',
    ]),
  },
  {
    files: ['src/glass/**'],
    rules: layer([
      ['react', 'react-*', '**/ui/**', '**/i18n/**', '**/shared/**', ...TRANSPORT, ...UPPER_LAYERS],
      'glass 层是框架无关的渲染引擎，只能依赖 design 层；React 绑定位于 src/ui/Glass。',
    ]),
  },
  {
    files: ['src/motion/**'],
    rules: layer([
      [
        'react',
        'react-*',
        '**/glass',
        '**/glass/**',
        '**/ui/**',
        '**/i18n/**',
        '**/shared/**',
        ...TRANSPORT,
        ...UPPER_LAYERS,
      ],
      'motion 层是框架无关的动效核心，只能依赖 design 层；React 绑定位于 src/ui/motion。',
    ]),
  },
  {
    files: ['src/domain/**'],
    rules: layer([
      [
        'react',
        'react-*',
        '**/design',
        '**/design/**',
        '**/glass',
        '**/glass/**',
        '**/motion',
        '**/motion/**',
        '**/ui',
        '**/ui/**',
        '**/i18n',
        '**/i18n/**',
        '**/storage',
        '**/storage/**',
        ...TRANSPORT,
        ...UPPER_LAYERS,
      ],
      'domain 层是纯业务规则（不依赖 React、DOM 与存储），只能使用 src/shared 中的小工具。',
    ]),
  },
  {
    files: ['src/storage/**'],
    rules: layer(
      [
        [
          'react',
          'react-*',
          '**/design',
          '**/design/**',
          '**/glass',
          '**/glass/**',
          '**/motion',
          '**/motion/**',
          '**/ui',
          '**/ui/**',
          '**/i18n',
          '**/i18n/**',
          ...TRANSPORT,
          ...UPPER_LAYERS,
        ],
        'storage 层只负责持久化，只能依赖 domain 与 shared；界面提示由 features 层根据事件给出。',
      ],
      [['**/domain/**'], '只能从 src/domain 入口导入领域层。'],
    ),
  },
  {
    files: ['src/sync/**'],
    rules: layer(
      [
        [
          'react',
          'react-*',
          '**/design',
          '**/design/**',
          '**/glass',
          '**/glass/**',
          '**/motion',
          '**/motion/**',
          '**/ui',
          '**/ui/**',
          '**/i18n',
          '**/i18n/**',
          '**/storage',
          '**/storage/**',
          ...UPPER_LAYERS,
        ],
        'sync 层是框架无关的传输层（信令、直连与会话），只能依赖 domain 与 shared；写入词库由 features 层完成。',
      ],
      [['**/domain/**'], '只能从 src/domain 入口导入领域层。'],
    ),
  },
  {
    files: ['src/ui/**', 'src/i18n/**', 'src/shared/**'],
    rules: layer(
      [
        [...UPPER_LAYERS, ...TRANSPORT, '**/domain', '**/domain/**', '**/storage', '**/storage/**'],
        '组件层不得依赖页面、业务与存储层。',
      ],
      [
        ['**/glass/**'],
        '只能从 src/glass 入口导入：WebGL 引擎必须经由 loadGlassEngine() 动态加载。',
      ],
      [['../motion/**', '../../motion/**'], '只能从 src/motion 入口导入动效核心。'],
    ),
  },
  {
    files: ['src/app/**', 'src/gallery/**', 'src/features/**'],
    rules: layer(
      [['**/ui/**'], '页面与业务层只能从 src/ui 入口导入组件，内部目录结构可自由调整。'],
      [['**/glass', '**/glass/**'], '玻璃效果通过 src/ui 入口的 LiquidGlass / GlassGroup 使用。'],
      [['**/motion/**'], '只能从 src/motion 入口导入动效核心。'],
      [
        ['**/domain/**', '**/storage/**', '**/sync/**'],
        '只能从 src/domain、src/storage 与 src/sync 的入口导入。',
      ],
    ),
  },
  // Token 定义本身就是“数字的来源”；测试与配置中的数字是用例数据
  {
    files: [
      'src/design/tokens/**',
      '**/*.test.{ts,tsx}',
      'tests/**',
      '*.config.{ts,js}',
      'scripts/**',
    ],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },
  {
    files: ['scripts/**', '*.config.{ts,js}', 'tests/**'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
