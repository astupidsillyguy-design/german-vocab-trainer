/**
 * 对生产构建（dist/）跑 Lighthouse：移动端与桌面端各一次，打印四个类别的分数（先运行 `npm run build`）。
 *
 * 用法：npm run lighthouse
 * - 服务器与线上一致：压缩 + 生产响应头（scripts/static-server.ts）；
 * - Lighthouse 由 npx 按固定版本下载，不是项目依赖；需要本机装有 Chrome（或设置 CHROME_PATH）；
 * - 在容器里运行时设置 LIGHTHOUSE_CHROME_FLAGS="--no-sandbox --disable-dev-shm-usage"。
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORM_FACTORS,
  LIGHTHOUSE_PACKAGE,
  formatLines,
  hasFailure,
  judge,
  lighthouseArgs,
  parseScores,
  type FormFactor,
  type ScoreLine,
} from './lighthouse-report.ts';
import { createStaticServer } from './static-server.ts';

const IS_WINDOWS = process.platform === 'win32';

/** Windows 上 npx 是 .cmd，需要经过 shell；带空格的参数要自己加引号 */
function shellArg(arg: string): string {
  return IS_WINDOWS && /\s/.test(arg) ? `"${arg}"` : arg;
}

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(shellArg), { stdio: 'inherit', shell: IS_WINDOWS });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 退出码 ${String(code)}`));
    });
  });
}

async function measure(url: string, formFactor: FormFactor): Promise<ScoreLine[]> {
  const directory = await mkdtemp(join(tmpdir(), 'gvt-lighthouse-'));
  const outputPath = join(directory, `${formFactor}.json`);
  try {
    await run(IS_WINDOWS ? 'npx.cmd' : 'npx', [
      '--yes',
      LIGHTHOUSE_PACKAGE,
      ...lighthouseArgs({
        url,
        formFactor,
        outputPath,
        extraChromeFlags: process.env.LIGHTHOUSE_CHROME_FLAGS ?? '',
      }),
    ]);
    const report: unknown = JSON.parse(await readFile(outputPath, 'utf8'));
    return judge(formFactor, parseScores(report));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const server = createStaticServer(fileURLToPath(new URL('../dist', import.meta.url)));
await new Promise<void>((resolve) => server.listen(0, resolve));
const { port } = server.address() as AddressInfo;

try {
  const failures: FormFactor[] = [];
  for (const formFactor of FORM_FACTORS) {
    const lines = await measure(`http://localhost:${String(port)}/`, formFactor);
    console.log(formatLines(formFactor, lines));
    if (hasFailure(lines)) failures.push(formFactor);
  }
  if (failures.length > 0) {
    console.error(`\nLighthouse 低于门槛：${failures.join('、')}`);
    process.exitCode = 1;
  }
} finally {
  server.close();
}
