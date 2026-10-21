import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { pairingQrText } from '../../shared/pairing';
import { qrMatrix, type QrMatrix } from './qr';

const MODULE_PIXELS = 4;
const CHANNELS = 4;
const DARK = 0;
const LIGHT = 255;

/** 取出路径段 `M{x} {y}h{length}` 的三个整数；捕获组只匹配数字，缺失说明路径格式变了 */
function pathSegment(match: RegExpMatchArray): readonly [number, number, number] {
  const [, x = '', y = '', length = ''] = match;
  return [Number(x), Number(y), Number(length)];
}

/** 把 SVG 路径栅格化成 RGBA 位图，再交给与扫描器相同的解码库 */
function rasterize({ size, path }: QrMatrix): { data: Uint8ClampedArray; width: number } {
  const width = size * MODULE_PIXELS;
  const data = new Uint8ClampedArray(width * width * CHANNELS).fill(LIGHT);
  for (const match of path.matchAll(/M(\d+) (\d+)h(\d+)v1H\d+z/gu)) {
    const [x, y, length] = pathSegment(match);
    for (let row = y * MODULE_PIXELS; row < (y + 1) * MODULE_PIXELS; row += 1) {
      for (let column = x * MODULE_PIXELS; column < (x + length) * MODULE_PIXELS; column += 1) {
        const offset = (row * width + column) * CHANNELS;
        data.fill(DARK, offset, offset + CHANNELS - 1);
      }
    }
  }
  return { data, width };
}

function decode(matrix: QrMatrix): string | undefined {
  const { data, width } = rasterize(matrix);
  return jsQR(data, width, width)?.data;
}

describe('qrMatrix', () => {
  it('生成可被扫描器识别的配对二维码', () => {
    const text = pairingQrText('https://example.com/app/?lang=de#/archive', '123456');
    expect(decode(qrMatrix(text))).toBe(text);
  });

  it('只描述深色模块，路径只有整数坐标', () => {
    const { size, path } = qrMatrix('123456');
    expect(Number.isInteger(size)).toBe(true);
    expect(path).toMatch(/^(M\d+ \d+h\d+v1H\d+z)+$/u);
  });

  it('同一行连续的深色模块合并成一段（含行尾）', () => {
    const { size, path } = qrMatrix('123456');
    const segments = [...path.matchAll(/M(\d+) (\d+)h(\d+)/gu)].map(pathSegment);
    // 定位图案（7 个模块）的上边是一整段
    expect(segments).toContainEqual([2, 2, 7]);
    expect(segments).toContainEqual([size - 2 - 7, 2, 7]);
    for (const [x, , length] of segments) expect(x + length).toBeLessThanOrEqual(size - 2);
  });
});
