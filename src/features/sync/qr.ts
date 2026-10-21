/**
 * 配对二维码（F-073）：用 uqr 编码，再把深色模块合并成 SVG 路径，由 React 以属性渲染
 * （不拼接 HTML，也不使用 innerHTML）。
 */
import { encode } from 'uqr';

/** 中等纠错：屏幕反光或部分遮挡时仍能识别，码也不会太密 */
const ERROR_CORRECTION = 'M';
/** 四周的静区（模块数）：放在白色卡片上时 2 个模块已足够相机识别 */
const QUIET_ZONE = 2;

export interface QrMatrix {
  /** 边长（模块数，含静区） */
  readonly size: number;
  /** 深色模块：每一行中连续的深色模块合并成一个矩形 */
  readonly path: string;
}

export function qrMatrix(text: string): QrMatrix {
  const { size, data } = encode(text, { ecc: ERROR_CORRECTION, border: QUIET_ZONE });
  const segments: string[] = [];
  data.forEach((row, y) => {
    let start = -1;
    row.forEach((isDark, x) => {
      if (isDark && start < 0) start = x;
      const isRunEnd = start >= 0 && (!isDark || x === row.length - 1);
      if (!isRunEnd) return;
      const end = isDark ? x + 1 : x;
      segments.push(`M${String(start)} ${String(y)}h${String(end - start)}v1H${String(start)}z`);
      start = -1;
    });
  });
  return { size, path: segments.join('') };
}
