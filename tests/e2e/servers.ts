/**
 * 端到端测试使用的两个服务器（由 playwright.config.ts 启动）。
 *
 * - 开发服务器：功能测试（设计系统页只在开发模式打包）；
 * - 生产构建预览：性能预算只在真实产物上衡量。开发模式会逐个加载上百个未打包的模块，
 *   首屏时间主要取决于模块数量，并不代表用户实际体验。
 */
export const DEV_PORT = 5173;
export const DEV_URL = `http://localhost:${String(DEV_PORT)}`;

export const PREVIEW_PORT = 4173;
export const PREVIEW_URL = `http://localhost:${String(PREVIEW_PORT)}`;
