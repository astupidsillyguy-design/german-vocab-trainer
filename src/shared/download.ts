/**
 * 把数据保存为本地文件（浏览器下载）。
 */

const JSON_INDENT = 2;
/** 部分浏览器在 click() 之后才开始读取 Blob，稍后再释放地址 */
const REVOKE_DELAY_MS = 1000;

/**
 * JSON.stringify 无法表示的值换成可读形式，保证导出的文件包含全部原始信息：
 * bigint → 字符串，Map → 键值对数组，Set → 数组，二进制 → 字节数组。
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Map) return [...value.entries()];
  if (value instanceof Set) return [...value.values()];
  if (value instanceof ArrayBuffer) return [...new Uint8Array(value)];
  if (ArrayBuffer.isView(value)) {
    return [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)];
  }
  return value;
}

export function toJsonText(data: unknown): string {
  return JSON.stringify(data, jsonReplacer, JSON_INDENT);
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, new Blob([toJsonText(data)], { type: 'application/json' }));
}

/** 文件名中的时间戳：2025-01-15T08-30-00Z（不含冒号，兼容所有文件系统） */
export function fileTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d+Z$/u, 'Z')
    .replaceAll(':', '-');
}
