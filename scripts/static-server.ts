import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { headersForPath } from './security-headers.ts';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** 小于这个大小的文件压缩收益很小 */
const MIN_COMPRESSIBLE_BYTES = 1024;
const BROTLI_QUALITY = 9;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.webmanifest', '.json']);

type Encoding = 'br' | 'gzip' | 'identity';

function chooseEncoding(acceptEncoding: string | undefined): Encoding {
  const accepted = (acceptEncoding ?? '').split(',').map((part) => part.trim().split(';')[0]);
  if (accepted.includes('br')) return 'br';
  if (accepted.includes('gzip')) return 'gzip';
  return 'identity';
}

async function encode(body: Buffer, encoding: Encoding): Promise<Buffer> {
  if (encoding === 'br') {
    return brotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } });
  }
  if (encoding === 'gzip') return gzipAsync(body, { level: constants.Z_BEST_COMPRESSION });
  return body;
}

/** 请求路径换算为 root 下的文件路径；越出 root 时返回 null */
function resolveFile(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath);
  const relative = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  const file = normalize(join(root, relative));
  return file === root || file.startsWith(root + sep) ? file : null;
}

async function respond(root: string, request: IncomingMessage, response: ServerResponse) {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const file = request.method === 'GET' ? resolveFile(root, pathname) : null;
  const body = file === null ? null : await readFile(file).catch(() => null);
  if (file === null || body === null) {
    response.writeHead(404, headersForPath(pathname)).end('Not Found');
    return;
  }
  const extension = extname(file);
  const canCompress = COMPRESSIBLE.has(extension) && body.length >= MIN_COMPRESSIBLE_BYTES;
  const encoding = canCompress ? chooseEncoding(request.headers['accept-encoding']) : 'identity';
  const payload = await encode(body, encoding);
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    'Content-Length': payload.length,
    Vary: 'Accept-Encoding',
    ...(encoding === 'identity' ? {} : { 'Content-Encoding': encoding }),
    ...headersForPath(pathname),
  });
  response.end(payload);
}

/**
 * 最小的生产环境静态服务器：压缩（br / gzip）+ 与 `_headers` 相同的安全与缓存响应头。
 * 用于在本机验证线上行为（Lighthouse 评分需要压缩与缓存头，`vite preview` 没有压缩）。
 */
export function createStaticServer(root: string): Server {
  const base = normalize(root);
  return createServer((request, response) => {
    respond(base, request, response).catch(() => {
      response.writeHead(500).end('Internal Server Error');
    });
  });
}
