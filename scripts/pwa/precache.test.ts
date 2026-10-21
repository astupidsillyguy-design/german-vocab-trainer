import { describe, expect, it } from 'vitest';
import { cacheVersion, precacheList, renderServiceWorker } from './precache.ts';

describe('precacheList', () => {
  it('包含页面运行需要的各类文件并排序', () => {
    expect(
      precacheList([
        'index.html',
        'assets/index-A.js',
        'assets/index-B.css',
        'assets/inter-latin-wght-normal-C.woff2',
        'icons/icon-192.png',
        'favicon.svg',
        'manifest.webmanifest',
      ]),
    ).toEqual([
      'assets/index-A.js',
      'assets/index-B.css',
      'assets/inter-latin-wght-normal-C.woff2',
      'favicon.svg',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('排除 Service Worker 自身、给服务器看的文件与很少用到的字体子集', () => {
    const list = precacheList([
      'index.html',
      'sw.js',
      '_headers',
      'assets/inter-cyrillic-wght-normal-X.woff2',
      'assets/inter-cyrillic-ext-wght-normal-X.woff2',
      'assets/inter-greek-wght-normal-X.woff2',
      'assets/inter-vietnamese-wght-normal-X.woff2',
      'assets/inter-latin-ext-wght-normal-X.woff2',
    ]);
    expect(list).toEqual(['assets/inter-latin-ext-wght-normal-X.woff2', 'index.html']);
  });
});

describe('cacheVersion', () => {
  const files = [
    { fileName: 'a.js', content: 'one' },
    { fileName: 'b.css', content: 'two' },
  ];

  it('与文件顺序无关，内容或名称变化则版本变化', () => {
    const version = cacheVersion(files);
    expect(version).toMatch(/^[0-9a-f]{10}$/);
    expect(cacheVersion([...files].reverse())).toBe(version);
    expect(cacheVersion([{ fileName: 'a.js', content: 'ONE' }, ...files.slice(1)])).not.toBe(
      version,
    );
    expect(cacheVersion([{ fileName: 'c.js', content: 'one' }, ...files.slice(1)])).not.toBe(
      version,
    );
  });

  it('文件名与内容的拼接位置不同则版本不同', () => {
    expect(cacheVersion([{ fileName: 'ab', content: 'c' }])).not.toBe(
      cacheVersion([{ fileName: 'a', content: 'bc' }]),
    );
  });
});

describe('renderServiceWorker', () => {
  it('在源码前注入 CONFIG', () => {
    const source = renderServiceWorker('run(CONFIG);', {
      cachePrefix: 'p-',
      version: 'v1',
      precache: ['index.html'],
    });
    expect(source).toBe(
      'const CONFIG = {"cachePrefix":"p-","version":"v1","precache":["index.html"]};\nrun(CONFIG);',
    );
  });
});
