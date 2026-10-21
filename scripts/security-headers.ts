import { MQTT_BROKER_URL } from '../src/sync/constants.ts';

/**
 * 内容安全策略（CSP）与相关安全响应头，是 meta 标签、`_headers` 文件与预览服务器的唯一来源。
 *
 * 网络连接只允许本站与设备同步的信令服务器（MQTT over WebSocket）；
 * 点对点直连（WebRTC）不受 connect-src 约束，词库数据也不经过信令服务器。
 * 相机画面通过 video.srcObject 播放，不需要额外放开 media-src。
 */
const BASE_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  // React 的 style 属性与 CSS 变量需要内联样式
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${new URL(MQTT_BROKER_URL).origin}`,
  "media-src 'self' blob:",
  // Service Worker（离线缓存）与 Web App Manifest（安装到主屏幕）
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
] as const;

/** 以下指令不能通过 <meta> 下发（浏览器会忽略并在控制台报错），只能放在响应头里 */
const HEADER_ONLY_DIRECTIVES = ["frame-ancestors 'none'"] as const;

export function metaPolicy(): string {
  return BASE_DIRECTIVES.join('; ');
}

export function headerPolicy(): string {
  return [...BASE_DIRECTIVES, ...HEADER_ONLY_DIRECTIVES].join('; ');
}

/** 摄像头只允许本站使用（扫码配对）；其余设备能力一律关闭 */
const PERMISSIONS_POLICY = 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()';

export function securityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': headerPolicy(),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': PERMISSIONS_POLICY,
  };
}

const ONE_YEAR_SECONDS = 31_536_000;

type HeaderRule = readonly [pattern: string, headers: Record<string, string>];

/**
 * 按路径给出的响应头。`*` 结尾表示前缀匹配；一个路径命中多条规则时合并，后面的覆盖前面的
 * （与 Netlify / Cloudflare Pages 的 `_headers` 语义一致）。
 * 带哈希的文件永久缓存；入口、Service Worker 与 manifest 每次校验，保证更新及时生效。
 */
const RULES: readonly HeaderRule[] = [
  ['/*', securityHeaders()],
  ['/assets/*', { 'Cache-Control': `public, max-age=${String(ONE_YEAR_SECONDS)}, immutable` }],
  ['/icons/*', { 'Cache-Control': 'public, max-age=86400' }],
  ['/', { 'Cache-Control': 'no-cache' }],
  ['/index.html', { 'Cache-Control': 'no-cache' }],
  ['/sw.js', { 'Cache-Control': 'no-cache' }],
  [
    '/manifest.webmanifest',
    { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' },
  ],
];

function matches(pattern: string, path: string): boolean {
  return pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path;
}

export function headersForPath(path: string): Record<string, string> {
  return Object.assign(
    {},
    ...RULES.filter(([pattern]) => matches(pattern, path)).map(([, headers]) => headers),
  ) as Record<string, string>;
}

function renderBlock([pattern, headers]: HeaderRule): string {
  const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`);
  return [pattern, ...lines].join('\n');
}

/**
 * Netlify / Cloudflare Pages 的 `_headers` 文件。
 * 其他服务器（nginx、Apache、Caddy 等）按同样的名称与值配置响应头即可。
 */
export function renderHeadersFile(): string {
  return `${RULES.map(renderBlock).join('\n\n')}\n`;
}
