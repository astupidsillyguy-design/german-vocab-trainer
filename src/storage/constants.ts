/**
 * IndexedDB 布局。端到端测试会直接导入本文件来准备数据，因此这里只放常量、不引用浏览器 API。
 *
 * - library：键值存储，键为 LIBRARY_KEY 中的三项，值分别是待测库数组、归档库数组、归档排序表；
 * - snapshots / snapshot-data：快照的摘要与完整数据分开存放，列出历史时不必读取全部词库；
 * - quarantine：无法识别的原始数据（原样保留，可在设置页导出）；
 * - state：其他应用状态（例如测验进度）。
 */
export const DB_NAME = 'german-vocab-trainer';

/** 数据库版本即存储格式版本：格式变化时递增，并在 upgradeDatabase 中迁移 */
export const DB_VERSION = 1;

export const STORE = {
  library: 'library',
  snapshots: 'snapshots',
  snapshotData: 'snapshot-data',
  quarantine: 'quarantine',
  state: 'state',
} as const;

export const LIBRARY_KEY = {
  pool: 'pool',
  archive: 'archive',
  order: 'order',
} as const;

/** 多个标签页之间通知“词库已变化” */
export const CHANGE_CHANNEL_NAME = 'gvt:library';
