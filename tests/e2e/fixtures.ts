import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';

/** WCAG 2.2 A/AA 全部规则 */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** 尺寸等级的代表宽度（与 src/design/tokens/breakpoint.ts 一致） */
export const VIEWPORTS = {
  compact: { width: 390, height: 844 },
  regular: { width: 820, height: 1180 },
  expanded: { width: 1280, height: 800 },
} as const;

interface Fixtures {
  /** 自动收集控制台错误与未捕获异常；测试结束时断言为空 */
  readonly consoleErrors: string[];
}

export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      await use(errors);
      expect(errors, '页面不应有控制台错误').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
  expect(summary, '不应有 WCAG 违规').toEqual([]);
}

/** 读取根元素上的 CSS 自定义属性（design token 的最终值） */
export async function rootToken(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
    name,
  );
}
