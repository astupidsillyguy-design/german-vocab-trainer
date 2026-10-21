import { PAIRING_CODE_LENGTH } from '../../shared/pairing';

const GROUP_LENGTH = PAIRING_CODE_LENGTH / 2;

/** 配对码分成两组显示（“123 456”），便于念给对方或对照输入 */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, GROUP_LENGTH)} ${code.slice(GROUP_LENGTH)}`;
}

/** 读屏逐位朗读（“1 2 3 4 5 6”），而不是读成一个六位数 */
export function spokenDigits(code: string): string {
  return code.replace(/(?<=\d)(?=\d)/gu, ' ');
}
