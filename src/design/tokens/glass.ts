/**
 * Liquid Glass Token（阶段 4）。
 *
 * 同一组参数驱动三档渲染，档位由设备能力与系统偏好自动决定：
 * 1. WebGL：折射、色散、菲涅尔、方向高光、多 pass 高斯模糊、超椭圆 + smooth-min 形状融合；
 * 2. CSS：backdrop-filter 模糊；Chromium 额外用 SVG 位移贴图近似边缘折射；
 * 3. 不透明：沿用材质的 solid 颜色（降低透明度、增强对比度、强制颜色、浏览器不支持）。
 *
 * 着色、模糊、饱和度直接引用 `materials`，因此三档的文字对比度契约完全一致（见 tokens.test.ts）。
 */
import { withAlpha } from '../math/contrast.ts';
import { palette, type SemanticColorScheme } from './color.ts';
import type { MaterialToken } from './material.ts';

export interface GlassOptics {
  /** 着色、模糊、饱和度、描边所沿用的基础材质 */
  readonly material: MaterialToken;
  /** 覆盖材质着色（主色玻璃）；省略时使用材质自身的 tint */
  readonly tint?: string;
  /** `tint` 对应的不透明替代色（降低透明度时使用） */
  readonly solidTint?: string;
  /** 边缘弧面宽度（px）：折射、菲涅尔与高光只发生在这一圈 */
  readonly bezel: number;
  /** 弧面上的最大折射位移（px） */
  readonly refraction: number;
  /** 折射率：决定位移沿弧面的分布 */
  readonly ior: number;
  /** 色散：红、蓝通道相对绿色通道的位移差（0–1） */
  readonly dispersion: number;
  /** 菲涅尔边缘反射强度（0–1） */
  readonly fresnel: number;
  /** 方向高光强度（0–1） */
  readonly specular: number;
  /** 高光锐度（余弦指数，越大越集中） */
  readonly specularSharpness: number;
}

/** 根元素上记录当前玻璃档位的属性（GlassProvider 写入，生成的 CSS 据此切换不透明材质） */
export const GLASS_TIER_ATTRIBUTE = 'data-glass-tier';

/**
 * 主色玻璃的着色不透明度。着色取比主色深一级的 pressed：
 * 叠加指针高光峰值（12% 白）后，白字在最亮的背景上仍 ≥ 4.5:1（见 tokens.test.ts）。
 */
const PROMINENT_TINT_ALPHA = 0.92;

export const glassVariants = {
  /** 默认：承载正文的浮动卡片 */
  regular: {
    material: 'regular',
    bezel: 16,
    refraction: 14,
    ior: 1.5,
    dispersion: 0.18,
    fresnel: 0.32,
    specular: 0.5,
    specularSharpness: 6,
  },
  /** 通透：只承载图标或大号文字的浮动控件，折射更明显 */
  clear: {
    material: 'clear',
    bezel: 20,
    refraction: 22,
    ior: 1.52,
    dispersion: 0.28,
    fresnel: 0.45,
    specular: 0.65,
    specularSharpness: 8,
  },
  /** 主色：主要操作按钮（对应 SwiftUI 的 glassProminent） */
  prominent: {
    material: 'regular',
    tint: withAlpha(palette.indigo.pressed, PROMINENT_TINT_ALPHA),
    solidTint: palette.indigo.text,
    bezel: 14,
    refraction: 12,
    ior: 1.5,
    dispersion: 0.15,
    fresnel: 0.3,
    specular: 0.55,
    specularSharpness: 6,
  },
  /** 系统栏：Tab Bar、侧边栏（背后滚过任意内容，着色更厚） */
  chrome: {
    material: 'chrome',
    bezel: 14,
    refraction: 10,
    ior: 1.45,
    dispersion: 0.12,
    fresnel: 0.28,
    specular: 0.45,
    specularSharpness: 6,
  },
  /** 厚：Sheet 等需要强调层级的大面板 */
  thick: {
    material: 'thick',
    bezel: 18,
    refraction: 12,
    ior: 1.48,
    dispersion: 0.12,
    fresnel: 0.3,
    specular: 0.45,
    specularSharpness: 6,
  },
} as const satisfies Record<string, GlassOptics>;

export type GlassVariant = keyof typeof glassVariants;

/** 光照与指针高光。 */
export const glassLight = {
  /** 主光源方向（度）：0 = 右，顺时针为正，-135 = 左上方 */
  angleDeg: -135,
  /** 背光侧（右下）高光相对主光侧的强度 */
  backStrength: 0.35,
  /** 指针跟随高光的高斯半径（px） */
  pointerRadius: 140,
  /** 指针高光峰值：叠加白色的不透明度（计入主色玻璃的对比度校验） */
  pointerStrength: 0.12,
  /** 指针高光淡入淡出的时间常数（ms） */
  pointerEaseMs: 120,
} as const;

/**
 * WebGL 档的投影：由着色器根据形状的 SDF 直接绘制（融合后的形状投影也随之融合），
 * 因此该档关闭 CSS box-shadow。颜色与 `shadow.glass` 同源，观感一致。
 */
export const glassShadow = {
  /** 向下偏移（px） */
  offsetY: 8,
  /** 衰减距离（px）：从形状边缘到完全透明 */
  radius: 28,
  /** 紧贴边缘处的不透明度 */
  opacity: 0.12,
  color: 'rgb(36, 34, 120)',
} as const;

/** 玻璃画布向四周外扩的距离（px），用于容纳投影。 */
export const GLASS_CANVAS_BLEED = glassShadow.radius + glassShadow.offsetY;

/** 玻璃容器（对应 SwiftUI 的 GlassEffectContainer）。 */
export const glassGroup = {
  /** smooth-min 融合半径（px）：两块玻璃间距小于它时开始“粘连” */
  spacing: 24,
} as const;

type WallpaperColor = Exclude<keyof SemanticColorScheme['wallpaper'], 'base'>;

export interface WallpaperBlob {
  /** 语义色名（随外观切换） */
  readonly color: WallpaperColor;
  /** 初始中心（视口比例，0–1，左上为原点） */
  readonly x: number;
  readonly y: number;
  /** 半径（视口短边的比例） */
  readonly radius: number;
  /** 边缘柔和度：0 = 锐利，1 = 从中心开始渐隐 */
  readonly softness: number;
  /** 漂移幅度（视口比例） */
  readonly driftX: number;
  readonly driftY: number;
  /** 漂移周期（秒） */
  readonly periodS: number;
  /** 初始相位（弧度） */
  readonly phase: number;
}

/**
 * 动态壁纸：缓慢流动的柔和色块，是 WebGL 玻璃折射与模糊的采样源。
 * CSS 档用同一组参数生成静态渐变（即 t = 0 的画面），切换档位时画面不跳变。
 */
export const wallpaper = {
  blobs: [
    {
      color: 'stop1',
      x: 0.14,
      y: 0.1,
      radius: 0.62,
      softness: 0.6,
      driftX: 0.06,
      driftY: 0.05,
      periodS: 53,
      phase: 0,
    },
    {
      color: 'stop3',
      x: 0.9,
      y: 0.18,
      radius: 0.52,
      softness: 0.55,
      driftX: 0.05,
      driftY: 0.07,
      periodS: 61,
      phase: 1.3,
    },
    {
      color: 'stop2',
      x: 0.82,
      y: 0.9,
      radius: 0.56,
      softness: 0.55,
      driftX: 0.07,
      driftY: 0.04,
      periodS: 47,
      phase: 2.6,
    },
    {
      color: 'stop4',
      x: 0.1,
      y: 0.86,
      radius: 0.46,
      softness: 0.6,
      driftX: 0.05,
      driftY: 0.06,
      periodS: 67,
      phase: 4.1,
    },
    {
      color: 'stop1',
      x: 0.55,
      y: 0.48,
      radius: 0.3,
      softness: 0.35,
      driftX: 0.12,
      driftY: 0.1,
      periodS: 41,
      phase: 5.2,
    },
  ],
  /** 渲染分辨率相对视口的比例：色块本身很柔和，半分辨率再由浏览器放大肉眼无差 */
  renderScale: 0.5,
  /** 渲染纹理长边上限（px） */
  maxRenderEdge: 1024,
  /** 流动时的帧率上限：位移极慢，30fps 与 60fps 无可见差异，GPU 开销减半 */
  fps: 30,
  /** 无用户输入多久后冻结流动（ms），恢复输入时无缝继续 */
  idlePauseMs: 20_000,
  /** y 方向漂移周期相对 x 的倍数（取无理数比，轨迹不闭合，避免看出循环） */
  yPeriodRatio: 1.3819,
} as const satisfies {
  readonly blobs: readonly WallpaperBlob[];
  readonly [key: string]: unknown;
};
