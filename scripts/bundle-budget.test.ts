import { describe, expect, it } from 'vitest';
import { BUDGETS, buildReport, evaluateBudgets, initialAssetNames } from './bundle-budget.ts';

const KB = 1024;
const HTML = `
<script type="module" crossorigin src="/assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/assets/library-BBB.js">
<link rel="stylesheet" crossorigin href="./assets/index-CCC.css">
<link rel="icon" href="/favicon.svg">
`;

describe('initialAssetNames', () => {
  it('取出入口脚本、预加载模块与样式表，忽略其他链接', () => {
    expect(initialAssetNames(HTML)).toEqual(['index-AAA.js', 'library-BBB.js', 'index-CCC.css']);
  });

  it('支持相对路径与重复引用', () => {
    const html = '<script src="./assets/a.js"></script><link href="assets/a.js">';
    expect(initialAssetNames(html)).toEqual(['a.js']);
  });
});

describe('buildReport', () => {
  const assets = {
    'index-AAA.js': 60 * KB,
    'library-BBB.js': 100 * KB,
    'index-CCC.css': 5 * KB,
    'zh-CN-DDD.js': 11 * KB,
    'ja-EEE.js': 12 * KB,
    'jsQR-FFF.js': 47 * KB,
    'SyncSheet-GGG.js': 18 * KB,
  };

  it('按首屏、语言文案、按需块归类', () => {
    const report = buildReport(HTML, assets);
    expect(report.initialScriptBytes).toBe(160 * KB);
    expect(report.initialStyleBytes).toBe(5 * KB);
    expect(report.largestLocaleBytes).toBe(12 * KB);
    expect(Object.keys(report.lazyChunks).sort()).toEqual(['SyncSheet-GGG.js', 'jsQR-FFF.js']);
  });

  it('预算内没有失败项', () => {
    expect(evaluateBudgets(buildReport(HTML, assets))).toEqual([]);
  });

  it('首屏脚本含最大语言文案，超出预算时报告', () => {
    const heavy = { ...assets, 'library-BBB.js': (BUDGETS.initialScriptKb - 10) * KB };
    const failures = evaluateBudgets(buildReport(HTML, heavy));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('首屏脚本');
  });

  it('按需块、首屏样式超出预算都会报告', () => {
    const failures = evaluateBudgets(
      buildReport(HTML, {
        ...assets,
        'index-CCC.css': (BUDGETS.initialStyleKb + 1) * KB,
        'jsQR-FFF.js': (BUDGETS.lazyChunkKb + 1) * KB,
      }),
    );
    expect(failures.map((failure) => failure.split('：')[0])).toEqual([
      '首屏样式',
      '按需块 jsQR-FFF.js',
    ]);
  });
});
