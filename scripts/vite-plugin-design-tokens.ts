import type { Plugin } from 'vite';
import { buildTokenCss } from '../src/design/build/css.ts';

const VIRTUAL_ID = 'virtual:design-tokens.css';
/** `\0` 前缀是 Rollup 约定：告诉其他插件这是虚拟模块，不要尝试读取磁盘。 */
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * 把 TS Token 编译成 CSS 变量，以虚拟模块提供给应用。
 * Token 文件属于 vite.config 的依赖，修改后开发服务器会自动重启并生效。
 */
export function designTokensPlugin(): Plugin {
  return {
    name: 'design-tokens',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      return id === RESOLVED_ID ? buildTokenCss() : undefined;
    },
  };
}
