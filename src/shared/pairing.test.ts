import { describe, expect, it } from 'vitest';
import {
  isPairingCode,
  newPairingCode,
  normalizePairingInput,
  pairingQrText,
  readPairingLink,
  readScannedPairing,
} from './pairing';

/** 依次返回给定数值的“随机数”源 */
function sequence(...values: number[]): Pick<Crypto, 'getRandomValues'> {
  const queue = [...values];
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array instanceof Uint32Array) array[0] = queue.shift() ?? 0;
      return array;
    },
  };
}

describe('配对码', () => {
  it('只接受 6 位半角数字', () => {
    expect(isPairingCode('012345')).toBe(true);
    expect(isPairingCode('12345')).toBe(false);
    expect(isPairingCode('1234567')).toBe(false);
    expect(isPairingCode('12a456')).toBe(false);
    expect(isPairingCode('１２３４５６')).toBe(false);
  });

  it('生成 6 位数字，不足 6 位时补零', () => {
    expect(newPairingCode(sequence(42))).toBe('000042');
    expect(newPairingCode(sequence(4_000_123_456))).toBe('123456');
    for (let index = 0; index < 20; index += 1) expect(isPairingCode(newPairingCode())).toBe(true);
  });

  it('拒绝会造成取模偏差的随机数，重新抽取', () => {
    // 2^32 = 4294967296；4294000000 及以上的值会让 0 – 967295 出现得更频繁
    expect(newPairingCode(sequence(4_294_967_295, 4_294_000_000, 7))).toBe('000007');
  });

  it('输入时容忍全角数字、空格与连字符', () => {
    expect(normalizePairingInput(' 123 456 ')).toBe('123456');
    expect(normalizePairingInput('１２３-４５６')).toBe('123456');
    expect(normalizePairingInput('123－456')).toBe('123456');
    expect(normalizePairingInput('12a456')).toBe('12a456');
  });
});

describe('二维码与配对链接', () => {
  it('网页地址可访问时，二维码是带配对码的应用地址（去掉原有的查询与 hash）', () => {
    expect(pairingQrText('https://example.com/app/?x=1#/archive', '123456')).toBe(
      'https://example.com/app/?sync=123456',
    );
    expect(pairingQrText('http://192.168.1.2:5173/', '000001')).toBe(
      'http://192.168.1.2:5173/?sync=000001',
    );
  });

  it('本地文件或无法解析的地址只放配对码', () => {
    expect(pairingQrText('file:///Users/me/app/index.html', '123456')).toBe('123456');
    expect(pairingQrText('not a url', '123456')).toBe('123456');
  });

  it('解读扫描结果：应用地址、纯配对码、原版二维码、无关内容', () => {
    expect(readScannedPairing('https://example.com/?sync=654321')).toEqual({
      kind: 'code',
      code: '654321',
    });
    expect(readScannedPairing(' 654 321\n')).toEqual({ kind: 'code', code: '654321' });
    expect(readScannedPairing('DE_QUIZ_SYNC:123456')).toEqual({ kind: 'legacy' });
    expect(readScannedPairing('https://example.com/?sync=12')).toEqual({ kind: 'invalid' });
    expect(readScannedPairing('https://example.com/')).toEqual({ kind: 'invalid' });
    expect(readScannedPairing('hello')).toEqual({ kind: 'invalid' });
  });

  it('打开应用时读取地址中的配对码，并给出去掉参数后的地址（保留 hash 路由）', () => {
    expect(readPairingLink('https://example.com/app/?sync=123456&x=1#/archive')).toEqual({
      code: '123456',
      cleanUrl: 'https://example.com/app/?x=1#/archive',
    });
    expect(readPairingLink('https://example.com/?sync=123456')).toEqual({
      code: '123456',
      cleanUrl: 'https://example.com/',
    });
  });

  it('地址中没有或不是合法配对码时返回 null', () => {
    expect(readPairingLink('https://example.com/#/archive')).toBeNull();
    expect(readPairingLink('https://example.com/?sync=abc')).toBeNull();
    expect(readPairingLink('::')).toBeNull();
  });
});
