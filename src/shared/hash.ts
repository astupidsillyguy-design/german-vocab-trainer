/**
 * 64 位非加密哈希（cyrb53 的双 32 位输出变体）：同步、极快，结果为 16 位十六进制字符串。
 * 用于内容指纹（去重）与同步数据的完整性校验；不能用于任何安全用途（可以被刻意构造碰撞）。
 * 在数万条目的规模下，偶然碰撞的概率可以忽略（约 10⁻¹¹）。
 */

const SEED_A = 0xdeadbeef;
const SEED_B = 0x41c6ce57;
const MULTIPLIER_A = 2654435761;
const MULTIPLIER_B = 1597334677;
const AVALANCHE_A = 2246822507;
const AVALANCHE_B = 3266489909;
const SHIFT_HIGH = 16;
const SHIFT_MIX = 13;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_WORD = 8;

export function hash64(text: string): string {
  let h1 = SEED_A;
  let h2 = SEED_B;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, MULTIPLIER_A);
    h2 = Math.imul(h2 ^ code, MULTIPLIER_B);
  }
  h1 = Math.imul(h1 ^ (h1 >>> SHIFT_HIGH), AVALANCHE_A);
  h1 ^= Math.imul(h2 ^ (h2 >>> SHIFT_MIX), AVALANCHE_B);
  h2 = Math.imul(h2 ^ (h2 >>> SHIFT_HIGH), AVALANCHE_A);
  h2 ^= Math.imul(h1 ^ (h1 >>> SHIFT_MIX), AVALANCHE_B);
  const word = (value: number): string =>
    (value >>> 0).toString(HEX_RADIX).padStart(HEX_DIGITS_PER_WORD, '0');
  return word(h2) + word(h1);
}
