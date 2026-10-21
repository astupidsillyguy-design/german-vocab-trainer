import { gzipSync } from 'node:zlib';

const BYTES_PER_KB = 1024;

/**
 * 体积预算（gzip 后，单位 KB）。超出时 `npm run check:bundle` 失败，
 * 新增依赖或把模块塞进首屏前要先确认是否值得。
 */
export const BUDGETS = {
  /** 首屏必需的脚本：入口及其静态依赖，加上体积最大的一种语言文案 */
  initialScriptKb: 210,
  /** 首屏必需的样式 */
  initialStyleKb: 20,
  /** 任何一个按需加载的块（扫码解码库 jsQR 是其中最大的） */
  lazyChunkKb: 60,
} as const;

/** 语言文案块的文件名前缀（与 src/i18n/locales.ts 的语言代码一致） */
const LOCALE_CHUNK_PATTERN = /^(zh-CN|en|de|ja)-[\w-]+\.js$/;

/** 文件名（相对 assets 目录）→ gzip 字节数 */
export type AssetSizes = Readonly<Record<string, number>>;

export interface BundleReport {
  readonly initialScriptBytes: number;
  readonly initialStyleBytes: number;
  readonly largestLocaleBytes: number;
  readonly lazyChunks: AssetSizes;
}

const ASSET_REFERENCE = /(?:src|href)="[^"]*?assets\/([^"]+)"/g;

/** 从 index.html 取出首屏会下载的资源：入口脚本、预加载的模块与样式表 */
export function initialAssetNames(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(ASSET_REFERENCE)) {
    const name = match[1];
    if (name !== undefined && /\.(js|css)$/.test(name)) names.add(name);
  }
  return [...names];
}

export function gzipSize(content: Uint8Array | string): number {
  return gzipSync(content, { level: 9 }).length;
}

function sum(sizes: readonly number[]): number {
  return sizes.reduce((total, size) => total + size, 0);
}

/** 按“首屏 / 语言文案 / 按需块”归类并汇总（输入为每个产物文件的 gzip 体积） */
export function buildReport(html: string, assets: AssetSizes): BundleReport {
  const initial = new Set(initialAssetNames(html));
  const lazyChunks: Record<string, number> = {};
  const localeSizes: number[] = [];
  for (const [name, bytes] of Object.entries(assets)) {
    if (!name.endsWith('.js') || initial.has(name)) continue;
    if (LOCALE_CHUNK_PATTERN.test(name)) localeSizes.push(bytes);
    else lazyChunks[name] = bytes;
  }
  const sizeOf = (suffix: string): number =>
    sum([...initial].filter((name) => name.endsWith(suffix)).map((name) => assets[name] ?? 0));
  return {
    initialScriptBytes: sizeOf('.js'),
    initialStyleBytes: sizeOf('.css'),
    largestLocaleBytes: Math.max(0, ...localeSizes),
    lazyChunks,
  };
}

export function evaluateBudgets(report: BundleReport): string[] {
  const failures: string[] = [];
  const check = (label: string, bytes: number, budgetKb: number): void => {
    if (bytes > budgetKb * BYTES_PER_KB) {
      failures.push(
        `${label}：${(bytes / BYTES_PER_KB).toFixed(1)} KB，超出预算 ${String(budgetKb)} KB`,
      );
    }
  };
  check(
    '首屏脚本（含最大语言文案）',
    report.initialScriptBytes + report.largestLocaleBytes,
    BUDGETS.initialScriptKb,
  );
  check('首屏样式', report.initialStyleBytes, BUDGETS.initialStyleKb);
  for (const [name, bytes] of Object.entries(report.lazyChunks)) {
    check(`按需块 ${name}`, bytes, BUDGETS.lazyChunkKb);
  }
  return failures;
}

export function formatKb(bytes: number): string {
  return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
}
