/**
 * 高斯模糊的执行计划：先降采样到合适的金字塔层级，再做若干次可分离高斯。
 *
 * 大半径模糊直接在全分辨率上做需要上百次采样；降采样 L 级后 σ 缩小 2^L 倍，
 * 再利用双线性过滤把相邻两个采样合并成一次（“线性采样”技巧），每个方向最多 6 次纹理读取。
 * 降采样本身（2×2 盒式滤波）也会引入少量模糊，计划中会扣除这部分方差，保证总 σ 准确。
 */

/** 金字塔最深层级 */
export const MAX_BLUR_LEVEL = 4;
/** 选择层级时要求该层上的 σ 至少有这么多 texel，否则双线性放大会出现块状伪影 */
export const MIN_LEVEL_SIGMA = 1.5;
/** 单次高斯 pass 的最大采样半径（texel） */
export const MAX_KERNEL_RADIUS = 10;
/** 着色器中的采样数组长度：中心 + 5 组线性合并采样 */
export const MAX_BLUR_TAPS = 6;
/** 高斯核截断在 3σ（覆盖 99.7% 的权重） */
const SIGMA_EXTENT = 3;
/** 单次 pass 能精确表示的最大 σ */
export const MAX_PASS_SIGMA = MAX_KERNEL_RADIUS / SIGMA_EXTENT;
/** 2×2 盒式降采样在“上一级 texel”单位下引入的方差（±0.5 的均匀分布） */
const BOX_DOWNSAMPLE_VARIANCE = 0.25;
const LEVEL_AREA_RATIO = 4;
const SIGMA_EPSILON = 1e-3;

export interface GaussianKernel {
  /** weights[0] 为中心权重，其余为两侧对称的合并采样权重 */
  readonly weights: Float32Array;
  /** 各合并采样相对中心的偏移（texel） */
  readonly offsets: Float32Array;
  readonly tapCount: number;
}

export interface BlurPlan {
  /** 金字塔层级：0 = 原始纹理 */
  readonly level: number;
  /** 可分离高斯 pass 数（每个 pass = 水平 + 垂直） */
  readonly passes: number;
  readonly kernel: GaussianKernel;
}

/** 降采样到 level 级累计引入的方差，以 level 级的 texel 为单位 */
export function downsampleVariance(level: number): number {
  const area = LEVEL_AREA_RATIO ** level;
  return (BOX_DOWNSAMPLE_VARIANCE * (area - 1)) / (LEVEL_AREA_RATIO - 1) / area;
}

/** 生成单 pass 高斯核，相邻采样两两合并（σ ≤ MAX_PASS_SIGMA） */
export function gaussianKernel(sigma: number): GaussianKernel {
  const weights = new Float32Array(MAX_BLUR_TAPS);
  const offsets = new Float32Array(MAX_BLUR_TAPS);
  if (sigma < SIGMA_EPSILON) {
    weights[0] = 1;
    return { weights, offsets, tapCount: 1 };
  }
  const radius = Math.min(Math.ceil(SIGMA_EXTENT * sigma), MAX_KERNEL_RADIUS);
  const discrete = Array.from({ length: radius + 2 }, (_, index) =>
    index > radius ? 0 : Math.exp(-(index * index) / (2 * sigma * sigma)),
  );
  const total = discrete.slice(1).reduce((sum, weight) => sum + 2 * weight, discrete[0] ?? 0);
  weights[0] = (discrete[0] ?? 0) / total;
  let tapCount = 1;
  for (let first = 1; first <= radius; first += 2) {
    const a = (discrete[first] ?? 0) / total;
    const b = (discrete[first + 1] ?? 0) / total;
    weights[tapCount] = a + b;
    offsets[tapCount] = (first * a + (first + 1) * b) / (a + b);
    tapCount += 1;
  }
  return { weights, offsets, tapCount };
}

/**
 * @param sigmaCss CSS `blur()` 的参数（px）
 * @param textureScale 纹理像素 / CSS px（例如半分辨率壁纸为 0.5）
 */
export function planBlur(sigmaCss: number, textureScale: number): BlurPlan {
  const sigmaTexture = sigmaCss * textureScale;
  let level = 0;
  while (level < MAX_BLUR_LEVEL && sigmaTexture / 2 ** (level + 1) >= MIN_LEVEL_SIGMA) level += 1;
  const sigmaLevel = sigmaTexture / 2 ** level;
  const remaining = Math.max(sigmaLevel * sigmaLevel - downsampleVariance(level), 0);
  if (remaining < SIGMA_EPSILON) return { level, passes: 0, kernel: gaussianKernel(0) };
  const passes = Math.ceil(remaining / (MAX_PASS_SIGMA * MAX_PASS_SIGMA));
  return { level, passes, kernel: gaussianKernel(Math.sqrt(remaining / passes)) };
}

/** 计划实际实现的总 σ（CSS px），用于测试验证 */
export function effectiveSigma(plan: BlurPlan, textureScale: number): number {
  let kernelVariance = 0;
  for (let index = 1; index < plan.kernel.tapCount; index += 1) {
    const weight = plan.kernel.weights[index] ?? 0;
    const offset = plan.kernel.offsets[index] ?? 0;
    // 双线性采样把合并权重按小数部分还原到相邻两个 texel 上
    const lower = Math.floor(offset);
    const fraction = offset - lower;
    kernelVariance +=
      2 * weight * ((1 - fraction) * lower * lower + fraction * (lower + 1) * (lower + 1));
  }
  const levelVariance = downsampleVariance(plan.level) + plan.passes * kernelVariance;
  return (Math.sqrt(levelVariance) * 2 ** plan.level) / textureScale;
}
