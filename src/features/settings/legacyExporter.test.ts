import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LEGACY_EXPORT_KIND,
  LEGACY_EXPORT_VERSION,
  LEGACY_KEYS,
  readLegacyFile,
} from '../../domain';
import { readBlobText, stubDownloads, type DownloadStub } from '../../test/download';
import { legacyKeyMap, seedLegacyStorage } from '../../test/legacy';
import {
  LEGACY_EXPORT_FILE_NAME,
  legacyConsoleSnippet,
  legacyExporterHtml,
  type LegacyExporterText,
} from './legacyExporter';

const INJECTION = '</script><script>window.injected = true;</script>';

const TEXT: LegacyExporterText = {
  title: `导出${INJECTION}`,
  intro: '说明',
  button: '导出数据',
  done: '已导出 {keys} 项',
  empty: '没有找到',
  unavailable: '无法读取',
};

/** 像在原版页面的控制台中一样执行代码，返回它的结果（代码只能使用浏览器的全局对象） */
function runInPage(code: string): unknown {
  // 被测代码本来就是要在另一个页面中执行的字符串；测试在 Node 中运行，不受 CSP 约束
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-restricted-syntax
  const run = new Function(`"use strict"; return ${code}`) as () => unknown;
  return run();
}

describe('legacyExporterHtml', () => {
  it('生成完整的页面：语言、按钮与状态区域', () => {
    const html = legacyExporterHtml('de', TEXT);
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(page.documentElement.lang).toBe('de');
    expect(page.getElementById('export')?.getAttribute('type')).toBe('button');
    expect(page.getElementById('status')?.getAttribute('role')).toBe('status');
    expect(page.querySelector('meta[name="viewport"]')).not.toBeNull();
  });

  it('文案只作为脚本中的数据：无法跳出 <script>，也不会成为页面标记', () => {
    const html = legacyExporterHtml('zh-CN', TEXT);
    const page = new DOMParser().parseFromString(html, 'text/html');
    const scripts = page.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(html.match(/<\/script/giu)).toHaveLength(1);
    expect(scripts[0]?.textContent).toContain(JSON.stringify(TEXT.button));
    expect(scripts[0]?.textContent).toContain(String.raw`\u003c/script>`);
    expect(page.title).toBe('');
  });
});

describe('legacyConsoleSnippet', () => {
  let downloads: DownloadStub;
  beforeEach(() => {
    downloads = stubDownloads();
  });
  afterEach(() => {
    downloads.restore();
  });

  it('只收集 DE_QUIZ_ 键并下载为新版可以读取的 JSON 文件', async () => {
    seedLegacyStorage();
    localStorage.setItem('gvt.pref.locale', 'de');
    expect(runInPage(legacyConsoleSnippet())).toEqual({ keys: 4, pool: 2, archive: 1 });

    expect(downloads.downloads).toHaveLength(1);
    const [download] = downloads.downloads;
    expect(download?.filename).toBe(LEGACY_EXPORT_FILE_NAME);
    const content = await readBlobText(download?.blob ?? new Blob());
    const payload: unknown = JSON.parse(content);
    expect(payload).toMatchObject({
      kind: LEGACY_EXPORT_KIND,
      version: LEGACY_EXPORT_VERSION,
      keys: legacyKeyMap(),
    });
    expect(readLegacyFile(content).ok).toBe(true);
    expect(document.querySelector('a')).toBeNull();
  });

  it('没有旧版数据时不下载', () => {
    localStorage.setItem('gvt.pref.locale', 'de');
    expect(runInPage(legacyConsoleSnippet())).toEqual({ keys: 0, pool: 0, archive: 0 });
    expect(downloads.downloads).toHaveLength(0);
  });

  it('数据损坏时仍然原样导出，数量记为 0', () => {
    localStorage.setItem(LEGACY_KEYS.pool, '{坏');
    const result = runInPage(legacyConsoleSnippet());
    expect(result).toEqual({ keys: 1, pool: 0, archive: 0 });
    expect(downloads.downloads).toHaveLength(1);
  });
});
