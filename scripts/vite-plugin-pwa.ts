import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { renderIconPng } from './pwa/icon.ts';
import {
  ALL_ICON_FILES,
  APPLE_TOUCH_ICON,
  createManifest,
  type ManifestInfo,
} from './pwa/manifest.ts';
import {
  CACHE_PREFIX,
  cacheVersion,
  precacheList,
  renderServiceWorker,
  SERVICE_WORKER_FILE,
  type FileContent,
} from './pwa/precache.ts';

const MANIFEST_FILE = 'manifest.webmanifest';
const SHELL_FILE = 'index.html';
const SERVICE_WORKER_SOURCE = new URL('./pwa/service-worker.js', import.meta.url);

/** public/ 下的文件会被原样复制到产物根目录，但不在 bundle 里，需要自己列出 */
function readPublicFiles(directory: string, root = directory): FileContent[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return readPublicFiles(path, root);
    return [{ fileName: relative(root, path).split(sep).join('/'), content: readFileSync(path) }];
  });
}

/**
 * 渐进式应用（PWA）：
 * - 输出 Web App Manifest 与各尺寸图标（构建时由几何图案渲染，仓库里不存二进制文件）；
 * - 在 index.html 声明 manifest、iOS 主屏幕图标与全屏显示；
 * - 输出预缓存全部页面资源的 Service Worker，离线也能打开。
 */
export function pwaPlugin(info: ManifestInfo): Plugin {
  let publicDirectory: string | false = false;
  return {
    name: 'pwa',
    apply: 'build',
    // 必须在 Vite 输出 index.html 之后执行，预缓存清单才包含它
    enforce: 'post',
    configResolved(config) {
      publicDirectory = config.publicDir;
    },
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: MANIFEST_FILE }, injectTo: 'head' },
        {
          tag: 'link',
          attrs: { rel: 'apple-touch-icon', href: APPLE_TOUCH_ICON.fileName },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'mobile-web-app-capable', content: 'yes' },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'apple-mobile-web-app-title', content: info.shortName },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
          injectTo: 'head',
        },
      ];
    },
    generateBundle(_options, bundle) {
      // 先取构建产物，再输出自己的文件（输出后它们也会出现在 bundle 里，避免重复计入）
      const bundled = Object.values(bundle).map((item) => ({
        fileName: item.fileName,
        content: item.type === 'chunk' ? item.code : item.source,
      }));
      const emitted: FileContent[] = [
        { fileName: MANIFEST_FILE, content: JSON.stringify(createManifest(info), null, 2) },
        ...ALL_ICON_FILES.map(({ fileName, size, shape }) => ({
          fileName,
          content: renderIconPng(size, shape),
        })),
      ];
      for (const { fileName, content } of emitted) {
        this.emitFile({ type: 'asset', fileName, source: content });
      }

      const publicFiles = publicDirectory === false ? [] : readPublicFiles(publicDirectory);
      const files = [...bundled, ...emitted, ...publicFiles];
      const precache = precacheList(files.map((file) => file.fileName));
      if (!precache.includes(SHELL_FILE)) throw new Error(`预缓存清单缺少 ${SHELL_FILE}`);

      this.emitFile({
        type: 'asset',
        fileName: SERVICE_WORKER_FILE,
        source: renderServiceWorker(readFileSync(SERVICE_WORKER_SOURCE, 'utf8'), {
          cachePrefix: CACHE_PREFIX,
          version: cacheVersion(files),
          precache,
        }),
      });
    },
  };
}
