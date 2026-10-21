import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { SUPPORTED_LOCALES } from '../src/i18n/locales.ts';
import { renderLocalePreload } from './locale-preload.ts';

/**
 * 极小的同源外部脚本与主包并行下载，先请求当前语言文案，消除“主包执行后才下载文案”的瀑布。
 * 不阻塞 HTML 解析，不下载其他语言，也不放宽 script-src 'self'。
 */
export function localePreloadPlugin(): Plugin {
  let emitted: { readonly fileName: string; readonly source: string } | null = null;
  return {
    name: 'locale-preload',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const files: Record<string, string> = {};
        for (const locale of SUPPORTED_LOCALES) {
          const suffix = `/src/i18n/messages/${locale}.ts`;
          const chunk = Object.values(context.bundle ?? {}).find(
            (item) =>
              item.type === 'chunk' && item.facadeModuleId?.replaceAll('\\', '/').endsWith(suffix),
          );
          if (chunk === undefined) throw new Error(`缺少语言文案块：${locale}`);
          files[locale] = `./${chunk.fileName}`;
        }
        const source = renderLocalePreload(files);
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
        const fileName = `assets/locale-preload-${hash}.js`;
        emitted = { fileName, source };
        return [
          {
            tag: 'script',
            attrs: { src: `./${fileName}`, async: true },
            injectTo: 'head',
          },
        ];
      },
    },
    generateBundle() {
      if (emitted === null) throw new Error('缺少首屏语言预加载脚本');
      this.emitFile({ type: 'asset', ...emitted });
    },
  };
}
