import { createHash } from 'node:crypto';

/** 只预缓存这些类型：构建时还会输出 `_headers` 之类给服务器看的文件，它们不能被浏览器当作页面资源下载 */
const PRECACHEABLE = /\.(?:js|css|html|woff2|png|svg|webmanifest)$/;
/** 很少用到的字体子集（西里尔、希腊、越南文）不预缓存，真正用到时再下载并缓存 */
const OPTIONAL_FILES = /inter-(?:cyrillic|greek|vietnamese)[\w-]*\.woff2$/;
const VERSION_LENGTH = 10;

export const SERVICE_WORKER_FILE = 'sw.js';
export const CACHE_PREFIX = 'gvt-precache-';

/** 预缓存清单：页面运行需要的构建产物与公共文件，除去 Service Worker 自身和可选字体 */
export function precacheList(fileNames: readonly string[]): string[] {
  return fileNames
    .filter(
      (name) =>
        name !== SERVICE_WORKER_FILE && PRECACHEABLE.test(name) && !OPTIONAL_FILES.test(name),
    )
    .sort();
}

export interface FileContent {
  readonly fileName: string;
  readonly content: Uint8Array | string;
}

/** 缓存版本：由所有文件的名称与内容决定，任何文件变化都会得到新的版本号 */
export function cacheVersion(files: readonly FileContent[]): string {
  const hash = createHash('sha256');
  for (const { fileName, content } of [...files].sort((a, b) =>
    a.fileName.localeCompare(b.fileName),
  )) {
    hash.update(fileName).update('\0').update(content).update('\0');
  }
  return hash.digest('hex').slice(0, VERSION_LENGTH);
}

export interface ServiceWorkerConfig {
  readonly cachePrefix: string;
  readonly version: string;
  readonly precache: readonly string[];
}

/** 在 Service Worker 源码前面注入配置 */
export function renderServiceWorker(source: string, config: ServiceWorkerConfig): string {
  return `const CONFIG = ${JSON.stringify(config)};\n${source}`;
}
