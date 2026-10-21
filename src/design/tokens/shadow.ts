/**
 * 阴影：每级由“环境光”+“主光源”两层叠加，模拟真实光照。
 */
export const shadow = {
  none: 'none',
  1: '0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 1px rgba(0, 0, 0, 0.04)',
  2: '0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)',
  3: '0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06)',
  4: '0 24px 64px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.08)',
  glass: '0 8px 32px rgba(36, 34, 120, 0.1), 0 2px 8px rgba(36, 34, 120, 0.06)',
} as const;

export type ShadowToken = keyof typeof shadow;
