/**
 * 检查生产构建的体积预算（先运行 `npm run build`）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import {
  BUDGETS,
  buildReport,
  evaluateBudgets,
  formatKb,
  gzipSize,
  type AssetSizes,
} from './bundle-budget.ts';

const DIST = new URL('../dist/', import.meta.url);
const ASSETS = new URL('assets/', DIST);

function readAssetSizes(): AssetSizes {
  const sizes: Record<string, number> = {};
  for (const name of readdirSync(ASSETS)) {
    if (/\.(js|css)$/.test(name)) sizes[name] = gzipSize(readFileSync(new URL(name, ASSETS)));
  }
  return sizes;
}

const html = readFileSync(new URL('index.html', DIST), 'utf8');
const report = buildReport(html, readAssetSizes());
const failures = evaluateBudgets(report);

console.log(
  [
    `首屏脚本  ${formatKb(report.initialScriptBytes)} + 语言文案 ${formatKb(report.largestLocaleBytes)}（预算 ${String(BUDGETS.initialScriptKb)} KB）`,
    `首屏样式  ${formatKb(report.initialStyleBytes)}（预算 ${String(BUDGETS.initialStyleKb)} KB）`,
    `按需块    ${String(Object.keys(report.lazyChunks).length)} 个，最大 ${formatKb(Math.max(0, ...Object.values(report.lazyChunks)))}（预算 ${String(BUDGETS.lazyChunkKb)} KB）`,
  ].join('\n'),
);

if (failures.length > 0) {
  console.error(`\n体积超出预算：\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exitCode = 1;
}
