import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, DRAFT_MAX_LENGTH, readDraft, writeDraft } from './draft';

const KEY = 'gvt.session.draft.word-list';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('词表草稿', () => {
  it('写入后可以读回，清除后为空', () => {
    expect(readDraft()).toBeNull();
    expect(writeDraft({ text: 'der Tisch 桌子', base: '' })).toBe(true);
    expect(readDraft()).toEqual({ text: 'der Tisch 桌子', base: '' });
    clearDraft();
    expect(readDraft()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('内容损坏或版本不符时丢弃', () => {
    sessionStorage.setItem(KEY, '{坏');
    expect(readDraft()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();

    sessionStorage.setItem(KEY, JSON.stringify({ version: 99, text: 'a', base: 'b' }));
    expect(readDraft()).toBeNull();

    sessionStorage.setItem(KEY, JSON.stringify({ version: 1, text: 42, base: '' }));
    expect(readDraft()).toBeNull();
  });

  it('多余的字段被忽略', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ version: 1, text: 'a', base: 'b', extra: 1 }));
    expect(readDraft()).toEqual({ text: 'a', base: 'b' });
  });

  it('超长的草稿不暂存，并清除旧草稿', () => {
    writeDraft({ text: 'a', base: '' });
    expect(writeDraft({ text: 'x'.repeat(DRAFT_MAX_LENGTH + 1), base: '' })).toBe(false);
    expect(readDraft()).toBeNull();
  });

  it('存储不可用时不抛出异常', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(writeDraft({ text: 'a', base: '' })).toBe(false);
    expect(readDraft()).toBeNull();
    expect(() => {
      clearDraft();
    }).not.toThrow();
  });
});
