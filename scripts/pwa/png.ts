import { deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BYTES_PER_PIXEL = 4;
const BIT_DEPTH = 8;
const COLOR_TYPE_RGBA = 6;
const FILTER_NONE = 0;
const CRC_TABLE_SIZE = 256;
const CRC_BITS = 8;
const CRC_POLYNOMIAL = 0xedb88320;
const UINT32_MASK = 0xffffffff;

const CRC_TABLE = Uint32Array.from({ length: CRC_TABLE_SIZE }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < CRC_BITS; bit += 1) {
    value = value & 1 ? CRC_POLYNOMIAL ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

/** PNG 使用的 CRC-32（与 zlib 的 crc32 相同） */
export function crc32(data: Uint8Array): number {
  let crc = UINT32_MASK;
  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & (CRC_TABLE_SIZE - 1)] ?? 0) ^ (crc >>> CRC_BITS);
  }
  return (crc ^ UINT32_MASK) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** 把 RGBA 像素（每像素 4 字节，非预乘）编码为 PNG */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const rowBytes = width * BYTES_PER_PIXEL;
  if (rgba.length !== rowBytes * height) throw new Error('像素数据与尺寸不一致');

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = BIT_DEPTH;
  header[9] = COLOR_TYPE_RGBA;
  // 压缩方式、滤波方式、隔行扫描：均为 0

  const scanlines = Buffer.alloc((rowBytes + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const offset = row * (rowBytes + 1);
    scanlines[offset] = FILTER_NONE;
    scanlines.set(rgba.subarray(row * rowBytes, (row + 1) * rowBytes), offset + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
