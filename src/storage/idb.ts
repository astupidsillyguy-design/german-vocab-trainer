/**
 * IndexedDB 的最小 Promise 封装。
 *
 * 事务在“没有未完成的请求、且当前任务结束”时自动提交；await 请求的 Promise 不会让事务失效
 * （回调与随后的微任务都在请求的 success 事件派发期间执行），但 await 其他异步操作会。
 * 写操作不单独包装：直接发起，统一等待事务完成——任何一步失败都会让整个事务回滚。
 */
import { StorageError, toStorageError } from './errors';

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new DOMException('IndexedDB 请求失败', 'UnknownError'));
    });
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => {
      resolve();
    });
    // 请求失败会先冒泡 error 再触发 abort；配额不足通常在提交时才以 abort 报告
    transaction.addEventListener('abort', () => {
      reject(transaction.error ?? new DOMException('事务已中止', 'AbortError'));
    });
  });
}

/**
 * 在事务中执行 body：body 同步抛错（例如数据无法克隆）时中止事务；
 * 无论成败都等事务结束后再返回，错误统一转换为 StorageError。
 */
export async function runTransaction<T>(
  transaction: IDBTransaction,
  body: (transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const done = transactionDone(transaction);
  let result: T;
  try {
    result = await body(transaction);
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // 事务可能已经结束
    }
    await done.catch(() => undefined);
    throw toStorageError(error);
  }
  try {
    await done;
  } catch (error) {
    throw toStorageError(error);
  }
  return result;
}

export interface OpenDatabaseOptions {
  readonly factory: IDBFactory;
  readonly name: string;
  readonly version: number;
  readonly upgrade: (database: IDBDatabase, oldVersion: number) => void;
  /** 其他标签页要升级数据库：本连接已关闭，调用方应提示用户刷新 */
  readonly onVersionChange?: () => void;
}

export function openDatabase({
  factory,
  name,
  version,
  upgrade,
  onVersionChange,
}: OpenDatabaseOptions): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, version);
    } catch (error) {
      reject(new StorageError('unavailable', { cause: error }));
      return;
    }
    request.addEventListener('upgradeneeded', (event) => {
      upgrade(request.result, event.oldVersion);
    });
    request.addEventListener('success', () => {
      const database = request.result;
      database.addEventListener('versionchange', () => {
        database.close();
        onVersionChange?.();
      });
      resolve(database);
    });
    request.addEventListener('error', () => {
      reject(toStorageError(request.error, 'unavailable'));
    });
    // blocked：其他标签页仍连着旧版本；它们收到 versionchange 后会关闭连接，打开随即继续
  });
}
