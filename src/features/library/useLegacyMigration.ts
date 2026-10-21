/**
 * 启动时的同源旧数据迁移（F-005），完成后用通知告诉用户结果。
 */
import { useEffect, useEffectEvent } from 'react';
import { useLocation } from 'wouter';
import { useI18n } from '../../i18n';
import type { LibraryStore } from '../../storage';
import { toast } from '../../ui';
import { migrateLegacyOnce, type LegacyMigration } from './legacyImport';

export function useLegacyMigration(store: LibraryStore, settingsPath: string): void {
  const { messages } = useI18n();
  const [, navigate] = useLocation();

  const report = useEffectEvent((migration: LegacyMigration): void => {
    const text = messages.data.legacy;
    if (migration.type === 'found') {
      toast.show({
        title: text.found,
        description: text.foundDescription,
        action: {
          label: text.review,
          onAction: () => {
            navigate(settingsPath);
          },
        },
      });
      return;
    }
    const counts = messages.settings.data.wordCounts(migration.added.pool, migration.added.archive);
    toast.success({
      title: text.migrated,
      description: text.migratedDescription(counts, migration.rejected),
    });
  });

  useEffect(() => {
    let active = true;
    void migrateLegacyOnce(store).then((migration) => {
      if (active && migration !== null) report(migration);
    });
    return () => {
      active = false;
    };
  }, [store]);
}
