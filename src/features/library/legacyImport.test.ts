import { describe, expect, it } from 'vitest';
import { convertLegacy, dumpFromKeyMap, type LegacyDump, type Library } from '../../domain';
import { StorageError } from '../../storage';
import { makeEntry, TEST_NOW } from '../../test/entries';
import { LEGACY_BROKEN, LEGACY_FIXTURE, legacyKeyMap, LEGACY_SCHRANK } from '../../test/legacy';
import { createTestStore } from '../../test/library';
import { ControlledRepository } from '../../test/repositories';
import { importLegacy, LEGACY_MIGRATION_KEY, migrateLegacyStorage } from './legacyImport';

const DUMP: LegacyDump = dumpFromKeyMap((key) => legacyKeyMap()[key]) ?? {};

const prompts = (entries: Library['pool']): string[] => entries.map(({ prompt }) => prompt);

async function setup(initial?: Library) {
  const repository = new ControlledRepository(initial === undefined ? {} : { initial });
  const store = createTestStore(repository);
  await store.load();
  return { repository, store };
}

const migrate = (store: ReturnType<typeof createTestStore>, dump: LegacyDump | null = DUMP) =>
  migrateLegacyStorage(store, { read: () => dump, now: TEST_NOW });

describe('migrateLegacyStorage：启动时的同源迁移', () => {
  it('新词库为空：导入全部旧数据，备份存为快照，不另存“导入前”快照，并留下记录', async () => {
    const { repository, store } = await setup();
    const result = await migrate(store);
    expect(result).toEqual({ type: 'migrated', added: { pool: 2, archive: 1 }, rejected: 0 });

    const { library, snapshots } = store.getState();
    expect(prompts(library.pool)).toEqual(['柜子', '帮助']);
    // 名词只保留带冠词的答案
    expect(library.pool[0]?.answers).toEqual(['der Schrank']);
    expect(prompts(library.archive)).toEqual(['桌子']);
    expect(snapshots.map(({ reason, counts }) => ({ reason, counts }))).toEqual([
      { reason: 'legacy-backup', counts: { pool: 2, archive: 2 } },
    ]);
    expect(snapshots[0]?.createdAt).toBe(new Date(TEST_NOW.getTime() - 1).toISOString());
    expect(await repository.readState(LEGACY_MIGRATION_KEY)).toEqual({
      version: 1,
      at: TEST_NOW.toISOString(),
      outcome: 'migrated',
      added: { pool: 2, archive: 1 },
    });
  });

  it('只迁移一次：已有记录时不再处理', async () => {
    const { store } = await setup();
    await migrate(store);
    await store.update((library) => ({ ...library, pool: [] }));
    expect(await migrate(store)).toBeNull();
    expect(store.getState().library.pool).toEqual([]);
  });

  it('无法转换的词条原样放进隔离区', async () => {
    const { repository, store } = await setup();
    const dump = dumpFromKeyMap(
      (key) => legacyKeyMap({ pool: [LEGACY_SCHRANK, LEGACY_BROKEN] })[key],
    );
    expect(await migrate(store, dump)).toMatchObject({ type: 'migrated', rejected: 1 });
    expect(store.getState().quarantineCount).toBe(1);
    const [record] = await repository.listQuarantine();
    expect(record).toMatchObject({ source: 'legacy', raw: LEGACY_BROKEN });
  });

  it('新词库已有内容：不导入，只提示一次', async () => {
    const existing: Library = { pool: [makeEntry()], archive: [], order: [] };
    const { repository, store } = await setup(existing);
    expect(await migrate(store)).toEqual({ type: 'found' });
    expect(store.getState().library.pool).toHaveLength(1);
    expect(await repository.readState(LEGACY_MIGRATION_KEY)).toMatchObject({ outcome: 'found' });
    expect(await migrate(store)).toBeNull();
  });

  it('没有旧数据时什么也不做，也不留记录', async () => {
    const { repository, store } = await setup();
    expect(await migrate(store, null)).toBeNull();
    expect(repository.stateWrites).toEqual([]);
  });

  it('旧数据中没有任何内容：留下记录，不修改词库', async () => {
    const { repository, store } = await setup();
    const dump = dumpFromKeyMap((key) => legacyKeyMap({ pool: [], archive: [] })[key]);
    expect(await migrate(store, dump)).toBeNull();
    expect(repository.saves).toEqual([]);
    expect(await repository.readState(LEGACY_MIGRATION_KEY)).toMatchObject({ outcome: 'empty' });
  });

  it('没能保存时不留记录，下次启动会重新迁移', async () => {
    const { repository, store } = await setup();
    repository.failure = new StorageError('quota');
    expect(await migrate(store)).toMatchObject({ type: 'migrated' });
    expect(repository.stateWrites).toEqual([]);
  });
});

describe('importLegacy：设置页的手动导入', () => {
  const conversion = () => convertLegacy(DUMP, { now: TEST_NOW });

  it('合并：跳过已有的词，导入前保存快照', async () => {
    const existing = convertLegacy(DUMP, { now: TEST_NOW }).library;
    const { store } = await setup({ ...existing, pool: existing.pool.slice(0, 1) });
    const result = await importLegacy(store, conversion(), 'merge', TEST_NOW);
    expect(result).toMatchObject({ ok: true, added: { pool: 1, archive: 0 }, duplicates: 2 });
    expect(result.ok && result.snapshotId).not.toBeNull();
    expect(prompts(store.getState().library.pool)).toEqual(['柜子', '帮助']);
    expect(store.getState().snapshots.map(({ reason }) => reason)).toEqual([
      'import',
      'legacy-backup',
    ]);
  });

  it('替换：用旧数据替换现有词库，可以恢复', async () => {
    const { store } = await setup({
      pool: [makeEntry({ prompt: '现有' })],
      archive: [],
      order: [],
    });
    const result = await importLegacy(store, conversion(), 'replace', TEST_NOW);
    expect(prompts(store.getState().library.pool)).toEqual(['柜子', '帮助']);
    if (!result.ok || result.snapshotId === null) throw new Error('应当保存了快照');
    await store.restoreSnapshot(result.snapshotId, { saveCurrent: false });
    expect(prompts(store.getState().library.pool)).toEqual(['现有']);
  });

  it('没有备份时不附带快照', async () => {
    const { store } = await setup();
    const withoutBackup = { pool: LEGACY_FIXTURE.pool, archive: LEGACY_FIXTURE.archive };
    const dump = dumpFromKeyMap((key) => legacyKeyMap(withoutBackup)[key]) ?? {};
    await importLegacy(store, convertLegacy(dump), 'replace');
    expect(store.getState().snapshots).toEqual([]);
  });
});
