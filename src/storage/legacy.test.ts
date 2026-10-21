import { describe, expect, it } from 'vitest';
import { LEGACY_KEYS } from '../domain';
import { readLegacyStorage } from './legacy';

function storageWith(values: Readonly<Record<string, string>>): Pick<Storage, 'getItem'> {
  return { getItem: (key) => values[key] ?? null };
}

describe('readLegacyStorage', () => {
  it('读出原版的各部分原始文本', () => {
    const pool = JSON.stringify([{ prompt: '柜子', answers: ['der Schrank'] }]);
    expect(readLegacyStorage(storageWith({ [LEGACY_KEYS.pool]: pool, other: 'x' }))).toEqual({
      pool,
    });
  });

  it('没有旧数据时返回 null', () => {
    expect(readLegacyStorage(storageWith({}))).toBeNull();
  });

  it('浏览器禁止访问 localStorage 时返回 null', () => {
    const denied: Pick<Storage, 'getItem'> = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    expect(readLegacyStorage(denied)).toBeNull();
  });
});
