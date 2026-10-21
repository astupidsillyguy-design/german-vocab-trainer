import { toast } from './toastQueue';

export interface CopyText {
  readonly done: string;
  readonly failed: string;
}

/** 复制到剪贴板并用通知告知结果（非安全上下文或权限被拒绝时失败） */
export async function copyToClipboard(content: string, text: CopyText): Promise<void> {
  try {
    await navigator.clipboard.writeText(content);
    toast.success({ title: text.done });
  } catch {
    toast.error({ title: text.failed });
  }
}
