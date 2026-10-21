/**
 * 答案比较键：判分（F-025）与答案去重共用同一套规则，保证“看起来不同、判分时却等价”的答案不会重复存放。
 *
 * - 不区分大小写（ẞ → ß；德语没有特殊的区域大小写规则，因此用比 toLocaleLowerCase 快得多的 toLowerCase）；
 * - 标点视为空格（沿用原版：jm. bei etw. helfen 与 jm bei etw helfen 等价）；
 * - 变音字母不做替换：ä 与 ae、ß 与 ss 互不等价（已确认的决定）。
 */
import { normalizeText } from './text';

const PUNCTUATION = /[=!?.,/#$%^&*;:{}\-_`~()（）[\]+，。：；！？、“”„‟"'‘’‚\\]/gu;

export function answerKey(text: string): string {
  return normalizeText(text.toLowerCase().replace(PUNCTUATION, ' '));
}
