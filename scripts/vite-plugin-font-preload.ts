import type { Plugin } from 'vite';

/** 默认拉丁字体提前下载，避免英文 / 德文首屏出现“文字渲染后才请求字体”的 LCP 瀑布。 */
export function fontPreloadPlugin(): Plugin {
  return {
    name: 'font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const font = Object.values(context.bundle ?? {}).find((item) =>
          /^assets\/inter-latin-wght-normal-[\w-]+\.woff2$/u.test(item.fileName),
        );
        if (font === undefined) throw new Error('缺少默认拉丁字体');
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
              href: `./${font.fileName}`,
            },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}
