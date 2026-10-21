/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { securityHeaders } from './scripts/security-headers.ts';
import { cspPlugin } from './scripts/vite-plugin-csp.ts';
import { cssModuleTypesPlugin } from './scripts/vite-plugin-css-module-types.ts';
import { designTokensPlugin } from './scripts/vite-plugin-design-tokens.ts';
import { fontPreloadPlugin } from './scripts/vite-plugin-font-preload.ts';
import { localePreloadPlugin } from './scripts/vite-plugin-locale-preload.ts';
import { pwaPlugin } from './scripts/vite-plugin-pwa.ts';
import { palette } from './src/design/tokens/color.ts';
import { zhCN } from './src/i18n/messages/zh-CN.ts';

/** 版本号只在 package.json 中维护，构建时注入（设置页“关于”显示） */
const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  readonly version: string;
};

export default defineConfig({
  // 相对路径：部署在站点根目录或任意子目录下都能工作
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    designTokensPlugin(),
    cssModuleTypesPlugin(),
    cspPlugin(),
    localePreloadPlugin(),
    fontPreloadPlugin(),
    pwaPlugin({
      name: zhCN.meta.appName,
      shortName: zhCN.meta.appName,
      description: zhCN.meta.appDescription,
      lang: 'zh-CN',
      themeColor: palette.wallpaper.base,
      backgroundColor: palette.wallpaper.base,
    }),
  ],
  // 预览服务器与线上使用同一套响应头，端到端测试才能验证真实的 CSP
  preview: { headers: securityHeaders() },
  build: {
    target: 'es2022',
    // 决定 CSS 前缀与语法降级（例如为 Safari 补 -webkit-backdrop-filter）
    cssTarget: ['chrome111', 'edge111', 'firefox115', 'safari16.4'],
    rolldownOptions: {
      output: {
        // 合并共享依赖，避免 React Aria 被拆成十几个首屏小请求（HTTP/1.1 下尤其明显）
        codeSplitting: { groups: [{ name: 'shared', minShareCount: 2 }] },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    restoreMocks: true,
  },
});
