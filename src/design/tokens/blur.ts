/** 模糊强度（px）。对应 Apple 材质的 ultraThin → chrome 五档。 */
export const blur = {
  ultraThin: 6,
  thin: 12,
  regular: 20,
  thick: 32,
  chrome: 48,
} as const;

export type BlurToken = keyof typeof blur;
