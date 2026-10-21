import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readBlobText, stubDownloads, type DownloadStub } from '../test/download';
import { downloadJson, fileTimestamp, jsonReplacer, toJsonText } from './download';

describe('toJsonText', () => {
  it('保留 JSON 无法直接表示的值', () => {
    const data = {
      big: 10n,
      map: new Map([['a', 1]]),
      set: new Set(['x']),
      buffer: new Uint8Array([1, 2]).buffer,
      view: new Uint8Array([3, 4, 5]).subarray(1),
      date: new Date('2025-01-15T08:30:00.000Z'),
    };
    expect(JSON.parse(toJsonText(data))).toEqual({
      big: '10',
      map: [['a', 1]],
      set: ['x'],
      buffer: [1, 2],
      view: [4, 5],
      date: '2025-01-15T08:30:00.000Z',
    });
  });

  it('普通值原样返回', () => {
    expect(jsonReplacer('', 'text')).toBe('text');
    expect(jsonReplacer('', null)).toBeNull();
  });
});

describe('fileTimestamp', () => {
  it('不含冒号与毫秒', () => {
    expect(fileTimestamp(new Date('2025-01-15T08:30:05.123Z'))).toBe('2025-01-15T08-30-05Z');
  });
});

describe('downloadJson', () => {
  let stub: DownloadStub;

  beforeEach(() => {
    stub = stubDownloads();
  });

  afterEach(() => {
    stub.restore();
    vi.useRealTimers();
  });

  it('通过临时链接下载 JSON 文件，稍后释放地址', async () => {
    vi.useFakeTimers();
    downloadJson('data.json', { ok: true });

    expect(stub.downloads.map(({ filename }) => filename)).toEqual(['data.json']);
    const [record] = stub.downloads;
    expect(record?.blob.type).toBe('application/json');
    expect(stub.revoked).toEqual([]);
    vi.runAllTimers();
    expect(stub.revoked).toEqual([record?.href]);
    // FileReader 依赖真实计时器
    vi.useRealTimers();
    expect(JSON.parse(await readBlobText(record?.blob ?? new Blob()))).toEqual({ ok: true });
  });
});
