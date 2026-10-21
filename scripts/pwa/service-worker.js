/* global CONFIG */
/**
 * 离线缓存（Service Worker）。构建时由 scripts/vite-plugin-pwa.ts 在文件前面注入 CONFIG：
 *   { cachePrefix, version, precache: [相对站点根目录的文件路径…] }
 *
 * - 安装时把预缓存清单里的文件全部下载到以版本命名的缓存；任何一个失败则本次安装作废，继续使用旧版本。
 * - 新版本安装后进入等待，由页面在用户确认“刷新”时发来 SKIP_WAITING 才接管，不会在使用中途换掉代码。
 * - 激活时删除旧版本的缓存。
 * - 页面导航一律返回缓存的 index.html（单页应用，路由在 # 之后）。
 * - 其他同源 GET 请求：缓存命中直接返回；未命中（如按需下载的字体子集）走网络，并缓存 assets/ 下的响应。
 */
const CACHE_NAME = `${CONFIG.cachePrefix}${CONFIG.version}`;
const SKIP_WAITING_MESSAGE = 'SKIP_WAITING';

function inScope(path) {
  return new URL(path, self.registration.scope).href;
}

const SHELL_URL = inScope('index.html');
const RUNTIME_CACHE_PREFIX = inScope('assets/');

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  // reload：绕过浏览器 HTTP 缓存，确保缓存里的是服务器上的最新文件
  await cache.addAll(
    CONFIG.precache.map((path) => new Request(inScope(path), { cache: 'reload' })),
  );
}

async function removeOldCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CONFIG.cachePrefix) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)),
  );
}

// 缓存的文件完全由地址决定。忽略 Vary：有些服务器会给静态文件加 `Vary: Origin`，
// 而模块脚本等 CORS 模式请求带有 Origin 头、预缓存时发出的请求没有，按 Vary 比较会导致全部未命中。
const MATCH_OPTIONS = { ignoreVary: true };

async function respondToNavigation(request) {
  const shell = await caches.match(SHELL_URL, { ...MATCH_OPTIONS, cacheName: CACHE_NAME });
  return shell ?? fetch(request);
}

async function respondToAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, MATCH_OPTIONS);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic' && request.url.startsWith(RUNTIME_CACHE_PREFIX)) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(removeOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === SKIP_WAITING_MESSAGE) void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    request.mode === 'navigate' ? respondToNavigation(request) : respondToAsset(request),
  );
});
