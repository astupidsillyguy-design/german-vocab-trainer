/**
 * 原版（单文件 HTML）在 localStorage 中的存储布局（F-005）。
 *
 * - pool：待测库（词条数组）；
 * - archive：归档库（词条数组）；
 * - order：归档排序表 `{ chapters: string[], lessons: { [章节]: string[] } }`；
 * - backup：接收同步覆盖前的备份 `{ archivedList, archiveOrder }`（原版“撤销覆盖”用）。
 *
 * 另有 `DE_QUIZ_ARCHIVE_IMPORTED_A1_33_V1` 等标志位，只记录内置词是否已导入（F-003 / F-004 已删除），不含数据。
 */
export const LEGACY_KEYS = {
  pool: 'DE_QUIZ_CUSTOM_VOCAB_V2',
  archive: 'DE_QUIZ_ARCHIVED_VOCAB_V2',
  order: 'DE_QUIZ_ARCHIVE_ORDER_V1',
  backup: 'DE_QUIZ_ARCHIVE_BACKUP_V1',
} as const;

export const LEGACY_PARTS = ['pool', 'archive', 'order', 'backup'] as const;
export type LegacyPart = (typeof LEGACY_PARTS)[number];

/** 原版所有存储键的共同前缀（导出工具据此收集全部旧数据，包括标志位） */
export const LEGACY_KEY_PREFIX = 'DE_QUIZ_';

/**
 * 旧数据：每一部分是 localStorage 中的原始字符串（JSON 文本），
 * 或者已经解析过的值（来自导出文件时可能如此）。缺少的部分表示原版没有保存过。
 */
export type LegacyDump = Partial<Readonly<Record<LegacyPart, unknown>>>;

/** 从“存储键 → 值”的表中取出原版数据；一项都没有时返回 null */
export function dumpFromKeyMap(read: (key: string) => unknown): LegacyDump | null {
  const dump: Partial<Record<LegacyPart, unknown>> = {};
  let found = false;
  for (const part of LEGACY_PARTS) {
    const value = read(LEGACY_KEYS[part]);
    if (value === undefined || value === null) continue;
    dump[part] = value;
    found = true;
  }
  return found ? dump : null;
}
