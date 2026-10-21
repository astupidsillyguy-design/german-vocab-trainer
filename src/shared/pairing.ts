/**
 * 配对码（F-071 – F-073）：6 位数字，用随机数的拒绝采样生成（没有取模偏差）。
 * 二维码中是带配对码的应用地址：用系统相机扫描也能直接打开应用并填好配对码。
 *
 * 放在 src/shared 而不是 src/sync：首屏的 SyncProvider 只需要读取地址中的配对码，
 * 经由 src/sync 的入口导入会把 MQTT 与直连等传输层代码一起带进首屏包。
 */

export const PAIRING_CODE_LENGTH = 6;
/** 打开应用时地址中携带配对码的查询参数 */
export const PAIRING_LINK_PARAM = 'sync';

const PAIRING_CODE_PATTERN = /^\d{6}$/u;
const DECIMAL_BASE = 10;
const CODE_SPACE = DECIMAL_BASE ** PAIRING_CODE_LENGTH;
const UINT32_RANGE = 0x1_0000_0000;
/** 小于它的随机数对 CODE_SPACE 取模后均匀分布 */
const UNBIASED_LIMIT = UINT32_RANGE - (UINT32_RANGE % CODE_SPACE);
/** 全角数字（０-９）与半角数字的码位差 */
const FULL_WIDTH_OFFSET = 0xfee0;
/** 原版二维码的内容前缀（新版无法与原版同步） */
const LEGACY_PREFIX = 'DE_QUIZ_SYNC:';

export function isPairingCode(value: string): boolean {
  return PAIRING_CODE_PATTERN.test(value);
}

export function newPairingCode(
  random: Pick<Crypto, 'getRandomValues'> = globalThis.crypto,
): string {
  const buffer = new Uint32Array(1);
  for (;;) {
    random.getRandomValues(buffer);
    const value = buffer[0] ?? UNBIASED_LIMIT;
    if (value < UNBIASED_LIMIT) {
      return String(value % CODE_SPACE).padStart(PAIRING_CODE_LENGTH, '0');
    }
  }
}

/** 用户输入的配对码：全角数字换成半角，去掉空白与连字符（“123 456”“１２３-４５６”） */
export function normalizePairingInput(input: string): string {
  return input
    .replace(/[\uff10-\uff19]/gu, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - FULL_WIDTH_OFFSET),
    )
    .replace(/[\s\-\u2010-\u2015\u30fc\uff0d]/gu, '');
}

export type ScannedPairing =
  | { readonly kind: 'code'; readonly code: string }
  /** 原版应用的二维码 */
  | { readonly kind: 'legacy' }
  | { readonly kind: 'invalid' };

/** 解读扫描到的二维码：应用地址、纯配对码，或原版的二维码 */
export function readScannedPairing(text: string): ScannedPairing {
  const trimmed = text.trim();
  if (trimmed.startsWith(LEGACY_PREFIX)) return { kind: 'legacy' };
  const direct = normalizePairingInput(trimmed);
  if (isPairingCode(direct)) return { kind: 'code', code: direct };
  const code = codeInLink(trimmed);
  return code === null ? { kind: 'invalid' } : { kind: 'code', code };
}

function codeInLink(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const code = url.searchParams.get(PAIRING_LINK_PARAM);
  return code !== null && isPairingCode(code) ? code : null;
}

/** 二维码的内容：网页地址可以被其他设备打开时是带配对码的地址，否则（如本地文件）只是配对码 */
export function pairingQrText(pageUrl: string, code: string): string {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return code;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return code;
  url.search = '';
  url.hash = '';
  url.searchParams.set(PAIRING_LINK_PARAM, code);
  return url.href;
}

export interface PairingLink {
  readonly code: string;
  /** 去掉配对码参数后的地址（保留 hash 路由） */
  readonly cleanUrl: string;
}

/** 打开应用时地址中的配对码（例如用系统相机扫描了二维码） */
export function readPairingLink(pageUrl: string): PairingLink | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  const code = url.searchParams.get(PAIRING_LINK_PARAM);
  if (code === null) return null;
  url.searchParams.delete(PAIRING_LINK_PARAM);
  const normalized = normalizePairingInput(code);
  return isPairingCode(normalized) ? { code: normalized, cleanUrl: url.href } : null;
}
