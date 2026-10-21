import { defineConfig, devices } from '@playwright/test';
import { DEV_PORT, DEV_URL, PREVIEW_PORT, PREVIEW_URL } from './tests/e2e/servers';

/**
 * 端到端测试：桌面与手机 × Chromium / WebKit（Safari）/ Firefox。
 *
 * 只装了系统 Chromium 的环境（例如 CI 容器）可以设置 PLAYWRIGHT_CHROMIUM_PATH，
 * 再用 `--project=desktop-chromium --project=mobile-chromium` 只跑 Chromium。
 */
/** 构建预览服务器需要先完成生产构建 */
const PREVIEW_STARTUP_TIMEOUT_MS = 120_000;
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const isCI = process.env.CI !== undefined;

const chromiumLaunch = chromiumPath === undefined ? {} : { executablePath: chromiumPath };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: DEV_URL,
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], launchOptions: chromiumLaunch },
    },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
    {
      name: 'desktop-firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          // 两台测试设备位于同一机器；容器网卡可能只有 169.254/16 链路本地地址。
          // 允许本地 ICE 候选地址，避免依赖外部 STUN；不修改应用的真实网络配置。
          firefoxUserPrefs: {
            'media.peerconnection.ice.loopback': true,
            'media.peerconnection.ice.link_local': true,
            'media.peerconnection.ice.obfuscate_host_addresses': false,
          },
        },
      },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${String(DEV_PORT)} --strictPort`,
      url: DEV_URL,
      reuseExistingServer: !isCI,
    },
    {
      // 跳过类型检查（npm run check 已覆盖），只构建产物
      command: `npx vite build && npx vite preview --port ${String(PREVIEW_PORT)} --strictPort`,
      url: PREVIEW_URL,
      reuseExistingServer: !isCI,
      timeout: PREVIEW_STARTUP_TIMEOUT_MS,
    },
  ],
});
