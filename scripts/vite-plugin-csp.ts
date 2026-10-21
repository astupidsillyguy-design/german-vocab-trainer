import type { Plugin } from 'vite';
import { metaPolicy, renderHeadersFile } from './security-headers.ts';

const HEADERS_FILE = '_headers';

/**
 * 生产构建的安全策略：
 * - 在 index.html 注入 CSP <meta>（没有响应头可配的静态托管也生效）；
 * - 输出 `_headers`，含完整 CSP（比 meta 多 frame-ancestors）与其他安全响应头。
 * 开发模式下 Vite 需要内联脚本做热更新，因此只在 build 时生效。
 */
export function cspPlugin(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: metaPolicy() },
          injectTo: 'head-prepend',
        },
      ];
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: HEADERS_FILE, source: renderHeadersFile() });
    },
  };
}
