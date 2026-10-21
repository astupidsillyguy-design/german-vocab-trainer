/**
 * 会话级暂存（sessionStorage）：刷新页面后仍在，关闭标签页即清除，适合“编辑到一半”的草稿。
 * 与 preferences 一样，所有访问都做异常保护：隐私模式、存储被禁用或配额已满时不会让应用崩溃。
 */
const PREFIX = 'gvt.session.';

export function readSessionValue(key: string): string | null {
  try {
    return globalThis.sessionStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** 返回是否写入成功（配额不足时失败） */
export function writeSessionValue(key: string, value: string): boolean {
  try {
    globalThis.sessionStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeSessionValue(key: string): void {
  try {
    globalThis.sessionStorage.removeItem(PREFIX + key);
  } catch {
    // 存储不可用时本来也没有可删除的内容
  }
}
