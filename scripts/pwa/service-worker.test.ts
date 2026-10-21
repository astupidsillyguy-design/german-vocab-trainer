import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKIP_WAITING_MESSAGE } from '../../src/pwa/registerServiceWorker.ts';
import { renderServiceWorker } from './precache.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = readFileSync(resolve(ROOT, 'scripts/pwa/service-worker.js'), 'utf8');

const ORIGIN = 'https://app.test';
const SCOPE = `${ORIGIN}/vocab/`;
const CACHE_PREFIX = 'gvt-precache-';
const CURRENT = `${CACHE_PREFIX}v2`;
const SHELL = `${SCOPE}index.html`;
const PRECACHE = ['index.html', 'assets/app-1.js', 'assets/app-1.css'];

type Handler = (event: FakeEvent) => void;

/** 浏览器里同源请求的响应类型是 basic（Node 的构造函数默认给 default） */
function basicResponse(body: string, init?: ResponseInit): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

interface FakeEvent {
  request?: Request;
  data?: unknown;
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (response: Promise<Response>) => void;
}

/** 内存版 Cache：以地址为键 */
class FakeCache {
  readonly entries = new Map<string, Response>();
  readonly #network: (request: Request) => Promise<Response>;

  constructor(network: (request: Request) => Promise<Response>) {
    this.#network = network;
  }

  async addAll(requests: Request[]): Promise<void> {
    const responses = await Promise.all(requests.map((request) => this.#network(request)));
    responses.forEach((response, index) => {
      if (!response.ok) throw new Error(`下载失败：${requests[index]?.url ?? ''}`);
      this.entries.set(requests[index]?.url ?? '', response);
    });
  }

  put(request: Request, response: Response): Promise<void> {
    this.entries.set(request.url, response);
    return Promise.resolve();
  }

  /** 与真实 Cache 一致：忽略 Vary 时不比较请求头，否则带 Vary: Origin 的缓存无法被 CORS 模式的请求命中 */
  match(
    request: Request | string,
    options?: { ignoreVary?: boolean },
  ): Promise<Response | undefined> {
    const key = typeof request === 'string' ? request : request.url;
    const cached = this.entries.get(key);
    const varies =
      cached?.headers.get('Vary') !== null && cached?.headers.get('Vary') !== undefined;
    if (varies && options?.ignoreVary !== true) return Promise.resolve(undefined);
    return Promise.resolve(cached?.clone());
  }
}

interface Harness {
  readonly handlers: Map<string, Handler>;
  readonly caches: {
    open: (name: string) => Promise<FakeCache>;
    keys: () => Promise<string[]>;
    delete: (name: string) => Promise<boolean>;
    match: (
      url: string,
      options: { cacheName: string; ignoreVary?: boolean },
    ) => Promise<Response | undefined>;
  };
  readonly store: Map<string, FakeCache>;
  readonly fetch: ReturnType<typeof vi.fn<(request: Request) => Promise<Response>>>;
  readonly claim: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly skipWaiting: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function load(): Harness {
  const handlers = new Map<string, Handler>();
  const store = new Map<string, FakeCache>();
  const fetchMock = vi.fn<(request: Request) => Promise<Response>>(() =>
    Promise.resolve(basicResponse('network', { headers: { Vary: 'Origin' } })),
  );
  const claim = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const skipWaiting = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const caches = {
    open: (name: string) => {
      const cache = store.get(name) ?? new FakeCache((request) => fetchMock(request));
      store.set(name, cache);
      return Promise.resolve(cache);
    },
    keys: () => Promise.resolve([...store.keys()]),
    delete: (name: string) => Promise.resolve(store.delete(name)),
    match: (url: string, { cacheName, ...options }: { cacheName: string; ignoreVary?: boolean }) =>
      store.get(cacheName)?.match(url, options) ?? Promise.resolve(undefined),
  };
  const self = {
    registration: { scope: SCOPE },
    location: { origin: ORIGIN },
    clients: { claim },
    skipWaiting,
    addEventListener: (type: string, handler: Handler) => {
      handlers.set(type, handler);
    },
  };
  runInNewContext(
    renderServiceWorker(SOURCE, { cachePrefix: CACHE_PREFIX, version: 'v2', precache: PRECACHE }),
    { self, caches, fetch: fetchMock, URL, Request, Response, Promise },
  );
  return { handlers, caches, store, fetch: fetchMock, claim, skipWaiting };
}

/** 触发 install / activate，并返回传给 waitUntil 的 Promise */
function lifecycle(harness: Harness, type: 'install' | 'activate'): Promise<unknown> {
  let pending: Promise<unknown> = Promise.resolve();
  harness.handlers.get(type)?.({
    waitUntil: (promise) => {
      pending = promise;
    },
  });
  return pending;
}

/** 触发 fetch；没有调用 respondWith（交给浏览器处理）时返回 null */
function dispatchFetch(harness: Harness, request: Request): Promise<Response> | null {
  let response: Promise<Response> | null = null;
  harness.handlers.get('fetch')?.({
    request,
    respondWith: (promise) => {
      response = promise;
    },
  });
  return response;
}

function navigation(url: string): Request {
  const request = new Request(url);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
}

let harness: Harness;
beforeEach(() => {
  harness = load();
});

describe('install', () => {
  it('把清单里的文件下载到以版本命名的缓存，并绕过 HTTP 缓存', async () => {
    await lifecycle(harness, 'install');
    expect([...(harness.store.get(CURRENT)?.entries.keys() ?? [])].sort()).toEqual(
      PRECACHE.map((path) => `${SCOPE}${path}`).sort(),
    );
    for (const [request] of harness.fetch.mock.calls) expect(request.cache).toBe('reload');
  });

  it('任何一个文件下载失败，整次安装作废', async () => {
    harness.fetch.mockImplementation((request) =>
      Promise.resolve(
        request.url.endsWith('app-1.css')
          ? basicResponse('', { status: 404 })
          : basicResponse('ok'),
      ),
    );
    await expect(lifecycle(harness, 'install')).rejects.toThrow(/下载失败/);
  });
});

describe('activate', () => {
  it('删除旧版本的缓存，保留当前版本与无关的缓存，并接管页面', async () => {
    await harness.caches.open(`${CACHE_PREFIX}v1`);
    await harness.caches.open(CURRENT);
    await harness.caches.open('other-app');
    await lifecycle(harness, 'activate');
    expect(await harness.caches.keys()).toEqual([CURRENT, 'other-app']);
    expect(harness.claim).toHaveBeenCalledTimes(1);
  });
});

describe('fetch', () => {
  beforeEach(async () => {
    await lifecycle(harness, 'install');
    harness.fetch.mockClear();
  });

  it('页面导航一律返回缓存的 index.html，不访问网络', async () => {
    const cached = await harness.store.get(CURRENT)?.match(SHELL, { ignoreVary: true });
    const response = await dispatchFetch(harness, navigation(SCOPE));
    expect(await response?.text()).toBe(await cached?.text());
    await dispatchFetch(harness, navigation(`${SCOPE}index.html`));
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it('缓存里没有 index.html 时回退到网络', async () => {
    const empty = load();
    const response = await dispatchFetch(empty, navigation(SCOPE));
    expect(await response?.text()).toBe('network');
    expect(empty.fetch).toHaveBeenCalledTimes(1);
  });

  it('服务器带 Vary: Origin 时也能命中缓存（预缓存请求与页面的模块脚本请求头不同）', async () => {
    const response = await dispatchFetch(
      harness,
      new Request(`${SCOPE}assets/app-1.js`, { headers: { Origin: ORIGIN } }),
    );
    expect(response?.ok).toBe(true);
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it('缓存命中的资源直接返回', async () => {
    const response = await dispatchFetch(harness, new Request(`${SCOPE}assets/app-1.js`));
    expect(response?.ok).toBe(true);
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it('未缓存的 assets 资源（如字体子集）走网络并写入缓存', async () => {
    const url = `${SCOPE}assets/font-greek.woff2`;
    const response = await dispatchFetch(harness, new Request(url));
    expect(await response?.text()).toBe('network');
    expect(harness.store.get(CURRENT)?.entries.has(url)).toBe(true);
  });

  it('其他位置的资源与失败的响应不写入缓存', async () => {
    const outside = `${SCOPE}api/data.json`;
    await dispatchFetch(harness, new Request(outside));
    expect(harness.store.get(CURRENT)?.entries.has(outside)).toBe(false);

    harness.fetch.mockResolvedValueOnce(basicResponse('', { status: 500 }));
    const missing = `${SCOPE}assets/missing.js`;
    const response = await dispatchFetch(harness, new Request(missing));
    expect(response?.status).toBe(500);
    expect(harness.store.get(CURRENT)?.entries.has(missing)).toBe(false);
  });

  it('跨域请求与非 GET 请求交给浏览器，不拦截', async () => {
    expect(await dispatchFetch(harness, new Request('https://elsewhere.test/a.js'))).toBeNull();
    expect(
      await dispatchFetch(harness, new Request(`${SCOPE}assets/app-1.js`, { method: 'POST' })),
    ).toBeNull();
  });
});

describe('message', () => {
  it('收到 SKIP_WAITING 才让新版本接管，其他消息忽略', () => {
    harness.handlers.get('message')?.({ data: { type: 'OTHER' } });
    harness.handlers.get('message')?.({ data: undefined });
    expect(harness.skipWaiting).not.toHaveBeenCalled();
    harness.handlers.get('message')?.({ data: { type: SKIP_WAITING_MESSAGE } });
    expect(harness.skipWaiting).toHaveBeenCalledTimes(1);
  });
});
