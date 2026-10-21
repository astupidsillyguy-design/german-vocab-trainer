/**
 * jsdom 没有实现 URL.createObjectURL / revokeObjectURL，链接 click() 也不会下载。
 * 这里替换这三者并记录下载，测试结束后还原。
 */
import { vi } from 'vitest';

export interface DownloadRecord {
  readonly filename: string;
  readonly href: string;
  readonly blob: Blob;
}

export interface DownloadStub {
  readonly downloads: readonly DownloadRecord[];
  readonly revoked: readonly string[];
  restore(): void;
}

export function stubDownloads(): DownloadStub {
  const blobs = new Map<string, Blob>();
  const downloads: DownloadRecord[] = [];
  const revoked: string[] = [];
  const descriptors = {
    createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
    revokeObjectURL: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
  };
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const href = `blob:test/${String(blobs.size + 1)}`;
      blobs.set(href, blob);
      return href;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (href: string) => {
      revoked.push(href);
    },
  });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.href);
    if (blob !== undefined) downloads.push({ filename: this.download, href: this.href, blob });
  });

  return {
    downloads,
    revoked,
    restore: () => {
      click.mockRestore();
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor === undefined) Reflect.deleteProperty(URL, key);
        else Object.defineProperty(URL, key, descriptor);
      }
    },
  };
}

/** jsdom 的 Blob 不一定实现 text()，用 FileReader 读取 */
export function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('读取失败'));
    });
    reader.readAsText(blob);
  });
}
