import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildSyncPayload, normalizeLibrary, type Entry } from '../../domain';
import { makeLesson } from '../../test/entries';
import { renderWithI18n } from '../../test/render';
import { SyncPreview } from './SyncPreview';

function libraryOf(entries: readonly Entry[]) {
  return normalizeLibrary({
    pool: [],
    archive: entries.map((entry) => ({ ...entry, archivedAt: '2025-02-01T09:00:00.000Z' })),
    order: [],
  });
}

function expectCount(label: string, count: number): void {
  expect(screen.getByText(label).closest('li')).toHaveTextContent(`${count} 词`);
}

describe('SyncPreview：内容变化统计', () => {
  it.each(['full', 'lessons'] as const)('%s：三个相同、两个新增，不把相同词再列为替换', (mode) => {
    const shared = makeLesson('A1', '第1讲', ['猫', '狗', '鸟']);
    const local = libraryOf(shared);
    const remote = libraryOf([...shared, ...makeLesson('A1', '第1讲', ['工作', '学习'])]);
    const payload = buildSyncPayload(
      remote,
      mode === 'full' ? { mode } : { mode, lessons: [{ chapter: 'A1', lesson: '第1讲' }] },
    );
    renderWithI18n(<SyncPreview library={local} payload={payload} />);

    expect(screen.queryByText('将替换的本机词')).not.toBeInTheDocument();
    expect(screen.queryByText('不变')).not.toBeInTheDocument();
    expectCount('新增', 2);
    expectCount('删除', 0);
    expectCount('内容相同', 3);
    expect(screen.getByText('收到 5 个词 · 1 个课时')).toBeInTheDocument();
    expect(
      screen.getByText(mode === 'full' ? '覆盖整个归档库' : '覆盖所选课时'),
    ).toBeInTheDocument();
  });

  it('全部内容相同时，只显示零新增、零删除与内容相同数量', () => {
    const local = libraryOf(makeLesson('A1', '第1讲', ['猫', '狗', '鸟']));
    renderWithI18n(
      <SyncPreview library={local} payload={buildSyncPayload(local, { mode: 'full' })} />,
    );

    expect(screen.queryByText('将替换的本机词')).not.toBeInTheDocument();
    expectCount('新增', 0);
    expectCount('删除', 0);
    expectCount('内容相同', 3);
  });
});
