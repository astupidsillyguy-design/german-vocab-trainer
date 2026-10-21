import { describe, expect, it } from 'vitest';
import { NATIVE_SQUIRCLE_RADIUS_SCALE } from '../../design/tokens';
import {
  downsampleVariance,
  effectiveSigma,
  gaussianKernel,
  MAX_BLUR_LEVEL,
  MAX_BLUR_TAPS,
  MIN_LEVEL_SIGMA,
  planBlur,
} from './blurPlan';
import { displacementMap, displacementScale } from './displacementMap';
import {
  bezelHeight,
  bezelProfile,
  bezelSlope,
  PROFILE_COMPONENTS,
  PROFILE_SIZE,
  sampleProfile,
} from './profile';
import {
  fieldDistance,
  lengthN,
  roundedBoxDistance,
  shapeGeometry,
  smoothUnion,
  type Rect,
} from './sdf';

const BOX: Rect = { x: 0, y: 0, width: 200, height: 100 };

describe('SDF', () => {
  it('胶囊形的半径恒为短边一半；超椭圆按 CSS corner-shape 换算并封顶', () => {
    expect(shapeGeometry(BOX, 8, 'capsule').radius).toBe(50);
    expect(shapeGeometry(BOX, 10, 'squircle').radius).toBeCloseTo(
      10 * NATIVE_SQUIRCLE_RADIUS_SCALE,
    );
    expect(shapeGeometry(BOX, 400, 'squircle').radius).toBe(50);
    expect(shapeGeometry({ x: 10, y: 20, width: 40, height: 60 }, 4, 'squircle')).toMatchObject({
      centerX: 30,
      centerY: 50,
      halfWidth: 20,
      halfHeight: 30,
    });
  });

  it('Lp 范数：p = 2 为欧氏长度，p 越大越接近 max', () => {
    expect(lengthN(3, 4, 2)).toBeCloseTo(5);
    expect(lengthN(1, 1, 4)).toBeLessThan(lengthN(1, 1, 2));
    expect(lengthN(1, 1, 4)).toBeGreaterThan(1);
  });

  it('内部为负、边上为 0、外部为正（单位 px）', () => {
    const shape = shapeGeometry(BOX, 12, 'squircle');
    expect(roundedBoxDistance(100, 50, shape)).toBeCloseTo(-50);
    expect(roundedBoxDistance(100, 0, shape)).toBeCloseTo(0);
    expect(roundedBoxDistance(100, -10, shape)).toBeCloseTo(10);
    expect(roundedBoxDistance(210, 50, shape)).toBeCloseTo(10);
  });

  it('角落：超椭圆比圆弧更“方”，同一点离边界更近', () => {
    const squircle = shapeGeometry(BOX, 20, 'squircle');
    const round = { ...squircle, exponent: 2 };
    const corner = { x: 4, y: 4 };
    expect(roundedBoxDistance(corner.x, corner.y, squircle)).toBeLessThan(
      roundedBoxDistance(corner.x, corner.y, round),
    );
  });

  it('smooth-min：k = 0 退化为普通并集；k > 0 时在两形状之间“粘连”', () => {
    expect(smoothUnion(3, 5, 0)).toEqual({ distance: 3, weight: 1 });
    expect(smoothUnion(5, 3, 0)).toEqual({ distance: 3, weight: 0 });
    const blended = smoothUnion(4, 4, 8);
    expect(blended.weight).toBeCloseTo(1 / 2);
    expect(blended.distance).toBeLessThan(4);
    // 距离差大于 k 时与普通并集一致
    expect(smoothUnion(1, 20, 8).distance).toBeCloseTo(1);
  });

  it('两块玻璃间隙小于融合半径时，间隙中点落入融合形状内部', () => {
    const left = shapeGeometry({ x: 0, y: 0, width: 100, height: 60 }, 16, 'squircle');
    const right = shapeGeometry({ x: 108, y: 0, width: 100, height: 60 }, 16, 'squircle');
    const gapCenter = { x: 104, y: 30 };
    expect(fieldDistance(gapCenter.x, gapCenter.y, [left, right], 0)).toBeCloseTo(4);
    expect(fieldDistance(gapCenter.x, gapCenter.y, [left, right], 24)).toBeLessThan(0);
    expect(fieldDistance(0, 0, [], 24)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('弧面剖面', () => {
  it('高度从 0 单调升到 1，斜率单调下降到 0', () => {
    expect(bezelHeight(0)).toBe(0);
    expect(bezelHeight(1)).toBe(1);
    expect(bezelSlope(1)).toBe(0);
    const steps = [0.1, 0.3, 0.5, 0.7, 0.9];
    steps.slice(1).forEach((t, index) => {
      const previous = steps[index] ?? 0;
      expect(bezelHeight(t)).toBeGreaterThan(bezelHeight(previous));
      expect(bezelSlope(t)).toBeLessThan(bezelSlope(previous));
    });
  });

  it('查找表：位移归一化到峰值 1，菲涅尔与倾斜从边缘向内衰减', () => {
    const profile = bezelProfile(1.5);
    expect(profile).toHaveLength(PROFILE_SIZE * PROFILE_COMPONENTS);
    const values = [...profile];
    expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    const displacements = values.filter((_, index) => index % PROFILE_COMPONENTS === 0);
    expect(Math.max(...displacements)).toBeCloseTo(1);
    const edge = sampleProfile(profile, 0);
    const inner = sampleProfile(profile, 1);
    expect(edge.fresnel).toBeGreaterThan(inner.fresnel);
    expect(edge.tilt).toBeGreaterThan(inner.tilt);
    expect(inner.displacement).toBeLessThan(1 / 2);
  });

  it('插值与查找表的中点约定一致，越界时夹取', () => {
    const profile = bezelProfile(1.5);
    const first = 1 / 2 / PROFILE_SIZE;
    expect(sampleProfile(profile, first).displacement).toBeCloseTo(profile[0] ?? Number.NaN);
    expect(sampleProfile(profile, -1)).toEqual(sampleProfile(profile, 0));
    expect(sampleProfile(profile, 2)).toEqual(sampleProfile(profile, 1));
  });

  it('折射率越高，未归一化前的位移越大，但归一化后形状相近', () => {
    const low = bezelProfile(1.2);
    const high = bezelProfile(1.8);
    expect(Math.abs((low[0] ?? 0) - (high[0] ?? 0))).toBeLessThan(1 / 2);
  });
});

describe('高斯模糊计划', () => {
  it('降采样方差：0 级为 0，逐级增加并收敛到 1/12（以当前层 texel 为单位）', () => {
    expect(downsampleVariance(0)).toBe(0);
    expect(downsampleVariance(1)).toBeCloseTo(0.0625);
    expect(downsampleVariance(MAX_BLUR_LEVEL)).toBeLessThan(1 / 12);
    expect(downsampleVariance(2)).toBeGreaterThan(downsampleVariance(1));
  });

  it('高斯核：权重归一化（中心 + 两侧），采样数不超过着色器数组', () => {
    for (const sigma of [0.5, 1, 2, 3.3]) {
      const kernel = gaussianKernel(sigma);
      expect(kernel.tapCount).toBeLessThanOrEqual(MAX_BLUR_TAPS);
      let total = kernel.weights[0] ?? 0;
      for (let index = 1; index < kernel.tapCount; index += 1)
        total += 2 * (kernel.weights[index] ?? 0);
      expect(total).toBeCloseTo(1, 5);
    }
    expect(gaussianKernel(0)).toMatchObject({ tapCount: 1 });
    expect(gaussianKernel(0).weights[0]).toBe(1);
  });

  it.each([2, 6, 12, 20, 30, 48])('σ = %spx：实际总模糊与目标误差 < 5%', (sigma) => {
    for (const scale of [0.5, 1, 2]) {
      const plan = planBlur(sigma, scale);
      expect(plan.level).toBeLessThanOrEqual(MAX_BLUR_LEVEL);
      expect(Math.abs(effectiveSigma(plan, scale) - sigma) / sigma).toBeLessThan(0.05);
    }
  });

  it('大半径先降采样（每层 σ 至少 1.5 texel），而非堆叠 pass', () => {
    const plan = planBlur(40, 1);
    expect(plan.level).toBeGreaterThan(0);
    expect(40 / 2 ** plan.level).toBeGreaterThanOrEqual(MIN_LEVEL_SIGMA);
    expect(plan.passes).toBeLessThanOrEqual(2);
    expect(planBlur(0, 1)).toMatchObject({ level: 0, passes: 0 });
  });
});

describe('SVG 位移贴图', () => {
  const options = {
    width: 120,
    height: 60,
    cornerRadius: 16,
    kind: 'squircle',
    bezel: 16,
    refraction: 14,
    ior: 1.5,
    scale: 0.5,
  } as const;

  function pixel(map: ReturnType<typeof displacementMap>, column: number, row: number) {
    const index = (row * map.width + column) * 4;
    return [...map.data.slice(index, index + 4)];
  }

  it('尺寸按缩放向上取整，至少 1 像素', () => {
    const map = displacementMap(options);
    expect([map.width, map.height]).toEqual([60, 30]);
    expect(map.data).toHaveLength(60 * 30 * 4);
    const tiny = displacementMap({ ...options, width: 0.2, height: 0.2 });
    expect([tiny.width, tiny.height]).toEqual([1, 1]);
  });

  it('平顶区域不偏移（128），边缘沿法线向内采样', () => {
    const map = displacementMap(options);
    expect(pixel(map, 30, 15)).toEqual([128, 128, 128, 255]);
    // 左边缘：向内（+x）采样 → R > 128；上边缘：向内（+y）→ G > 128
    const [leftR, leftG] = pixel(map, 0, 15);
    expect(leftR).toBeGreaterThan(128);
    expect(leftG).toBe(128);
    const [, topG] = pixel(map, 30, 0);
    expect(topG).toBeGreaterThan(128);
    const [rightR] = pixel(map, 59, 15);
    expect(rightR).toBeLessThan(128);
  });

  it('没有折射时整张贴图为中性色；scale 为最大位移的 2 倍', () => {
    const flat = displacementMap({ ...options, refraction: 0 });
    expect(
      [...flat.data].every((value, index) => (index % 4 === 3 ? value === 255 : value === 128)),
    ).toBe(true);
    expect(displacementScale(14)).toBe(28);
  });
});
