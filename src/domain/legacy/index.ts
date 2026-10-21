/**
 * 原版数据迁移（F-005）：读取原版的存储布局，转换为新词库，或并入现有词库。
 */
export {
  convertLegacy,
  withoutBareNouns,
  type LegacyContext,
  type LegacyConversion,
  type LegacyRejected,
  type LegacyStats,
} from './convert';
export {
  LEGACY_EXPORT_KIND,
  LEGACY_EXPORT_VERSION,
  readLegacyFile,
  type LegacyFileError,
  type LegacyFileRead,
} from './file';
export {
  LEGACY_KEY_PREFIX,
  LEGACY_KEYS,
  LEGACY_PARTS,
  dumpFromKeyMap,
  type LegacyDump,
  type LegacyPart,
} from './keys';
export { mergeLibraries, type MergeResult } from './merge';
