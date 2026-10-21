/**
 * 原版数据导入（F-005）。启动时的同源自动迁移与设置页的手动导入共用这里的写入逻辑：
 * 词库、原版接收同步前的备份（作为快照）与无法转换的原始数据（隔离区）在同一次写入中保存。
 * 原版的 localStorage 只读不删：原版仍可继续使用，迁移也可以重做。
 */
import {
  convertLegacy,
  countLibrary,
  createSnapshot,
  mergeLibraries,
  type LegacyConversion,
  type LegacyDump,
  type Library,
  type LibraryCounts,
} from '../../domain';
import { readLegacyStorage, type LibraryStore, type QuarantineDraft } from '../../storage';

/** merge：并入现有词库，跳过已有的词；replace：用旧数据替换现有词库 */
export type LegacyImportMode = 'merge' | 'replace';

export type LegacyImportResult =
  | {
      readonly ok: true;
      readonly saved: boolean;
      /** 导入前的快照；词库原本为空时不保存 */
      readonly snapshotId: string | null;
      readonly added: LibraryCounts;
      /** 合并时因为已经存在而跳过的词数 */
      readonly duplicates: number;
    }
  /** 合并后超出单个集合的词数上限 */
  | { readonly ok: false; readonly error: 'too-many' };

/** 原版的同步备份比本次导入早这么久，快照历史中排在“导入数据前”之后 */
const BACKUP_SNAPSHOT_OFFSET_MS = 1;

export const isLibraryEmpty = (library: Library): boolean => {
  const { pool, archive } = countLibrary(library);
  return pool + archive === 0;
};

/** 旧数据中有没有可以导入的内容（词，或至少一条需要保留的无法识别的数据） */
export const hasLegacyContent = ({ stats }: LegacyConversion): boolean =>
  stats.pool + stats.archive + stats.backup + stats.rejected > 0;

export async function importLegacy(
  store: LibraryStore,
  conversion: LegacyConversion,
  mode: LegacyImportMode,
  now: Date = new Date(),
): Promise<LegacyImportResult> {
  const current = store.getState().library;
  const merged =
    mode === 'merge'
      ? mergeLibraries(current, conversion.library)
      : {
          ok: true as const,
          library: conversion.library,
          added: countLibrary(conversion.library),
          duplicates: 0,
        };
  if (!merged.ok) return merged;
  const history =
    conversion.backup === null
      ? []
      : [
          createSnapshot(conversion.backup, 'legacy-backup', {
            now: new Date(now.getTime() - BACKUP_SNAPSHOT_OFFSET_MS),
          }),
        ];
  const quarantine = conversion.rejected.map(({ issues, raw }): QuarantineDraft => ({
    source: 'legacy',
    issues,
    raw,
  }));
  const { saved, snapshotId } = await store.update(() => merged.library, {
    ...(isLibraryEmpty(current) ? {} : { snapshot: 'import' as const }),
    history,
    quarantine,
  });
  return { ok: true, saved, snapshotId, added: merged.added, duplicates: merged.duplicates };
}

/** 应用状态中的迁移记录：存在即表示已经处理过同源旧数据，不再自动迁移 */
export const LEGACY_MIGRATION_KEY = 'legacy-migration';
const LEGACY_MIGRATION_VERSION = 1;

export type LegacyMigration =
  | {
      /** 新词库为空，已自动导入 */
      readonly type: 'migrated';
      readonly added: LibraryCounts;
      readonly rejected: number;
    }
  /** 新词库已有内容：不自动导入，提示用户在设置中选择合并或替换 */
  | { readonly type: 'found' };

export interface LegacyMigrationOptions {
  readonly read?: () => LegacyDump | null;
  readonly now?: Date;
}

/**
 * 同源自动迁移：新版与原版部署在同一网址时，第一次打开就能看到原来的词。只处理一次；
 * 没有旧数据时不留记录（之后出现的旧数据仍会被处理）。
 */
export async function migrateLegacyStorage(
  store: LibraryStore,
  { read = readLegacyStorage, now = new Date() }: LegacyMigrationOptions = {},
): Promise<LegacyMigration | null> {
  const dump = read();
  if (dump === null) return null;
  await store.load();
  if ((await store.readState(LEGACY_MIGRATION_KEY)) !== undefined) return null;
  const record = (outcome: string, details: object = {}): Promise<boolean> =>
    store.writeState(LEGACY_MIGRATION_KEY, {
      version: LEGACY_MIGRATION_VERSION,
      at: now.toISOString(),
      outcome,
      ...details,
    });

  if (!isLibraryEmpty(store.getState().library)) {
    await record('found');
    return { type: 'found' };
  }
  const conversion = convertLegacy(dump, { now });
  if (!hasLegacyContent(conversion)) {
    await record('empty');
    return null;
  }
  const result = await importLegacy(store, conversion, 'replace', now);
  if (!result.ok) return null;
  // 没能保存时不留记录：数据仍在内存中等待重试；即使最终丢失，下次启动还会重新迁移
  if (result.saved) await record('migrated', { added: result.added });
  return { type: 'migrated', added: result.added, rejected: conversion.stats.rejected };
}

const migrations = new WeakMap<LibraryStore, Promise<LegacyMigration | null>>();

/** 每个词库只迁移一次（开发模式下 StrictMode 会让 Effect 执行两次） */
export function migrateLegacyOnce(store: LibraryStore): Promise<LegacyMigration | null> {
  let pending = migrations.get(store);
  if (pending === undefined) {
    pending = migrateLegacyStorage(store).catch(() => null);
    migrations.set(store, pending);
  }
  return pending;
}
