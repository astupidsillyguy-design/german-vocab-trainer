/**
 * 管理模式（F-050）：与原版一致，“管理”按钮单击进入编辑模式、双击进入删除模式。
 *
 * 第一下立即生效（不必等待双击窗口结束，单击没有延迟）；
 * 若在窗口内又按了一下，则按第一下之前的模式改判为双击。
 * 键盘与读屏用户不必双击：模式横幅里可以直接切换到另一种模式。
 */
export type ManageMode = 'none' | 'edit' | 'delete';

/** 单击：未在管理时进入编辑模式，否则退出 */
export function afterSinglePress(mode: ManageMode): ManageMode {
  return mode === 'none' ? 'edit' : 'none';
}

/** 双击：`before` 是第一下之前的模式；已在删除模式时双击退出，否则进入删除模式 */
export function afterDoublePress(before: ManageMode): ManageMode {
  return before === 'delete' ? 'none' : 'delete';
}
