import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, encodePng } from './png.ts';

const SIGNATURE_LENGTH = 8;
const CHUNK_OVERHEAD = 12;

interface Chunk {
  readonly type: string;
  readonly data: Buffer;
  readonly crc: number;
  readonly crcOf: Buffer;
}

function readChunks(png: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = SIGNATURE_LENGTH;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const body = png.subarray(offset + 4, offset + 8 + length);
    chunks.push({
      type: body.subarray(0, 4).toString('ascii'),
      data: body.subarray(4),
      crc: png.readUInt32BE(offset + 8 + length),
      crcOf: body,
    });
    offset += length + CHUNK_OVERHEAD;
  }
  return chunks;
}

describe('crc32', () => {
  it('与标准测试向量一致', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('encodePng', () => {
  const rgba = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
  ]);
  const png = encodePng(3, 2, rgba);

  it('有 PNG 签名，块的顺序与校验值都正确', () => {
    expect([...png.subarray(0, SIGNATURE_LENGTH)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const chunks = readChunks(png);
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    for (const chunk of chunks) expect(chunk.crc).toBe(crc32(chunk.crcOf));
  });

  it('文件头记录宽高与 8 位 RGBA', () => {
    const header = readChunks(png)[0]?.data;
    expect(header?.readUInt32BE(0)).toBe(3);
    expect(header?.readUInt32BE(4)).toBe(2);
    expect([header?.[8], header?.[9]]).toEqual([8, 6]);
  });

  it('解压后每行以滤波字节 0 开头，像素原样保存', () => {
    const idat = readChunks(png)[1]?.data;
    if (idat === undefined) throw new Error('缺少 IDAT');
    const raw = inflateSync(idat);
    const rowBytes = 3 * 4;
    expect(raw).toHaveLength((rowBytes + 1) * 2);
    expect(raw[0]).toBe(0);
    expect([...raw.subarray(1, rowBytes + 1)]).toEqual([...rgba.subarray(0, rowBytes)]);
    expect([...raw.subarray(rowBytes + 2)]).toEqual([...rgba.subarray(rowBytes)]);
  });

  it('像素数据与尺寸不符时报错', () => {
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(/不一致/);
  });
});
