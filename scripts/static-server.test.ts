import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaticServer } from './static-server.ts';

const LARGE = 'console.log("hello");\n'.repeat(200);

let root = '';
let origin = '';
const server = createStaticServer('placeholder');
let live = server;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'gvt-static-'));
  mkdirSync(join(root, 'assets'));
  mkdirSync(join(root, 'course', 'app'), { recursive: true });
  writeFileSync(join(root, 'course', 'app', 'index.html'), '<!doctype html><title>nested</title>');
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>t</title>');
  writeFileSync(join(root, 'assets', 'app-1.js'), LARGE);
  writeFileSync(join(root, 'manifest.webmanifest'), '{"name":"x"}');
  live = createStaticServer(root);
  await new Promise<void>((resolve) => live.listen(0, resolve));
  origin = `http://127.0.0.1:${String((live.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise((resolve) => live.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

describe('createStaticServer', () => {
  it('根路径返回 index.html，带安全响应头且每次校验', async () => {
    const response = await fetch(`${origin}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toContain('<title>t</title>');
  });

  it('子目录的尾斜杠入口返回该目录自己的 index.html', async () => {
    const response = await fetch(`${origin}/course/app/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(await response.text()).toContain('<title>nested</title>');
  });

  it('不存在的子目录不会错误地回退到站点首页', async () => {
    expect((await fetch(`${origin}/course/missing/`)).status).toBe(404);
  });

  it('带哈希的资源永久缓存，并按客户端能力压缩（fetch 会自动解压）', async () => {
    const response = await fetch(`${origin}/assets/app-1.js`, {
      headers: { 'Accept-Encoding': 'br' },
    });
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('content-encoding')).toBe('br');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(await response.text()).toBe(LARGE);
  });

  it('不支持 br 时使用 gzip，都不支持时原样返回', async () => {
    const gzipped = await fetch(`${origin}/assets/app-1.js`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    expect(gzipped.headers.get('content-encoding')).toBe('gzip');
    expect(await gzipped.text()).toBe(LARGE);

    const plain = await fetch(`${origin}/assets/app-1.js`, {
      headers: { 'Accept-Encoding': 'identity' },
    });
    expect(plain.headers.get('content-encoding')).toBeNull();
    expect(Number(plain.headers.get('content-length'))).toBe(LARGE.length);
  });

  it('小文件不压缩，manifest 使用专用类型', async () => {
    const response = await fetch(`${origin}/manifest.webmanifest`, {
      headers: { 'Accept-Encoding': 'br' },
    });
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-type')).toBe('application/manifest+json');
  });

  it('不存在的文件返回 404，且不能读取根目录之外的文件', async () => {
    expect((await fetch(`${origin}/nope.js`)).status).toBe(404);
    const traversal = await fetch(`${origin}/..%2f..%2fetc%2fpasswd`);
    expect(traversal.status).toBe(404);
  });

  it('只处理 GET', async () => {
    expect((await fetch(`${origin}/`, { method: 'POST' })).status).toBe(404);
  });
});
