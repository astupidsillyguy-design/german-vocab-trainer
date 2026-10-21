import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * 在 jsdom 中运行 axe。jsdom 不做布局与绘制，因此关闭依赖渲染结果的规则
 * （颜色对比度由 tokens.test.ts 用数学方式校验，并在 Playwright 中于真实浏览器复查）。
 */
export async function expectNoAxeViolations(container: Element = document.body): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
  });
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
  );
  expect(summary).toEqual([]);
}
