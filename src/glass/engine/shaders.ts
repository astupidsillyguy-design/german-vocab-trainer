/**
 * GLSL ES 3.0 着色器。所有 pass 共用一个“全屏三角形”顶点着色器（无顶点属性，按 gl_VertexID 生成）。
 * 数组长度等上限由 TS 常量注入，保证 JS 侧填充的数据与着色器声明一致。
 * 每个程序的 uniform 名单单独导出，由单元测试与源码中的声明逐一比对。
 */
import { MAX_BLUR_TAPS } from '../math/blurPlan';
import { PROFILE_SIZE } from '../math/profile';

/** 每个玻璃组最多参与融合的形状数 */
export const MAX_SHAPES = 8;
/** 壁纸色块上限 */
export const MAX_BLOBS = 6;

export const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** 动态壁纸：与 src/design/math/wallpaper.ts 的 blobMask 及 CSS 渐变完全一致 */
export const WALLPAPER_SHADER = `#version 300 es
precision highp float;
#define MAX_BLOBS ${String(MAX_BLOBS)}
uniform vec2 u_resolution;
uniform vec3 u_base;
uniform int u_blobCount;
uniform vec4 u_blobs[MAX_BLOBS];
uniform vec3 u_colors[MAX_BLOBS];
out vec4 outColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float shortEdge = min(u_resolution.x, u_resolution.y);
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 point = vec2(uv.x, 1.0 - uv.y) * u_resolution / shortEdge;
  vec3 color = u_base;
  for (int i = 0; i < MAX_BLOBS; i++) {
    if (i >= u_blobCount) break;
    vec4 blob = u_blobs[i];
    vec2 center = blob.xy * u_resolution / shortEdge;
    float mask = 1.0 - smoothstep(blob.z * (1.0 - blob.w), blob.z, distance(point, center));
    color = mix(color, u_colors[i], mask);
  }
  color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}
`;

/** 拷贝；输出尺寸为输入一半时，双线性采样恰好等于 2×2 盒式降采样 */
export const COPY_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_outputSize;
out vec4 outColor;

void main() {
  outColor = texture(u_source, gl_FragCoord.xy / u_outputSize);
}
`;

/** 可分离高斯（线性采样：每次读取合并相邻两个 texel） */
export const BLUR_SHADER = `#version 300 es
precision highp float;
#define MAX_TAPS ${String(MAX_BLUR_TAPS)}
uniform sampler2D u_source;
uniform vec2 u_texel;
uniform vec2 u_direction;
uniform int u_tapCount;
uniform float u_weights[MAX_TAPS];
uniform float u_offsets[MAX_TAPS];
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 color = texture(u_source, uv) * u_weights[0];
  for (int i = 1; i < MAX_TAPS; i++) {
    if (i >= u_tapCount) break;
    vec2 offset = u_direction * u_offsets[i] * u_texel;
    color += (texture(u_source, uv + offset) + texture(u_source, uv - offset)) * u_weights[i];
  }
  outColor = color;
}
`;

/**
 * 玻璃：超椭圆 SDF + smooth-min 融合 → 弧面折射（含色散）→ 饱和度 → 着色 → 菲涅尔 →
 * 方向高光 → 指针高光 → 描边 → 投影。坐标单位为 CSS px，y 轴向下；输出预乘 alpha。
 */
export const GLASS_SHADER = `#version 300 es
precision highp float;
#define MAX_SHAPES ${String(MAX_SHAPES)}
#define PROFILE_SIZE ${String(PROFILE_SIZE)}
uniform sampler2D u_backdrop;
uniform vec2 u_viewport;
uniform vec2 u_origin;
uniform float u_canvasHeight;
uniform float u_pixelRatio;
uniform int u_shapeCount;
uniform vec4 u_shapes[MAX_SHAPES];
uniform vec2 u_corners[MAX_SHAPES];
uniform vec4 u_tints[MAX_SHAPES];
uniform float u_spacing;
uniform float u_bezel;
uniform float u_refraction;
uniform float u_dispersion;
uniform float u_fresnel;
uniform float u_specular;
uniform float u_sharpness;
uniform float u_saturation;
uniform vec4 u_rim;
uniform vec2 u_light;
uniform float u_backLight;
uniform vec3 u_pointer;
uniform float u_pointerRadius;
uniform vec3 u_shadow;
uniform vec3 u_shadowColor;
uniform vec3 u_profile[PROFILE_SIZE];
out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float RIM_WIDTH = 0.5;
const float NORMAL_STEP = 0.5;

float lengthN(vec2 v, float n) {
  return pow(pow(v.x, n) + pow(v.y, n), 1.0 / n);
}

float roundedBox(vec2 p, vec4 shape, vec2 corner) {
  vec2 q = abs(p - shape.xy) - shape.zw + corner.x;
  return lengthN(max(q, 0.0), corner.y) + min(max(q.x, q.y), 0.0) - corner.x;
}

float field(vec2 p, out vec4 tint) {
  float d = roundedBox(p, u_shapes[0], u_corners[0]);
  tint = u_tints[0];
  float k = max(u_spacing, 1e-4);
  for (int i = 1; i < MAX_SHAPES; i++) {
    if (i >= u_shapeCount) break;
    float next = roundedBox(p, u_shapes[i], u_corners[i]);
    float h = clamp(0.5 + 0.5 * (d - next) / k, 0.0, 1.0);
    d = mix(d, next, h) - k * h * (1.0 - h);
    tint = mix(tint, u_tints[i], h);
  }
  return d;
}

float fieldDistance(vec2 p) {
  vec4 unused;
  return field(p, unused);
}

vec3 profileAt(float t) {
  float position = clamp(t * float(PROFILE_SIZE) - 0.5, 0.0, float(PROFILE_SIZE - 1));
  int lower = int(floor(position));
  int upper = min(lower + 1, PROFILE_SIZE - 1);
  return mix(u_profile[lower], u_profile[upper], position - float(lower));
}

vec3 backdrop(vec2 point) {
  vec2 uv = point / u_viewport;
  return texture(u_backdrop, vec2(uv.x, 1.0 - uv.y)).rgb;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_canvasHeight - gl_FragCoord.y) / u_pixelRatio;
  vec4 tint;
  float d = field(p, tint);
  float aa = max(fwidth(d), 1e-3);
  float coverage = clamp(0.5 - d / aa, 0.0, 1.0);

  float shadowFalloff = 1.0 - clamp(fieldDistance(p - vec2(0.0, u_shadow.x)) / u_shadow.y, 0.0, 1.0);
  float shadowAlpha = u_shadow.z * shadowFalloff * shadowFalloff;
  vec4 shadow = vec4(u_shadowColor * shadowAlpha, shadowAlpha);
  if (coverage <= 0.0) {
    outColor = shadow;
    return;
  }

  float t = clamp(-d / u_bezel, 0.0, 1.0);
  vec3 profile = vec3(0.0);
  vec2 normal = vec2(0.0);
  if (t < 1.0) {
    profile = profileAt(t);
    vec2 gradient = vec2(
      fieldDistance(p + vec2(NORMAL_STEP, 0.0)) - fieldDistance(p - vec2(NORMAL_STEP, 0.0)),
      fieldDistance(p + vec2(0.0, NORMAL_STEP)) - fieldDistance(p - vec2(0.0, NORMAL_STEP)));
    float gradientLength = length(gradient);
    normal = gradientLength > 1e-5 ? gradient / gradientLength : vec2(0.0);
  }

  vec2 offset = -normal * profile.x * u_refraction;
  vec2 point = u_origin + p;
  vec3 color = vec3(
    backdrop(point + offset * (1.0 - u_dispersion)).r,
    backdrop(point + offset).g,
    backdrop(point + offset * (1.0 + u_dispersion)).b);
  color = clamp(mix(vec3(dot(color, LUMA)), color, u_saturation), 0.0, 1.0);
  color = tint.rgb + color * (1.0 - tint.a);
  color = mix(color, vec3(1.0), profile.y * u_fresnel);

  float lit = pow(max(dot(normal, u_light), 0.0), u_sharpness);
  float back = pow(max(dot(normal, -u_light), 0.0), u_sharpness) * u_backLight;
  color += (lit + back) * profile.z * u_specular;

  vec2 toPointer = p - u_pointer.xy;
  float pointer = u_pointer.z * exp(-2.0 * dot(toPointer, toPointer) / (u_pointerRadius * u_pointerRadius));
  color = mix(color, vec3(1.0), pointer);

  float rim = clamp((d + RIM_WIDTH) / aa + 0.5, 0.0, 1.0) * u_rim.a;
  color = mix(color, u_rim.rgb / max(u_rim.a, 1e-3), rim);

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0) * coverage + shadow * (1.0 - coverage);
}
`;

export const WALLPAPER_UNIFORMS = [
  'u_resolution',
  'u_base',
  'u_blobCount',
  'u_blobs',
  'u_colors',
] as const;

export const COPY_UNIFORMS = ['u_source', 'u_outputSize'] as const;

export const BLUR_UNIFORMS = [
  'u_source',
  'u_texel',
  'u_direction',
  'u_tapCount',
  'u_weights',
  'u_offsets',
] as const;

export const GLASS_UNIFORMS = [
  'u_backdrop',
  'u_viewport',
  'u_origin',
  'u_canvasHeight',
  'u_pixelRatio',
  'u_shapeCount',
  'u_shapes',
  'u_corners',
  'u_tints',
  'u_spacing',
  'u_bezel',
  'u_refraction',
  'u_dispersion',
  'u_fresnel',
  'u_specular',
  'u_sharpness',
  'u_saturation',
  'u_rim',
  'u_light',
  'u_backLight',
  'u_pointer',
  'u_pointerRadius',
  'u_shadow',
  'u_shadowColor',
  'u_profile',
] as const;
