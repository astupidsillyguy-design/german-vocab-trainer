import type { Locale } from '../locales';
import type { Messages } from './types';

export type { Messages } from './types';

type MessageLoader = () => Promise<Messages>;

/** 每种语言单独成块，用户只下载自己用的那一种；切换语言时再按需下载 */
const LOADERS = {
  'zh-CN': () => import('./zh-CN').then((module) => module.zhCN),
  en: () => import('./en').then((module) => module.en),
  de: () => import('./de').then((module) => module.de),
  ja: () => import('./ja').then((module) => module.ja),
} as const satisfies Record<Locale, MessageLoader>;

const loaded = new Map<Locale, Promise<Messages>>();

/** 加载某种语言的文案；同一语言只请求一次，失败后允许重试 */
export function loadMessages(locale: Locale): Promise<Messages> {
  const cached = loaded.get(locale);
  if (cached) return cached;
  const request = LOADERS[locale]();
  loaded.set(locale, request);
  request.catch(() => {
    loaded.delete(locale);
  });
  return request;
}

/** 下载全部语言，让之后切换语言即时完成；个别失败不影响其余 */
export function preloadMessages(): Promise<unknown> {
  return Promise.allSettled((Object.keys(LOADERS) as Locale[]).map(loadMessages));
}
