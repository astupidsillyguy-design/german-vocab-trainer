/**
 * 旧数据导出工具（F-005）。新版通常与原版不在同一个网址下，读不到原版的 localStorage，
 * 因此提供两种办法把原版的数据带过来：
 * - 导出工具：一个独立的 HTML 文件，用打开原版的同一个浏览器打开，把全部 DE_QUIZ_ 键原样保存为 JSON；
 * - 控制台代码：在原版页面的开发者工具中执行（例如 Firefox 中每个本地文件的存储相互独立，导出工具读不到）。
 *
 * 两者执行同一段导出逻辑（字符串形式，因为要在另一个页面中运行，不能引用本应用的代码）。
 * 文案只通过 textContent 写入页面；嵌入脚本的 JSON 把 `<` 转义，文案中出现 `</script>` 也无法跳出脚本。
 */
import {
  LEGACY_EXPORT_KIND,
  LEGACY_EXPORT_VERSION,
  LEGACY_KEY_PREFIX,
  LEGACY_KEYS,
} from '../../domain';
import { radius, semanticColors, space, textFontStack } from '../../design/tokens';
import type { Locale } from '../../i18n';

export const LEGACY_EXPORTER_FILE_NAME = 'german-vocab-trainer-legacy-exporter.html';
export const LEGACY_EXPORT_FILE_NAME = 'german-vocab-trainer-legacy-data.json';
/** 下载开始后释放 Blob 地址的等待时间 */
const REVOKE_DELAY_MS = 60_000;

/** 导出工具页面的文案；done 中的 {keys}、{pool}、{archive} 由页面脚本替换为数量 */
export interface LegacyExporterText {
  readonly title: string;
  readonly intro: string;
  readonly button: string;
  readonly done: string;
  readonly empty: string;
  readonly unavailable: string;
}

const EXPORT_CONFIG = {
  prefix: LEGACY_KEY_PREFIX,
  kind: LEGACY_EXPORT_KIND,
  version: LEGACY_EXPORT_VERSION,
  fileName: LEGACY_EXPORT_FILE_NAME,
  poolKey: LEGACY_KEYS.pool,
  archiveKey: LEGACY_KEYS.archive,
  revokeDelayMs: REVOKE_DELAY_MS,
} as const;

/** 收集全部 DE_QUIZ_ 键并下载为 JSON；返回键数与待测、归档词数 */
const EXPORT_FUNCTION = `function exportLegacyData(config) {
  const keys = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null && key.startsWith(config.prefix)) keys[key] = localStorage.getItem(key);
  }
  const countOf = (key) => {
    try {
      const value = JSON.parse(keys[key] ?? '[]');
      return Array.isArray(value) ? value.length : 0;
    } catch {
      return 0;
    }
  };
  const total = Object.keys(keys).length;
  if (total > 0) {
    const payload = {
      kind: config.kind,
      version: config.version,
      exportedAt: new Date().toISOString(),
      keys,
    };
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    );
    link.download = config.fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), config.revokeDelayMs);
  }
  return { keys: total, pool: countOf(config.poolKey), archive: countOf(config.archiveKey) };
}`;

/** 可以安全放进 <script> 的 JSON */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/** 在原版页面的控制台中执行的代码 */
export function legacyConsoleSnippet(): string {
  return `(${EXPORT_FUNCTION})(${scriptJson(EXPORT_CONFIG)});`;
}

const PAGE_SCRIPT = `const byId = (id) => document.getElementById(id);
const button = byId('export');
const status = byId('status');
document.title = text.title;
byId('title').textContent = text.title;
byId('intro').textContent = text.intro;
button.textContent = text.button;
button.addEventListener('click', () => {
  let result;
  try {
    result = exportLegacyData(config);
  } catch {
    status.textContent = text.unavailable;
    return;
  }
  status.textContent =
    result.keys === 0
      ? text.empty
      : text.done
          .replace('{keys}', String(result.keys))
          .replace('{pool}', String(result.pool))
          .replace('{archive}', String(result.archive));
});`;

function pageStyle(locale: Locale): string {
  const colors = semanticColors.light;
  return `:root { color-scheme: light; font-family: ${textFontStack(locale === 'ja' ? 'ja' : 'zh')}; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: ${colors.background.grouped}; color: ${colors.label.primary}; }
main { box-sizing: border-box; max-width: 34rem; margin: ${String(space.xl)}px; padding: ${String(space.xxxl)}px; border-radius: ${String(radius.xl)}px; background: ${colors.background.groupedElevated}; }
h1 { margin: 0 0 ${String(space.md)}px; font-size: 1.5rem; }
p { line-height: 1.5; }
button { font: inherit; font-weight: 600; padding: ${String(space.md)}px ${String(space.xl)}px; border: 0; border-radius: ${String(radius.md)}px; background: ${colors.tint.base}; color: ${colors.label.onSolid}; cursor: pointer; }
button:focus-visible { outline: 3px solid ${colors.tint.text}; outline-offset: 3px; }
#status { color: ${colors.label.secondary}; }`;
}

/** 生成导出工具页面（完整的 HTML 文档） */
export function legacyExporterHtml(locale: Locale, text: LegacyExporterText): string {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title></title>
<style>
${pageStyle(locale)}
</style>
</head>
<body>
<main>
<h1 id="title"></h1>
<p id="intro"></p>
<button id="export" type="button"></button>
<p id="status" role="status"></p>
</main>
<script>
"use strict";
const config = ${scriptJson(EXPORT_CONFIG)};
const text = ${scriptJson(text)};
${EXPORT_FUNCTION}
${PAGE_SCRIPT}
</script>
</body>
</html>
`;
}
