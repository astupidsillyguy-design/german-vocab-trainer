/**
 * 把编辑器的光标定位到某一行并选中整行（点击预览中有问题的行时使用）。
 *
 * 文本框会自动换行，行号无法直接换算成像素位置。这里用一个看不见的“镜像”文本框：
 * 复制会影响排版的样式，填入目标行之前的文字，读出内容高度，就是目标行顶部的位置。
 */

/** 影响文字排版、因而影响行位置的样式 */
const LAYOUT_PROPERTIES = [
  'box-sizing',
  'inline-size',
  'padding-block-start',
  'padding-block-end',
  'padding-inline-start',
  'padding-inline-end',
  'border-block-start-width',
  'border-block-end-width',
  'border-inline-start-width',
  'border-inline-end-width',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'line-height',
  'tab-size',
  'text-transform',
  'white-space',
  'word-break',
  'overflow-wrap',
  'word-spacing',
] as const;

/** 占位字符：让镜像文本框显示出目标行的第一行，以便测出它的位置 */
const PROBE = 'x';
const HALF = 2;

/** 文字偏移 offset 所在视觉行的顶部，相对于文本框内容区顶部（含上内边距） */
function lineTop(textarea: HTMLTextAreaElement, offset: number, lineHeight: number): number {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('textarea');
  for (const property of LAYOUT_PROPERTIES) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  mirror.style.setProperty('position', 'absolute');
  mirror.style.setProperty('visibility', 'hidden');
  mirror.style.setProperty('block-size', '0');
  mirror.style.setProperty('min-block-size', '0');
  mirror.style.setProperty('overflow', 'hidden');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.tabIndex = -1;
  mirror.value = textarea.value.slice(0, offset) + PROBE;
  document.body.append(mirror);
  const paddingEnd = Number.parseFloat(style.paddingBottom) || 0;
  const top = mirror.scrollHeight - paddingEnd - lineHeight;
  mirror.remove();
  return Math.max(0, top);
}

function lineHeightOf(textarea: HTMLTextAreaElement): number {
  const style = getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(style.lineHeight);
  return Number.isFinite(lineHeight) ? lineHeight : Number.parseFloat(style.fontSize) || 0;
}

export interface LineRange {
  readonly start: number;
  readonly end: number;
}

export interface LocateOptions {
  /** 页面滚动是否使用平滑动画（减少动态效果时为否） */
  readonly smooth: boolean;
}

/** 选中 range 对应的文字，并把它滚到文本框中部；文本框本身也滚入视口 */
export function selectRange(
  textarea: HTMLTextAreaElement,
  { start, end }: LineRange,
  { smooth }: LocateOptions,
): void {
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(start, end);
  const lineHeight = lineHeightOf(textarea);
  const top = lineTop(textarea, start, lineHeight);
  textarea.scrollTop = Math.max(0, top - (textarea.clientHeight - lineHeight) / HALF);
  textarea.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
}
