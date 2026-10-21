/**
 * 用生产环境的响应头在本机提供 dist/（先运行 `npm run build`）。
 * 用法：npm run serve [-- 端口]
 */
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './static-server.ts';

const DEFAULT_PORT = 4174;
const port = Number(process.argv[2] ?? DEFAULT_PORT);

createStaticServer(fileURLToPath(new URL('../dist', import.meta.url))).listen(port, () => {
  console.log(`http://localhost:${String(port)}`);
});
