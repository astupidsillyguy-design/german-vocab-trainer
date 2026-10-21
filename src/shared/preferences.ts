/**
 * 启动期偏好（如界面语言）需要在首帧之前同步读取，因此放在 localStorage。
 * 业务数据统一走 IndexedDB（阶段 6）。所有访问都做异常保护：
 * 隐私模式、存储被禁用或配额已满时不会让应用崩溃。
 */
const PREFIX = 'gvt.pref.';

export function preferenceStorageKey(key: string): string {
  return PREFIX + key;
}

export function readPreference(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(preferenceStorageKey(key));
  } catch {
    return null;
  }
}

/** 返回是否写入成功，调用方可据此提示用户。 */
export function writePreference(key: string, value: string): boolean {
  try {
    globalThis.localStorage.setItem(preferenceStorageKey(key), value);
    return true;
  } catch {
    return false;
  }
}
