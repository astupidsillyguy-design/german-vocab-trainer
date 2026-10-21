/**
 * 边缘弧面（bezel）的光学剖面：把“玻璃边缘是一段凸起的超椭圆弧面”这一几何假设，
 * 换算成着色器查表用的三条曲线（位移、菲涅尔反射、表面倾斜）。
 *
 * 坐标：t ∈ [0, 1]，0 = 外边缘，1 = 弧面内侧（此后为平顶，不再折射）。
 * 视线垂直于屏幕射入，在弧面上按斯涅尔定律折射，偏折后的光线穿过厚度 h(t) 的玻璃，
 * 落点相对入射点的水平偏移即为“折射位移”。
 */

/** 查找表长度：32 个采样点在 16–20px 的弧面上已经低于 1px 的分辨率 */
export const PROFILE_SIZE = 32;
/** 每个采样点的分量：位移、菲涅尔、倾斜 */
export const PROFILE_COMPONENTS = 3;
/** 弧面剖面的超椭圆指数：越大，边缘越陡、平顶越宽 */
const BEZEL_EXPONENT = 4;
/** 菲涅尔近似（Schlick）的指数 */
const SCHLICK_EXPONENT = 5;

/** 弧面高度：h(t) = (1 − (1 − t)^n)^(1/n)，t = 0 时为 0，t = 1 时为 1 */
export function bezelHeight(t: number): number {
  return (1 - (1 - t) ** BEZEL_EXPONENT) ** (1 / BEZEL_EXPONENT);
}

/** 弧面斜率 dh/dt；t → 0 时趋于无穷（边缘近乎竖直） */
export function bezelSlope(t: number): number {
  const inner = 1 - (1 - t) ** BEZEL_EXPONENT;
  return (1 - t) ** (BEZEL_EXPONENT - 1) / inner ** ((BEZEL_EXPONENT - 1) / BEZEL_EXPONENT);
}

export interface ProfileSample {
  /** 归一化折射位移（0–1，最大值为 1） */
  readonly displacement: number;
  /** 归一化菲涅尔反射：(1 − cos θ)^5，边缘接近 1 */
  readonly fresnel: number;
  /** 表面倾斜 sin θ：方向高光的强度系数 */
  readonly tilt: number;
}

/** 在 t 处的未归一化光学量 */
function sampleAt(t: number, ior: number): ProfileSample {
  const incidence = Math.atan(bezelSlope(t));
  const refracted = Math.asin(Math.sin(incidence) / ior);
  return {
    displacement: bezelHeight(t) * Math.tan(incidence - refracted),
    fresnel: (1 - Math.cos(incidence)) ** SCHLICK_EXPONENT,
    tilt: Math.sin(incidence),
  };
}

/**
 * 生成查找表（交错存放：[位移, 菲涅尔, 倾斜] × PROFILE_SIZE）。
 * 采样点取各区间中点，避开 t = 0 处的无穷斜率；着色器按同样的中点约定插值。
 */
export function bezelProfile(ior: number, size: number = PROFILE_SIZE): Float32Array {
  const samples = Array.from({ length: size }, (_, index) => sampleAt((index + 1 / 2) / size, ior));
  const maxDisplacement = Math.max(...samples.map((sample) => sample.displacement));
  const out = new Float32Array(size * PROFILE_COMPONENTS);
  samples.forEach((sample, index) => {
    const offset = index * PROFILE_COMPONENTS;
    out[offset] = maxDisplacement > 0 ? sample.displacement / maxDisplacement : 0;
    out[offset + 1] = sample.fresnel;
    out[offset + 2] = sample.tilt;
  });
  return out;
}

/** 按着色器相同的方式在查找表中线性插值（t ∈ [0, 1]） */
export function sampleProfile(profile: Float32Array, t: number): ProfileSample {
  const size = profile.length / PROFILE_COMPONENTS;
  const position = Math.min(Math.max(t * size - 1 / 2, 0), size - 1);
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, size - 1);
  const fraction = position - lower;
  const read = (index: number, component: number): number =>
    profile[index * PROFILE_COMPONENTS + component] ?? 0;
  const lerp = (component: number): number =>
    read(lower, component) + (read(upper, component) - read(lower, component)) * fraction;
  return { displacement: lerp(0), fresnel: lerp(1), tilt: lerp(2) };
}
