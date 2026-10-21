import { describe, expect, it } from 'vitest';
import { describeDevice } from './device';

const USER_AGENTS = {
  iPhoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iPhoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
} as const;

describe('设备描述', () => {
  it('识别平台与浏览器，不含版本号', () => {
    expect(describeDevice({ userAgent: USER_AGENTS.iPhoneSafari, maxTouchPoints: 5 })).toBe(
      'iPhone · Safari',
    );
    expect(describeDevice({ userAgent: USER_AGENTS.iPhoneChrome, maxTouchPoints: 5 })).toBe(
      'iPhone · Chrome',
    );
    expect(describeDevice({ userAgent: USER_AGENTS.androidChrome, maxTouchPoints: 5 })).toBe(
      'Android · Chrome',
    );
    expect(describeDevice({ userAgent: USER_AGENTS.windowsEdge, maxTouchPoints: 0 })).toBe(
      'Windows · Edge',
    );
    expect(describeDevice({ userAgent: USER_AGENTS.linuxFirefox, maxTouchPoints: 0 })).toBe(
      'Linux · Firefox',
    );
  });

  it('有多点触控的 “Mac” 是 iPad', () => {
    expect(describeDevice({ userAgent: USER_AGENTS.macSafari, maxTouchPoints: 0 })).toBe(
      'Mac · Safari',
    );
    expect(describeDevice({ userAgent: USER_AGENTS.macSafari, maxTouchPoints: 5 })).toBe(
      'iPad · Safari',
    );
  });

  it('无法识别时返回 null', () => {
    expect(describeDevice({ userAgent: 'curl/8.0', maxTouchPoints: 0 })).toBeNull();
    expect(describeDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0 })).toBe(
      'Windows',
    );
  });
});
