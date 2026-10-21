import { afterEach, describe, expect, it, vi } from 'vitest';
import { cx } from './cx';
import { hash64 } from './hash';
import { readPreference, writePreference } from './preferences';

describe('cx', () => {
  it('拼接类名并忽略假值与空串', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
    expect(cx()).toBe('');
  });
});

describe('hash64', () => {
  it('结果稳定，为 16 位十六进制；输入稍有不同结果就不同', () => {
    const value = hash64('Apartment');
    expect(value).toMatch(/^[0-9a-f]{16}$/u);
    expect(hash64('Apartment')).toBe(value);
    expect(hash64('apartment')).not.toBe(value);
    expect(hash64('')).toMatch(/^[0-9a-f]{16}$/u);
  });
});

describe('preferences', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('带命名空间前缀读写 localStorage', () => {
    expect(writePreference('locale', 'de')).toBe(true);
    expect(localStorage.getItem('gvt.pref.locale')).toBe('de');
    expect(readPreference('locale')).toBe('de');
    expect(readPreference('missing')).toBeNull();
  });

  it('存储不可用（隐私模式 / 配额已满）时不抛异常', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(writePreference('locale', 'de')).toBe(false);
    expect(readPreference('locale')).toBeNull();
  });
});
