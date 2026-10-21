/**
 * 存储错误分类：界面据此给出可操作的提示（例如空间不足时建议释放空间）。
 */
export type StorageErrorKind =
  /** 浏览器不提供或禁止使用 IndexedDB（部分无痕模式、存储被禁用） */
  | 'unavailable'
  /** 存储空间不足 */
  | 'quota'
  /** 本地数据库由更新版本的应用创建 */
  | 'version'
  | 'unknown';

export class StorageError extends Error {
  override readonly name = 'StorageError';
  readonly kind: StorageErrorKind;

  constructor(kind: StorageErrorKind, options?: ErrorOptions) {
    super(`存储错误：${kind}`, options);
    this.kind = kind;
  }
}

/** Firefox 旧版本使用 NS_ERROR_DOM_QUOTA_REACHED */
const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);

function errorName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('name' in error)) return null;
  return typeof error.name === 'string' ? error.name : null;
}

export function toStorageError(
  error: unknown,
  fallback: StorageErrorKind = 'unknown',
): StorageError {
  if (error instanceof StorageError) return error;
  const name = errorName(error);
  if (name !== null && QUOTA_ERROR_NAMES.has(name))
    return new StorageError('quota', { cause: error });
  if (name === 'VersionError') return new StorageError('version', { cause: error });
  return new StorageError(fallback, { cause: error });
}
