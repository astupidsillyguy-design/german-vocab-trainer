/**
 * 为每个 `*.module.css` 生成同名类型声明 `*.module.d.css.ts`（TS allowArbitraryExtensions）。
 *
 * 作用：在 noUncheckedIndexedAccess 下，`styles.button` 的类型是精确的 string，
 * 并且引用不存在的类名会直接成为类型错误（防止 CSS 改名后 TSX 静默失效）。
 *
 * 用法：
 *   tsx scripts/css-module-types.ts          生成/更新
 *   tsx scripts/css-module-types.ts --check  只检查是否过期（CI 使用）
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_SUFFIX = '.module.css';
const DECLARATION_SUFFIX = '.module.d.css.ts';

const COMMENT = /\/\*[\s\S]*?\*\//g;
/** 规则前导（选择器 / at-rule 条件），即 `{` 之前、上一个 `{` `}` `;` 之后的文本 */
const PRELUDE = /([^{};]+)\{/g;
/** 类选择器：以字母或下划线开头，排除小数（如 1.5dppx） */
const CLASS_SELECTOR = /\.(-?[A-Za-z_][\w-]*)/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function extractClassNames(css: string): string[] {
  const names = new Set<string>();
  for (const [, prelude = ''] of css.replace(COMMENT, '').matchAll(PRELUDE)) {
    if (prelude.trimStart().startsWith('@')) continue;
    for (const [, name = ''] of prelude.matchAll(CLASS_SELECTOR)) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function renderDeclaration(classNames: readonly string[]): string {
  const lines = classNames.map((name) => {
    const key = IDENTIFIER.test(name) ? name : `'${name}'`;
    return `  readonly ${key}: string;`;
  });
  return [
    '// 由 scripts/css-module-types.ts 自动生成，请勿手动修改。',
    'declare const styles: {',
    ...lines,
    '};',
    'export default styles;',
    '',
  ].join('\n');
}

function findModules(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return findModules(path);
    return entry.endsWith(MODULE_SUFFIX) ? [path] : [];
  });
}

export function declarationPathFor(cssPath: string): string {
  return cssPath.slice(0, -MODULE_SUFFIX.length) + DECLARATION_SUFFIX;
}

/** 返回过期（或已更新）的声明文件列表。 */
export function syncCssModuleTypes(
  sourceRoot: string,
  { check }: { readonly check: boolean },
): string[] {
  const stale: string[] = [];
  for (const cssPath of findModules(sourceRoot)) {
    const target = declarationPathFor(cssPath);
    const next = renderDeclaration(extractClassNames(readFileSync(cssPath, 'utf8')));
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === next) continue;
    stale.push(target);
    if (!check) writeFileSync(target, next);
  }
  return stale;
}

const isEntryPoint =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  const root = join(fileURLToPath(new URL('..', import.meta.url)), 'src');
  const check = process.argv.includes('--check');
  const stale = syncCssModuleTypes(root, { check });
  const list = stale.map((path) => `  ${relative(process.cwd(), path)}`).join('\n');
  if (check && stale.length > 0) {
    console.error(`CSS Module 类型声明已过期，请运行 npm run css-types：\n${list}`);
    process.exit(1);
  }
  if (!check && stale.length > 0)
    console.warn(`已更新 ${String(stale.length)} 个 CSS Module 类型声明：\n${list}`);
}
