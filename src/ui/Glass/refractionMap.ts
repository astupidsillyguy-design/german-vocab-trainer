/**
 * 把位移贴图编码成 PNG data URL（供 SVG feImage 引用），按尺寸与参数缓存。
 */
import { displacementMap, type DisplacementMapOptions } from '../../glass';

/** 缓存上限：页面上同时存在的折射元素通常不超过十几个 */
const CACHE_LIMIT = 32;
const cache = new Map<string, string>();

function cacheKey(options: DisplacementMapOptions): string {
  return [
    options.width,
    options.height,
    options.cornerRadius,
    options.kind,
    options.bezel,
    options.refraction,
    options.ior,
    options.scale,
  ].join('|');
}

/** 浏览器不支持 2D canvas 时返回 null（调用方退回纯模糊） */
export function refractionMapUrl(options: DisplacementMapOptions): string | null {
  const key = cacheKey(options);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (context === null) return null;
  const map = displacementMap(options);
  canvas.width = map.width;
  canvas.height = map.height;
  context.putImageData(new ImageData(map.data, map.width, map.height), 0, 0);
  const url = canvas.toDataURL('image/png');
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done !== true) cache.delete(oldest.value);
  }
  cache.set(key, url);
  return url;
}

export function clearRefractionMapCache(): void {
  cache.clear();
}
