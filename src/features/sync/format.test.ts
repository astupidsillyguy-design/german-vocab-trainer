import { describe, expect, it } from 'vitest';
import { formatPairingCode, spokenDigits } from './format';
import { progressPercent } from './progress';

describe('formatPairingCode', () => {
  it('分成两组三位数字', () => {
    expect(formatPairingCode('123456')).toBe('123 456');
  });
});

describe('spokenDigits', () => {
  it('逐位朗读', () => {
    expect(spokenDigits('012345')).toBe('0 1 2 3 4 5');
  });
});

describe('progressPercent', () => {
  it('四舍五入到整数百分比', () => {
    expect(progressPercent({ done: 1, total: 3 })).toBe(33);
    expect(progressPercent({ done: 3, total: 3 })).toBe(100);
  });

  it('总量为 0 时为 0', () => {
    expect(progressPercent({ done: 0, total: 0 })).toBe(0);
  });
});
