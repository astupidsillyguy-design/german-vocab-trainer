/**
 * 测试用文案：同步取得任意语言的文案（应用本身按需下载，测试里一次性引入全部）。
 */
import type { Locale } from '../i18n';
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import { ja } from '../i18n/messages/ja';
import type { Messages } from '../i18n/messages/types';
import { zhCN } from '../i18n/messages/zh-CN';

export const catalogs: Record<Locale, Messages> = {
  'zh-CN': zhCN,
  en,
  de,
  ja,
};
