import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { palette } from '../../src/design/tokens/color.ts';
import { zhCN } from '../../src/i18n/messages/zh-CN.ts';
import { ALL_ICON_FILES, APPLE_TOUCH_ICON, createManifest, MANIFEST_ICONS } from './manifest.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const INFO = {
  name: '名称',
  shortName: '短名',
  description: '描述',
  lang: 'zh-CN',
  themeColor: '#112233',
  backgroundColor: '#445566',
} as const;

describe('createManifest', () => {
  const manifest = createManifest(INFO);

  it('以独立窗口打开，所有地址都是相对路径', () => {
    expect(manifest.display).toBe('standalone');
    for (const address of [manifest.id, manifest.start_url, manifest.scope]) {
      expect(address.startsWith('./')).toBe(true);
    }
    for (const icon of manifest.icons) expect(icon.src.startsWith('/')).toBe(false);
  });

  it('带入名称、说明与颜色', () => {
    expect(manifest).toMatchObject({
      name: '名称',
      short_name: '短名',
      description: '描述',
      lang: 'zh-CN',
      theme_color: '#112233',
      background_color: '#445566',
    });
  });

  it('满足可安装条件：有 192 与 512 的常规图标，并提供可遮罩图标', () => {
    const sizes = manifest.icons.filter((icon) => icon.purpose === 'any').map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.every((icon) => icon.src.endsWith('.png'))).toBe(true);
  });

  it('可遮罩图标与 iOS 图标铺满画布，常规图标是圆角', () => {
    for (const icon of MANIFEST_ICONS) {
      expect(icon.shape).toBe(icon.purpose === 'maskable' ? 'full-bleed' : 'rounded');
    }
    expect(APPLE_TOUCH_ICON.shape).toBe('full-bleed');
    expect(ALL_ICON_FILES).toHaveLength(MANIFEST_ICONS.length + 1);
  });
});

describe('index.html 与设计数据保持一致', () => {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

  it('主题色等于壁纸底色', () => {
    expect(html).toContain(`<meta name="theme-color" content="${palette.wallpaper.base}" />`);
  });

  it('标题与说明等于简体中文文案（默认语言）', () => {
    expect(html).toContain(`<title>${zhCN.meta.appName}</title>`);
    expect(html).toContain(`<meta name="description" content="${zhCN.meta.appDescription}" />`);
  });
});
