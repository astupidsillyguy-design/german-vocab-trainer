/** 本项目使用的构建期环境变量（只放公开开关，绝不放密钥：它们会被内联进前端代码）。 */
interface ImportMetaEnv {
  /** 设为 'true' 时在生产构建中也包含设计系统页（#/__design） */
  readonly VITE_DESIGN_GALLERY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** 应用版本号（vite.config.ts 从 package.json 注入） */
declare const __APP_VERSION__: string;
