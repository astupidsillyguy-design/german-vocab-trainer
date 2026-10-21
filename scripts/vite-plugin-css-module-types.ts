import { join } from 'node:path';
import type { Plugin } from 'vite';
import { syncCssModuleTypes } from './css-module-types.ts';

const MODULE_SUFFIX = '.module.css';

/** 开发时：启动与每次修改 CSS Module 后自动刷新对应的类型声明。 */
export function cssModuleTypesPlugin(): Plugin {
  let sourceRoot = '';
  return {
    name: 'css-module-types',
    apply: 'serve',
    configResolved(config) {
      sourceRoot = join(config.root, 'src');
      syncCssModuleTypes(sourceRoot, { check: false });
    },
    handleHotUpdate({ file }) {
      if (file.endsWith(MODULE_SUFFIX)) syncCssModuleTypes(sourceRoot, { check: false });
    },
  };
}
