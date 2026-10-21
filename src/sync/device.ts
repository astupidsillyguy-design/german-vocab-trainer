/**
 * 设备描述（如 “iPhone · Safari”）：连接后显示给对方，便于确认连上的是自己的设备。
 * 只取平台与浏览器名称，不包含版本号等可用于追踪的细节。
 */

export interface DeviceHints {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
}

/** 按顺序匹配：iPhone 的 UA 也含 “Mac OS X”，Android 的也含 “Linux” */
const PLATFORMS: readonly (readonly [RegExp, string])[] = [
  [/iPhone|iPod/u, 'iPhone'],
  [/iPad/u, 'iPad'],
  [/Android/u, 'Android'],
  [/CrOS/u, 'ChromeOS'],
  [/Windows/u, 'Windows'],
  [/Macintosh|Mac OS X/u, 'Mac'],
  [/Linux/u, 'Linux'],
];

/** Edge、Opera 的 UA 也含 “Chrome”，iOS 上的 Chrome 也含 “Safari” */
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg(?:e|A|iOS)?\//u, 'Edge'],
  [/OPR\/|Opera/u, 'Opera'],
  [/Firefox\/|FxiOS\//u, 'Firefox'],
  [/Chrome\/|CriOS\//u, 'Chrome'],
  [/Safari\//u, 'Safari'],
];

const SEPARATOR = ' · ';

function match(patterns: readonly (readonly [RegExp, string])[], text: string): string | null {
  return patterns.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function describeDevice({ userAgent, maxTouchPoints }: DeviceHints): string | null {
  let platform = match(PLATFORMS, userAgent);
  // iPadOS 默认以桌面版 Safari 的身份访问网页；有多点触控的 “Mac” 其实是 iPad
  if (platform === 'Mac' && maxTouchPoints > 1) platform = 'iPad';
  const parts = [platform, match(BROWSERS, userAgent)].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(SEPARATOR);
}
