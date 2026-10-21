import type { IconShape } from './icon.ts';

export interface IconSpec {
  /** 相对站点根目录的输出路径 */
  readonly fileName: string;
  readonly size: number;
  readonly shape: IconShape;
  /** `maskable` 图标铺满画布，由系统裁成圆形、圆角方形等形状 */
  readonly purpose: 'any' | 'maskable';
}

export const MANIFEST_ICONS: readonly IconSpec[] = [
  { fileName: 'icons/icon-192.png', size: 192, shape: 'rounded', purpose: 'any' },
  { fileName: 'icons/icon-512.png', size: 512, shape: 'rounded', purpose: 'any' },
  { fileName: 'icons/icon-maskable-512.png', size: 512, shape: 'full-bleed', purpose: 'maskable' },
];

/** iOS 不读 manifest 图标，需要在 <head> 里单独声明；它自己裁圆角，所以铺满画布 */
export const APPLE_TOUCH_ICON: Omit<IconSpec, 'purpose'> = {
  fileName: 'icons/apple-touch-icon.png',
  size: 180,
  shape: 'full-bleed',
};

export const ALL_ICON_FILES: readonly Omit<IconSpec, 'purpose'>[] = [
  ...MANIFEST_ICONS,
  APPLE_TOUCH_ICON,
];

export interface ManifestInfo {
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly lang: string;
  readonly themeColor: string;
  readonly backgroundColor: string;
}

export interface WebManifest {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly lang: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: 'standalone';
  readonly background_color: string;
  readonly theme_color: string;
  readonly categories: readonly string[];
  readonly icons: readonly {
    readonly src: string;
    readonly sizes: string;
    readonly type: 'image/png';
    readonly purpose: 'any' | 'maskable';
  }[];
}

/**
 * Web App Manifest。所有地址都是相对路径（`./`），
 * 应用部署在站点根目录或任意子目录下都能安装。
 */
export function createManifest(info: ManifestInfo): WebManifest {
  return {
    id: './',
    name: info.name,
    short_name: info.shortName,
    description: info.description,
    lang: info.lang,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: info.backgroundColor,
    theme_color: info.themeColor,
    categories: ['education'],
    icons: MANIFEST_ICONS.map(({ fileName, size, purpose }) => ({
      src: fileName,
      sizes: `${String(size)}x${String(size)}`,
      type: 'image/png',
      purpose,
    })),
  };
}
